import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxSalesOrder } from "schemas/sales-order.schema";
import { shopvoxService } from "../../services/shopvox.service";
import { wrikeService } from "../../services/wrike.service";

export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-sales-order-updated",
    description: "Processes a ShopVox sales order updated event",
    subscribes: ["sales_order:updated"],
    emits: ["sales-order-updated-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-sales-order-updated"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    let salesOrder: ShopVoxSalesOrder;
    try {
        // Fetch the sales order from ShopVox
        salesOrder = await shopvoxService.getSalesOrder(input.id);
        logger.info("Sales order retrieved from ShopVox", { salesOrderId: salesOrder.id, traceId });
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

        // Emit event with sales order data and formatted addresses
        await emit({
            topic: "sales-order-updated-in-wrike",
            data: {
                salesOrder,
                customFields: result.customFields,
                taskId: result.taskId,
                wasCreated: result.wasCreated,
                traceId
            }
        } as never);
    } catch (error) {
        logger.error("Error processing sales order for Wrike", { error, traceId });
        return;
    }
}