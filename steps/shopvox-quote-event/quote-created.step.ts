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
};

export const handler: Handlers["process-shopvox-quote-created"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  logger.info("Processing quote created event");

  let quote: ShopVoxQuote;
  try {
    quote = await shopvoxService.getQuote(input.id);
    logger.info("Quote retrieved from ShopVox");
  } catch (error) {
    logger.error(
      `Failed to retrieve quote ID ${input.id} from ShopVox: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }

  try {
    logger.info("Creating Wrike task for quote");
    const createResult = await wrikeService.createQuoteTask(quote);
    logger.info("Quote task created in Wrike successfully");
    await emit({
      topic: "quote-created-in-wrike",
    } as never);
  } catch (error) {
    logger.error(
      `Failed to create Wrike task for quote ID ${quote.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }
};
