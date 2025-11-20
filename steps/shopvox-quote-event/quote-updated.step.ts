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
  name: "process-shopvox-quote-updated",
  description: "Processes a ShopVox quote updated event",
  subscribes: ["quote:updated"],
  emits: ["finality:error:quote-updated"],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-quote-updated"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  const stepStartTime = Date.now();
  const stepName = "process-shopvox-quote-updated";

  // Log flow and step start
  logFlowStart(traceId, stepName, input);
  logStepStart(traceId, stepName, { quoteId: input.id, changes: input.changes });

  await addLogToState(
    state,
    traceId,
    "info",
    "Processing quote updated event",
    {
      step: stepName,
      quoteId: input.id,
      changes: input.changes,
    }
  );
  logger.info("Processing quote updated event");

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
      topic: "finality:error:quote-updated",
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
    // Prepare responsibles
    const oldResponsibles: string[] = [];
    const newResponsibles: string[] = [];

    if (input.changes?.primary_sales_rep_id) {
      oldResponsibles.push(input.changes.primary_sales_rep_id[0] as string);
      newResponsibles.push(input.changes.primary_sales_rep_id[1] as string);
      await addLogToState(state, traceId, "info", "Detected sales rep change", {
        oldResponsibles,
        newResponsibles,
      });
    }

    // Create or update task in Wrike
    await addLogToState(
      state,
      traceId,
      "info",
      "Creating or updating Wrike task for quote",
      { quoteId: quote.id }
    );
    const { taskId, wasCreated } = await wrikeService.createOrUpdateQuoteTask(
      quote,
      oldResponsibles,
      newResponsibles
    );

    await addDataToState(state, traceId, "wrike", "task", {
      taskId,
      wasCreated,
    });
    if (wasCreated) {
      await addLogToState(
        state,
        traceId,
        "info",
        "Wrike task created for quote",
        { taskId }
      );
      logger.info("Wrike task created for quote");
    } else {
      await addLogToState(
        state,
        traceId,
        "info",
        "Wrike task updated for quote",
        { taskId }
      );
      logger.info("Wrike task updated for quote");
    }

    // Log success
    const durationMs = Date.now() - stepStartTime;
    logStepComplete(traceId, stepName, durationMs, {
      quoteId: quote.id,
      taskId,
      wasCreated,
    });
    logFlowComplete(traceId, stepName, true, durationMs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      `Failed to create/update task in Wrike API (quote ID: ${quote.id})`,
      {
        error: errorMessage,
        stack: errorStack,
        quoteId: quote.id,
      }
    );
    logger.error(
      `Failed to create/update task in Wrike API (quote ID: ${quote.id}): ${errorMessage}`
    );

    // Emit error finality event
    await emit({
      topic: "finality:error:quote-updated",
      data: {
        traceId,
        error: {
          message: `Wrike API operation failed: ${errorMessage}`,
          stack: errorStack,
          step: stepName,
          operation: "create_or_update_wrike_task",
        },
        input,
      },
    } as never);

    // Log error
    const durationMs = Date.now() - stepStartTime;
    logStepError(traceId, stepName, error, durationMs, {
      quoteId: quote.id,
      operation: "create_or_update_wrike_task",
    });
    logFlowComplete(traceId, stepName, false, durationMs, error);
  }
};
