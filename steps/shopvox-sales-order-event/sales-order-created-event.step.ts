import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { ShopVoxSalesOrder } from "schemas/sales-order.schema";

export const config: EventConfig = {
    type: "event",
    name: "process-shopvox-sales-order-created",
    description: "Processes a ShopVox sales order created event",
    subscribes: ["sales_order:created"],
    emits: ["sales-order-created-in-wrike"],
    input: ShopVoxEventSchema,
    flows: ["shopvox-to-wrike"],
}

export const handler: Handlers["process-shopvox-sales-order-created"] = async (input, { emit, logger, state, traceId}: FlowContext) => {
    let salesOrder: ShopVoxSalesOrder;
    try {
        // const salesOrderResponse = await fetch(`https://api.shopvox.com/v1/sales_orders/${input.id}?account_id=${process.env.SHOPVOX_ACCOUNT_ID}&authToken=${process.env.SHOPVOX_AUTH_TOKEN}`, {
        //     method: "GET",
        //     headers: {
        //         "Content-Type": "application/json"
        //     }
        // });

        // salesOrder = await salesOrderResponse.json();
        // logger.info("Sales order retrieved from ShopVox", { salesOrder, traceId });

        // prettify input and display fully
        const inputJson = JSON.stringify(input, null, 2);
        logger.info("Sales order created event", { inputJson, traceId });
    } catch (error) {
        logger.error("Error getting sales order from ShopVox", { error, traceId });
        return;
    }
    
    try {
        // TODO: Add Sales Order to Wrike
        await emit({
            topic: "sales-order-created-in-wrike"
        } as never)
    } catch (error) {
        logger.error("Error adding sales order to Wrike", { error, traceId });
        return;
    }
}