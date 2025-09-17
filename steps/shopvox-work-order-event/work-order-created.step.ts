import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { shopvoxService } from "../../services/shopvox.service";
import { wrikeService } from "../../services/wrike.service";
import { ShopVoxSalesOrder } from "../../schemas/sales-order.schema";

export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-work-order-created",
    description: "Processes a ShopVox work order created event",
    subscribes: ["work_order:created"],
    emits: ["work-order-created-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-work-order-created"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    let salesOrder: ShopVoxSalesOrder;
    try {
        salesOrder = await shopvoxService.getSalesOrder(input.id);
        const salesOrderJson = JSON.stringify(salesOrder, null, 2);
        logger.info("Sales order retrieved from ShopVox", { salesOrderJson, traceId });
        
    } catch (error) {
        logger.error("Error getting sales order from ShopVox", { error, traceId });
        return;
    }

    try {
        // Create or update the WoSo task in Wrike (address formatting is handled internally)
        const result = await wrikeService.createOrUpdateWosoTask(salesOrder);
        logger.info("WoSo task processed in Wrike", { 
            taskId: result.taskId, 
            wasCreated: result.wasCreated, 
            salesOrderId: salesOrder.id,
            traceId 
        });

        await emit({
            topic: "work-order-created-in-wrike",
            taskId: result.taskId,
            wasCreated: result.wasCreated,
            salesOrderId: salesOrder.id,
            customFields: result.customFields
        } as never);
        
    } catch (error) {
        logger.error("Error creating/updating WoSo task in Wrike", { error, salesOrderId: salesOrder.id, traceId });
        throw error;
    }
}