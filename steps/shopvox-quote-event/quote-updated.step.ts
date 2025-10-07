import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxQuote } from "../../schemas/quote.schema";
import { wrikeService } from "../../services/wrike.service";
import { shopvoxService } from "../../services/shopvox.service";

export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-quote-updated",
    description: "Processes a ShopVox quote updated event",
    subscribes: ["quote:updated"],
    emits: ["quote-updated-in-wrike", "quote-created-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-quote-updated"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    logger.info("Processing quote updated event", { input });

    const changes = input.changes;
    logger.info("Quote updated changes:", { changes });
    
    let quote: ShopVoxQuote;
    try {
        quote = await shopvoxService.getQuote(input.id);
        logger.info("Quote retrieved from ShopVox");
    } catch (error) {
        logger.error("Error getting quote from ShopVox", { 
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : error, 
        });
        return;
    }

    // Create or update task in Wrike
    try {

        const oldResponsibles: string[] = [];
        const newResponsibles: string[] = [];

        if (input.changes?.primary_sales_rep_id) {
            oldResponsibles.push(input.changes.primary_sales_rep_id[0] as string);
            newResponsibles.push(input.changes.primary_sales_rep_id[1] as string);
        }
        const { taskId, wasCreated } = await wrikeService.createOrUpdateQuoteTask(quote, false, oldResponsibles, newResponsibles); // Use proper status mapping for updated quotes
        
        if (wasCreated) {
            logger.info("Wrike task created for quote", { taskId });
            await emit({
                topic: "quote-created-in-wrike"
            } as never);
        } else {
            logger.info("Wrike task updated for quote", { taskId });
        }
    } catch (error) {
        logger.error("Error creating or updating quote in Wrike", { 
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : error,
        });
        return;
    }
    await emit({
        topic: "quote-updated-in-wrike"
    } as never);
}