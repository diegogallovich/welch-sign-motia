import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";


export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-work-order-created",
    description: "Processes a ShopVox work order created event",
    subscribes: ["work_order:created"],
    emits: ["work-order-created-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-work-order-created"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    logger.info("Processing work order created event", { input, traceId });
    
    // prettify input and display fully
    const inputJson = JSON.stringify(input, null, 2);
    logger.info("Work order created event", { inputJson, traceId });

    await emit({
        topic: "work-order-created-in-wrike"
    } as never)
}