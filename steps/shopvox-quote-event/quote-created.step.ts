import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxQuote } from "../../schemas/quote.schema";
import { wrikeService } from "../../services/wrike.service";
import { shopvoxService } from "../../services/shopvox.service";
import { addLogToState, addDataToState } from "../../utils/state-logger";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-quote-created",
  description: "Processes a ShopVox quote created event",
  subscribes: ["quote:created"],
  emits: ["finality:quote-created-success", "finality:error:quote-created"],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-quote-created"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  await addLogToState(
    state,
    traceId,
    "info",
    "Processing quote created event",
    {
      step: "process-shopvox-quote-created",
      quoteId: input.id,
    }
  );
  logger.info("Processing quote created event");

  let quote: ShopVoxQuote;
  try {
    // Retrieve quote from ShopVox
    quote = await shopvoxService.getQuote(input.id);
    await addDataToState(state, traceId, "shopvox", "quote", quote);
    await addLogToState(
      state,
      traceId,
      "info",
      "Quote retrieved from ShopVox",
      {
        quoteId: quote.id,
        quoteTitle: quote.title,
      }
    );
    logger.info("Quote retrieved from ShopVox");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      `Failed to retrieve quote from ShopVox API (quote ID: ${input.id})`,
      {
        error: errorMessage,
        stack: errorStack,
        quoteId: input.id,
      }
    );
    logger.error(
      `Failed to retrieve quote from ShopVox API (quote ID: ${input.id}): ${errorMessage}`
    );

    // Emit error finality event
    await emit({
      topic: "finality:error:quote-created",
      data: {
        traceId,
        error: {
          message: `ShopVox API fetch failed: ${errorMessage}`,
          stack: errorStack,
          step: "process-shopvox-quote-created",
          operation: "fetch_quote_from_shopvox",
        },
        input,
      },
    } as never);
    return;
  }

  try {
    // Create Wrike task
    await addLogToState(
      state,
      traceId,
      "info",
      "Creating Wrike task for quote",
      {
        quoteId: quote.id,
      }
    );
    logger.info("Creating Wrike task for quote");

    const createResult = await wrikeService.createQuoteTask(quote);
    const taskId = createResult.data[0].id;
    await addDataToState(state, traceId, "wrike", "task", createResult);
    await addLogToState(
      state,
      traceId,
      "info",
      "Quote task created in Wrike successfully",
      { taskId }
    );
    logger.info("Quote task created in Wrike successfully");

    // Emit success finality event
    await emit({
      topic: "finality:quote-created-success",
      data: { traceId, quoteId: quote.id, taskId },
    } as never);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      `Failed to create task in Wrike API (quote ID: ${quote.id})`,
      {
        error: errorMessage,
        stack: errorStack,
        quoteId: quote.id,
      }
    );
    logger.error(
      `Failed to create task in Wrike API (quote ID: ${quote.id}): ${errorMessage}`
    );

    // Emit error finality event
    await emit({
      topic: "finality:error:quote-created",
      data: {
        traceId,
        error: {
          message: `Wrike API operation failed: ${errorMessage}`,
          stack: errorStack,
          step: "process-shopvox-quote-created",
          operation: "create_wrike_task",
        },
        input,
      },
    } as never);
  }
};
