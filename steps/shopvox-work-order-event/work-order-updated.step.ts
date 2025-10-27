import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxSalesOrder } from "../../schemas/sales-order.schema";
import { shopvoxService } from "../../services/shopvox.service";
import { wrikeService } from "../../services/wrike.service";
import { WRIKE_CUSTOM_FIELDS } from "../../constants/wrike-fields";
import { addLogToState, addDataToState } from "../../utils/state-logger";
import {
  mapShopVoxToWrikeUserId,
  mapShopVoxUserIdToWrikeApiV2Id,
} from "../../utils/user-mapping";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-work-order-updated",
  description: "Processs a ShopVox work order updated event",
  subscribes: ["work_order:updated"],
  emits: [
    "finality:work-order-updated-success",
    "finality:error:work-order-updated",
  ],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-work-order-updated"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  await addLogToState(
    state,
    traceId,
    "info",
    "Processing work order updated event",
    {
      step: "process-shopvox-work-order-updated",
      salesOrderId: input.id,
      changes: input.changes,
    }
  );
  logger.info("Processing work order updated event");

  logger.info("changes", input.changes);

  let salesOrder: ShopVoxSalesOrder;
  try {
    // Retrieve sales order from ShopVox
    salesOrder = await shopvoxService.getSalesOrder(input.id);
    await addDataToState(state, traceId, "shopvox", "salesOrder", salesOrder);
    await addLogToState(
      state,
      traceId,
      "info",
      "Sales order retrieved from ShopVox",
      {
        salesOrderId: salesOrder.id,
        salesOrderTitle: salesOrder.title,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      `Failed to retrieve sales order from ShopVox API (sales order ID: ${input.id})`,
      {
        error: errorMessage,
        stack: errorStack,
        salesOrderId: input.id,
      }
    );
    logger.error(
      `Failed to retrieve sales order from ShopVox API (sales order ID: ${input.id}): ${errorMessage}`
    );

    // Emit error finality event
    await emit({
      topic: "finality:error:work-order-updated",
      data: {
        traceId,
        error: {
          message: `ShopVox API fetch failed: ${errorMessage}`,
          stack: errorStack,
          step: "process-shopvox-work-order-updated",
        },
        result: {
          operation: "fetch_sales_order_from_shopvox",
        },
        input,
      },
    } as never);
    return;
  }

  try {
    // Loop detection: Check if only dueDate changed and if Wrike already has the correct value
    if (input.changes) {
      const changeKeys = Object.keys(input.changes);
      const isOnlyDueDateChange =
        changeKeys.length === 2 && changeKeys[1] === "due_date";

      if (isOnlyDueDateChange) {
        await addLogToState(
          state,
          traceId,
          "info",
          "Detected due date-only change, checking Wrike for loop prevention",
          { salesOrderId: salesOrder.id }
        );
        logger.info(
          "Detected due date-only change, checking Wrike for loop prevention"
        );

        try {
          // Query the Wrike task to get current custom fields
          const taskSearchResult = await wrikeService.findTaskBySalesOrderId(
            salesOrder.id
          );

          if (taskSearchResult.data.length > 0) {
            const wrikeTask = taskSearchResult.data[0];

            // Extract the Target Install Date custom field from Wrike
            const targetInstallDateField = wrikeTask.customFields?.find(
              (cf: any) => cf.id === WRIKE_CUSTOM_FIELDS.TARGET_INSTALL_DATE
            );
            const wrikeTargetInstallDate = targetInstallDateField?.value;

            // Compare dates (normalize to ensure accurate comparison)
            const shopvoxDueDate = salesOrder.dueDate?.trim() || "";
            const wrikeDueDate = wrikeTargetInstallDate?.trim() || "";

            if (shopvoxDueDate === wrikeDueDate) {
              await addLogToState(
                state,
                traceId,
                "info",
                "Skipping Wrike update - due dates already match, preventing loop",
                { shopvoxDueDate, wrikeDueDate }
              );
              logger.info(
                "Skipping Wrike update - due dates already match, preventing loop"
              );

              // Emit success finality event even though we skipped
              await emit({
                topic: "finality:work-order-updated-success",
                data: {
                  traceId,
                  result: {
                    salesOrderId: salesOrder.id,
                    skipped: true,
                    reason: "loop_prevention",
                  },
                },
              } as never);
              return; // Exit early to break the loop
            } else {
              await addLogToState(
                state,
                traceId,
                "info",
                "Due dates differ, proceeding with Wrike update",
                { shopvoxDueDate, wrikeDueDate }
              );
              logger.info("Due dates differ, proceeding with Wrike update");
            }
          } else {
            await addLogToState(
              state,
              traceId,
              "info",
              "No existing Wrike task found, creating new one",
              { salesOrderId: salesOrder.id }
            );
            logger.info("No existing Wrike task found, creating new one");
          }
        } catch (error) {
          const warnMessage = `Loop detection check failed, proceeding with normal update: ${
            error instanceof Error ? error.message : String(error)
          }`;
          await addLogToState(state, traceId, "warn", warnMessage, {
            salesOrderId: salesOrder.id,
          });
          logger.warn(warnMessage);
          // Continue with normal flow if loop detection fails
        }
      }
    }

    // Loop detection: Check if only user field changed and if Wrike already has the correct value
    if (input.changes) {
      const changeKeys = Object.keys(input.changes);

      // Check if exactly 2 properties changed (updated_at + one user field)
      if (changeKeys.length === 2 && changeKeys.includes("updated_at")) {
        const userFieldKey = changeKeys.find((key) => key !== "updated_at");
        const userFieldMapping: Record<
          string,
          { wrikeCustomFieldId: string; fieldName: string }
        > = {
          estimator_id: {
            wrikeCustomFieldId: WRIKE_CUSTOM_FIELDS.ESTIMATOR,
            fieldName: "estimator",
          },
          primary_sales_rep_id: {
            wrikeCustomFieldId: WRIKE_CUSTOM_FIELDS.SALES_REP,
            fieldName: "sales rep",
          },
          project_manager_id: {
            wrikeCustomFieldId: WRIKE_CUSTOM_FIELDS.PROJECT_MANAGER,
            fieldName: "project manager",
          },
        };

        if (userFieldKey && userFieldMapping[userFieldKey]) {
          const fieldInfo = userFieldMapping[userFieldKey];
          await addLogToState(
            state,
            traceId,
            "info",
            `Detected ${fieldInfo.fieldName}-only change, checking Wrike for loop prevention`,
            { salesOrderId: salesOrder.id, userFieldKey }
          );
          logger.info(
            `Detected ${fieldInfo.fieldName}-only change, checking Wrike for loop prevention`
          );

          try {
            // Query the Wrike task to get current custom fields
            const taskSearchResult = await wrikeService.findTaskBySalesOrderId(
              salesOrder.id
            );

            if (taskSearchResult.data.length > 0) {
              const wrikeTask = taskSearchResult.data[0];

              // Extract the user custom field from Wrike
              const userCustomField = wrikeTask.customFields?.find(
                (cf: any) => cf.id === fieldInfo.wrikeCustomFieldId
              );
              const rawWrikeUserValue = userCustomField?.value;

              // Clean and parse the Wrike value (remove quotes, split by comma)
              const wrikeUserValue = rawWrikeUserValue
                ?.replace(/^"/, "")
                .replace(/"$/, "")
                .trim();
              const wrikeUserIds = wrikeUserValue
                ? wrikeUserValue.split(",").map((id: string) => id.trim())
                : [];

              // Get the new value from changes (second element of the tuple)
              const newShopVoxUserId = (input.changes as any)[
                userFieldKey
              ]?.[1];

              if (newShopVoxUserId) {
                // Convert ShopVox user ID to both Wrike formats
                const wrikeUserId = mapShopVoxToWrikeUserId(newShopVoxUserId);
                const wrikeApiV2Id =
                  mapShopVoxUserIdToWrikeApiV2Id(newShopVoxUserId);

                await addLogToState(
                  state,
                  traceId,
                  "info",
                  `Comparing Wrike ${fieldInfo.fieldName} value with ShopVox change`,
                  {
                    rawWrikeUserValue,
                    wrikeUserValue,
                    wrikeUserIds,
                    wrikeUserId,
                    wrikeApiV2Id,
                    newShopVoxUserId,
                  }
                );

                // Check if Wrike value matches either format
                // Handle both single value and comma-separated list cases
                const matchesWrikeUserId = wrikeUserIds.includes(wrikeUserId);
                const matchesWrikeApiV2Id =
                  wrikeApiV2Id && wrikeUserIds.includes(wrikeApiV2Id);

                if (matchesWrikeUserId || matchesWrikeApiV2Id) {
                  await addLogToState(
                    state,
                    traceId,
                    "info",
                    `Skipping Wrike update - ${fieldInfo.fieldName} already matches, preventing loop`,
                    {
                      wrikeUserIds,
                      matchedId: matchesWrikeUserId
                        ? wrikeUserId
                        : wrikeApiV2Id,
                      matchedFormat: matchesWrikeUserId
                        ? "regular user ID"
                        : "API v2 ID",
                    }
                  );
                  logger.info(
                    `Skipping Wrike update - ${fieldInfo.fieldName} already matches, preventing loop`
                  );

                  // Emit success finality event even though we skipped
                  await emit({
                    topic: "finality:work-order-updated-success",
                    data: {
                      traceId,
                      result: {
                        salesOrderId: salesOrder.id,
                        skipped: true,
                        reason: "loop_prevention",
                      },
                    },
                  } as never);
                  return; // Exit early to break the loop
                } else {
                  await addLogToState(
                    state,
                    traceId,
                    "info",
                    `${fieldInfo.fieldName} values differ, proceeding with Wrike update`,
                    { wrikeUserIds, wrikeUserId, wrikeApiV2Id }
                  );
                  logger.info(
                    `${fieldInfo.fieldName} values differ, proceeding with Wrike update`
                  );
                }
              } else {
                await addLogToState(
                  state,
                  traceId,
                  "warn",
                  `Could not extract new ${fieldInfo.fieldName} value from changes`,
                  { userFieldKey, changes: input.changes }
                );
                logger.warn(
                  `Could not extract new ${fieldInfo.fieldName} value from changes`
                );
              }
            } else {
              await addLogToState(
                state,
                traceId,
                "info",
                "No existing Wrike task found, creating new one",
                { salesOrderId: salesOrder.id }
              );
              logger.info("No existing Wrike task found, creating new one");
            }
          } catch (error) {
            const warnMessage = `Loop detection check failed for ${
              fieldInfo.fieldName
            }, proceeding with normal update: ${
              error instanceof Error ? error.message : String(error)
            }`;
            await addLogToState(state, traceId, "warn", warnMessage, {
              salesOrderId: salesOrder.id,
            });
            logger.warn(warnMessage);
            // Continue with normal flow if loop detection fails
          }
        }
      }
    }

    // Create or update the WoSo task in Wrike
    const oldResponsibles: string[] = [];
    const newResponsibles: string[] = [];

    if (input.changes?.project_manager_id) {
      oldResponsibles.push(input.changes.project_manager_id[0] as string);
      newResponsibles.push(input.changes.project_manager_id[1] as string);
      await addLogToState(
        state,
        traceId,
        "info",
        "Detected project manager change",
        { oldResponsibles, newResponsibles }
      );
    }

    await addLogToState(
      state,
      traceId,
      "info",
      "Creating or updating WoSo task in Wrike",
      { salesOrderId: salesOrder.id }
    );
    const result = await wrikeService.createOrUpdateWosoTask(
      salesOrder,
      undefined,
      oldResponsibles,
      newResponsibles
    );
    await addDataToState(state, traceId, "wrike", "task", result);
    await addLogToState(
      state,
      traceId,
      "info",
      "Work order task processed in Wrike successfully",
      {
        taskId: result.taskId,
        wasCreated: result.wasCreated,
        customFields: result.customFields,
      }
    );
    logger.info("Work order task processed in Wrike successfully");

    // Emit success finality event
    await emit({
      topic: "finality:work-order-updated-success",
      data: {
        traceId,
        result: {
          salesOrderId: salesOrder.id,
          taskId: result.taskId,
          wasCreated: result.wasCreated,
        },
      },
    } as never);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      `Failed to create/update WoSo task in Wrike API (sales order ID: ${salesOrder.id})`,
      {
        error: errorMessage,
        stack: errorStack,
        salesOrderId: salesOrder.id,
      }
    );
    logger.error(
      `Failed to create/update WoSo task in Wrike API (sales order ID: ${salesOrder.id}): ${errorMessage}`
    );

    // Emit error finality event
    await emit({
      topic: "finality:error:work-order-updated",
      data: {
        traceId,
        error: {
          message: `Wrike API operation failed: ${errorMessage}`,
          stack: errorStack,
          step: "process-shopvox-work-order-updated",
        },
        result: {
          operation: "create_or_update_woso_task",
        },
        input,
      },
    } as never);
  }
};
