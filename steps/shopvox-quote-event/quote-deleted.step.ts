import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";

export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-quote-deleted",
    description: "Processes a ShopVox quote deleted event",
    subscribes: ["quote:deleted"],
    emits: ["quote-deleted-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-quote-deleted"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    try {
        // TODO: Delete Quote from Wrike
        await emit({
            topic: "quote-deleted-in-wrike"
        } as never)
    } catch (error) {
        logger.error("Error deleting quote from Wrike", { error, traceId });
        return;
    }
}