import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxSalesOrder } from "../../schemas/sales-order.schema";
import { shopvoxService } from "../../services/shopvox.service";
import { wrikeService } from "../../services/wrike.service";

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
