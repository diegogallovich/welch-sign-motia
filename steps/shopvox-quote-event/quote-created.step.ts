import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxQuote } from "../../schemas/quote.schema";
import { wrikeService } from "../../services/wrike.service";
import { shopvoxService } from "../../services/shopvox.service";


export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-quote-created",
    description: "Processes a ShopVox quote created event",
    subscribes: ["quote:created"],
    emits: ["quote-created-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-quote-created"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    logger.info("Processing quote created event", { input, traceId });
    
    let quote: ShopVoxQuote;
    try {
        quote = await shopvoxService.getQuote(input.id);
        const quoteId = quote.id;
        logger.info("Quote retrieved from ShopVox", { quoteId });
    } catch (error) {
        logger.error("Error getting quote from ShopVox", { 
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
    
    try {
        logger.info("Creating Wrike task", { quoteId: quote.id, quoteTitle: quote.title, traceId });
        const createResult = await wrikeService.createQuoteTask(quote);
        logger.info("Quote added to Wrike", { createResult, traceId });
        await emit({
            topic: "quote-created-in-wrike"
        } as never)
    } catch (error) {
        logger.error("Error adding quote to Wrike", { 
            error: error instanceof Error ? error.message : String(error), 
            traceId, 
            quoteId: quote.id,
            quoteTitle: quote.title 
        });
        return;
    }
}