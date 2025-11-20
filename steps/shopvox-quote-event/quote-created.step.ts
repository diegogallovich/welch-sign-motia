import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxQuote } from "../../schemas/quote.schema";
import { wrikeService } from "../../services/wrike.service";
import { shopvoxService } from "../../services/shopvox.service";
import { addLogToState, addDataToState } from "../../utils/state-logger";
import {
  logFlowStart,
  logFlowComplete,
  logStepStart,
  logStepComplete,
  logStepError,
} from "../../utils/observability-logger";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-quote-created",
  description: "Processes a ShopVox quote created event",
  subscribes: ["quote:created"],
  emits: ["finality:error:quote-created"],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-quote-created"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  const stepStartTime = Date.now();
  const stepName = "process-shopvox-quote-created";

  // Log flow and step start
  logFlowStart(traceId, stepName, input);
  logStepStart(traceId, stepName, { quoteId: input.id });

  await addLogToState(
    state,
    traceId,
    "info",
    "Processing quote created event",
    {
      step: stepName,
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
          step: stepName,
          operation: "fetch_quote_from_shopvox",
        },
        input,
      },
    } as never);

    // Log error
    const durationMs = Date.now() - stepStartTime;
    logStepError(traceId, stepName, error, durationMs, {
      quoteId: input.id,
      operation: "fetch_quote_from_shopvox",
    });
    logFlowComplete(traceId, stepName, false, durationMs, error);
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

    // Log success
    const durationMs = Date.now() - stepStartTime;
    logStepComplete(traceId, stepName, durationMs, {
      quoteId: quote.id,
      taskId,
    });
    logFlowComplete(traceId, stepName, true, durationMs);
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
          step: stepName,
          operation: "create_wrike_task",
        },
        input,
      },
    } as never);

    // Log error
    const durationMs = Date.now() - stepStartTime;
    logStepError(traceId, stepName, error, durationMs, {
      quoteId: quote.id,
      operation: "create_wrike_task",
    });
    logFlowComplete(traceId, stepName, false, durationMs, error);
  }
};
