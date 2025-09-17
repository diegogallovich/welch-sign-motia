import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";


export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-work-order-deleted",
    description: "Processes a ShopVox work order deleted event",
    subscribes: ["work_order:deleted"],
    emits: ["work-order-updated-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-work-order-deleted"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    logger.info("Processing work order updated event", { input, traceId });
    
    // prettify input and display fully
    const inputJson = JSON.stringify(input, null, 2);
    logger.info("Work order deleted event", { inputJson, traceId });

    await emit({
        topic: "work-order-deleted-in-wrike"
    } as never)
}