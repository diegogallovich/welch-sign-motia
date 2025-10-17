import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-work-order-deleted",
  description: "Processes a ShopVox work order deleted event",
  subscribes: ["work_order:destroyed"],
  emits: ["work-order-updated-in-wrike"],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-work-order-deleted"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  logger.info("Processing work order destroyed event");

  try {
    await emit({
      topic: "work-order-deleted-in-wrike",
    } as never);
    logger.info("Work order deleted event emitted");
  } catch (error) {
    logger.error(
      `Failed to process work order destroyed event for ID ${input.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }
};
