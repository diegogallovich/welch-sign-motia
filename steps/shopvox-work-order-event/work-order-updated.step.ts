import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxSalesOrder } from "../../schemas/sales-order.schema";
import { shopvoxService } from "../../services/shopvox.service";
import { wrikeService } from "../../services/wrike.service";
import { WRIKE_CUSTOM_FIELDS } from "../../constants/wrike-fields";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-work-order-updated",
  description: "Processs a ShopVox work order updated event",
  subscribes: ["work_order:updated"],
  emits: ["work-order-updated-in-wrike"],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-work-order-updated"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  const inputJson = JSON.stringify(input, null, 2);
  logger.info("Processing work order updated event", { inputJson });

  let salesOrder: ShopVoxSalesOrder;
  try {
    salesOrder = await shopvoxService.getSalesOrder(input.id);
  } catch (error) {
    logger.error("Error getting sales order from ShopVox", { error, traceId });
    return;
  }

  // Loop detection: Check if only dueDate changed and if Wrike already has the correct value
  if (input.changes) {
    const changeKeys = Object.keys(input.changes);
    const isOnlyDueDateChange =
      changeKeys.length === 1 && changeKeys[0] === "dueDate";

    if (isOnlyDueDateChange) {
      logger.info(
        "Detected dueDate-only change, checking if Wrike already has this value",
        {
          salesOrderId: salesOrder.id,
          newDueDate: salesOrder.dueDate,
        }
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
            logger.info(
              "Skipping Wrike update - Target Install Date already matches",
              {
                salesOrderId: salesOrder.id,
                dueDate: shopvoxDueDate,
                wrikeTaskId: wrikeTask.id,
              }
            );
            return; // Exit early to break the loop
          } else {
            logger.info("Due dates don't match, proceeding with Wrike update", {
              salesOrderId: salesOrder.id,
              shopvoxDueDate,
              wrikeDueDate,
            });
          }
        } else {
          logger.info("No existing Wrike task found, will create new one", {
            salesOrderId: salesOrder.id,
          });
        }
      } catch (error) {
        logger.warn(
          "Error checking Wrike task for loop detection, proceeding with update",
          {
            error: error instanceof Error ? error.message : String(error),
            salesOrderId: salesOrder.id,
          }
        );
        // Continue with normal flow if loop detection fails
      }
    }
  }

  try {
    // Create or update the WoSo task in Wrike (address formatting is handled internally)
    const oldResponsibles: string[] = [];
    const newResponsibles: string[] = [];

    if (input.changes?.project_manager_id) {
      oldResponsibles.push(input.changes.project_manager_id[0] as string);
      newResponsibles.push(input.changes.project_manager_id[1] as string);
    }

    const result = await wrikeService.createOrUpdateWosoTask(
      salesOrder,
      undefined,
      oldResponsibles,
      newResponsibles
    );
    logger.info("WoSo task processed in Wrike");

    await emit({
      topic: "work-order-updated-in-wrike",
      taskId: result.taskId,
      wasCreated: result.wasCreated,
      salesOrderId: salesOrder.id,
      customFields: result.customFields,
    } as never);
  } catch (error) {
    logger.error("Error creating/updating WoSo task in Wrike", {
      error,
      salesOrderId: salesOrder.id,
      traceId,
    });
    throw error;
  }
};
