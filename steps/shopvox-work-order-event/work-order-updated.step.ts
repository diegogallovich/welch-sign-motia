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
  logger.info("Processing work order updated event");

  let salesOrder: ShopVoxSalesOrder;
  try {
    salesOrder = await shopvoxService.getSalesOrder(input.id);
  } catch (error) {
    logger.error(
      `Failed to retrieve sales order ID ${input.id} from ShopVox: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }

  // Loop detection: Check if only dueDate changed and if Wrike already has the correct value
  if (input.changes) {
    const changeKeys = Object.keys(input.changes);
    const isOnlyDueDateChange =
      changeKeys.length === 1 && changeKeys[0] === "dueDate";

    if (isOnlyDueDateChange) {
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
            logger.info(
              "Skipping Wrike update - due dates already match, preventing loop"
            );
            return; // Exit early to break the loop
          } else {
            logger.info("Due dates differ, proceeding with Wrike update");
          }
        } else {
          logger.info("No existing Wrike task found, creating new one");
        }
      } catch (error) {
        logger.warn(
          `Loop detection check failed, proceeding with normal update: ${
            error instanceof Error ? error.message : String(error)
          }`
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
    logger.info("Work order task processed in Wrike successfully");

    await emit({
      topic: "work-order-updated-in-wrike",
      taskId: result.taskId,
      wasCreated: result.wasCreated,
      salesOrderId: salesOrder.id,
      customFields: result.customFields,
    } as never);
  } catch (error) {
    logger.error(
      `Failed to process work order in Wrike for sales order ID ${
        salesOrder.id
      }: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
};
