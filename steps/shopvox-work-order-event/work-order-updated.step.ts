import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxSalesOrder } from "../../schemas/sales-order.schema";
import { shopvoxService } from "../../services/shopvox.service";
import { wrikeService } from "../../services/wrike.service";
import { WRIKE_CUSTOM_FIELDS } from "../../constants/wrike-fields";
import { addLogToState, addDataToState } from "../../utils/state-logger";

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
        salesOrderName: salesOrder.name,
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
          operation: "fetch_sales_order_from_shopvox",
        },
        input,
      },
    });
    return;
  }

  try {
    // Loop detection: Check if only dueDate changed and if Wrike already has the correct value
    if (input.changes) {
      const changeKeys = Object.keys(input.changes);
      const isOnlyDueDateChange =
        changeKeys.length === 1 && changeKeys[0] === "dueDate";

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
                  salesOrderId: salesOrder.id,
                  skipped: true,
                  reason: "loop_prevention",
                },
              });
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
        salesOrderId: salesOrder.id,
        taskId: result.taskId,
        wasCreated: result.wasCreated,
      },
    });
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
          operation: "create_or_update_woso_task",
        },
        input,
      },
    });
  }
};
