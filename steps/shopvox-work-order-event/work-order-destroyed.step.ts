import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { addLogToState } from "../../utils/state-logger";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-work-order-deleted",
  description: "Processes a ShopVox work order deleted event",
  subscribes: ["work_order:destroyed"],
  emits: [
    "finality:work-order-destroyed-success",
    "finality:error:work-order-destroyed",
  ],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-work-order-deleted"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  await addLogToState(
    state,
    traceId,
    "info",
    "Processing work order destroyed event",
    {
      step: "process-shopvox-work-order-deleted",
      salesOrderId: input.id,
    }
  );
  logger.info("Processing work order destroyed event");

  try {
    // TODO: Implement actual work order deletion/marking in Wrike
    await addLogToState(
      state,
      traceId,
      "info",
      "Work order destroyed event processed (TODO: implement deletion in Wrike)",
      { salesOrderId: input.id }
    );
    logger.info("Work order deleted event emitted");

    // Emit success finality event
    await emit({
      topic: "finality:work-order-destroyed-success",
      data: { traceId, salesOrderId: input.id },
    } as never);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      "Failed to process work order destroyed event",
      {
        error: errorMessage,
        stack: errorStack,
        salesOrderId: input.id,
      }
    );
    logger.error(`Failed to process work order destroyed: ${errorMessage}`);

    // Emit error finality event
    await emit({
      topic: "finality:error:work-order-destroyed",
      data: {
        traceId,
        error: {
          message: errorMessage,
          stack: errorStack,
          step: "process-shopvox-work-order-deleted",
        },
        input,
      },
    } as never);
  }
};
