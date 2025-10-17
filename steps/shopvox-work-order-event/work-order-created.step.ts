import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { shopvoxService } from "../../services/shopvox.service";
import { wrikeService } from "../../services/wrike.service";
import { ShopVoxSalesOrder } from "../../schemas/sales-order.schema";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-work-order-created",
  description: "Processes a ShopVox work order created event",
  subscribes: ["work_order:created"],
  emits: ["work-order-created-in-wrike"],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-work-order-created"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  logger.info("Processing work order created event");

  let salesOrder: ShopVoxSalesOrder;
  try {
    salesOrder = await shopvoxService.getSalesOrder(input.id);
    logger.info("Sales order retrieved from ShopVox");
  } catch (error) {
    logger.error(
      `Failed to retrieve sales order ID ${input.id} from ShopVox: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }

  try {
    // Create or update the WoSo task in Wrike (address formatting is handled internally)
    await wrikeService.createOrUpdateWosoTask(salesOrder);
    logger.info("Work order task processed in Wrike successfully");

    await emit({
      topic: "work-order-created-in-wrike",
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
