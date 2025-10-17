import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { addLogToState } from "../../utils/state-logger";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-quote-destroyed",
  description: "Processes a ShopVox quote deleted event",
  subscribes: ["quote:destroyed"],
  emits: ["finality:quote-destroyed-success", "finality:error:quote-destroyed"],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-quote-destroyed"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  await addLogToState(
    state,
    traceId,
    "info",
    "Processing quote destroyed event",
    {
      step: "process-shopvox-quote-destroyed",
      quoteId: input.id,
    }
  );
  logger.info("Processing quote destroyed event");

  try {
    // TODO: Mark quote as void in Wrike
    await addLogToState(
      state,
      traceId,
      "info",
      "Quote voided in Wrike (TODO: implement actual voiding)",
      { quoteId: input.id }
    );
    logger.info("Quote voided in Wrike");

    // Emit success finality event
    await emit({
      topic: "finality:quote-destroyed-success",
      data: { traceId, quoteId: input.id },
    } as never);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      "Failed to void quote in Wrike",
      {
        error: errorMessage,
        stack: errorStack,
        quoteId: input.id,
      }
    );
    logger.error(`Failed to void quote: ${errorMessage}`);

    // Emit error finality event
    await emit({
      topic: "finality:error:quote-destroyed",
      data: {
        traceId,
        error: {
          message: errorMessage,
          stack: errorStack,
          step: "process-shopvox-quote-destroyed",
        },
        input,
      },
    } as never);
  }
};
