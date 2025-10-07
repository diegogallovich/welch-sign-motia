import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";

export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-quote-destroyed",
    description: "Processes a ShopVox quote deleted event",
    subscribes: ["quote:destroyed"],
    emits: ["quote-voided-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-quote-destroyed"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    logger.info("Processing quote deleted event", { input });
    
    try {
        // TODO: Mark quote as void in Wrike
        await emit({
            topic: "quote-voided-in-wrike"
        } as never)
    } catch (error) {
        logger.error("Error voiding quote in Wrike", { 
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : error,
            quoteId: input.id,
            input,
            traceId 
        });
        return;
    }
}