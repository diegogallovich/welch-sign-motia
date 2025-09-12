import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";

export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-sales-order-deleted",
    description: "Processes a ShopVox sales order deleted event",
    subscribes: ["sales_order:deleted"],
    emits: ["sales-order-deleted-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-sales-order-deleted"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    try {
        // TODO: Delete Sales Order from Wrike
        await emit({
            topic: "sales-order-deleted-in-wrike"
        } as never)
    } catch (error) {
        logger.error("Error deleting sales order from Wrike", { error, traceId });
        return;
    }
}