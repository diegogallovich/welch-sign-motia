import { EventConfig, Handlers, FlowContext } from "motia";
import { ShopVoxEventSchema } from "../../schemas/shopvox-event.schema";
import { shopvoxService } from "../../services/shopvox.service";
import { wrikeService } from "../../services/wrike.service";
import { ShopVoxSalesOrder } from "../../schemas/sales-order.schema";
import { addLogToState, addDataToState } from "../../utils/state-logger";

export const config: EventConfig = {
  type: "event",
  name: "process-shopvox-work-order-created",
  description: "Processes a ShopVox work order created event",
  subscribes: ["work_order:created"],
  emits: [
    "finality:work-order-created-success",
    "finality:error:work-order-created",
  ],
  input: ShopVoxEventSchema,
  flows: ["shopvox-to-wrike"],
};

export const handler: Handlers["process-shopvox-work-order-created"] = async (
  input,
  { emit, logger, state, traceId }: FlowContext
) => {
  await addLogToState(
    state,
    traceId,
    "info",
    "Processing work order created event",
    {
      step: "process-shopvox-work-order-created",
      salesOrderId: input.id,
    }
  );
  logger.info("Processing work order created event");

  let salesOrder: ShopVoxSalesOrder;
  try {
    // Retrieve sales order from ShopVox
    salesOrder = await shopvoxService.getSalesOrder(input.id);
    await addDataToState(state, traceId, "shopvox", "salesOrder", salesOrder);
    await addLogToState(
      state,
      traceId,
      "info",
      "Sales order retrieved from ShopVox",
      {
        salesOrderId: salesOrder.id,
        salesOrderTitle: salesOrder.title,
      }
    );
    logger.info("Sales order retrieved from ShopVox");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      `Failed to retrieve sales order from ShopVox API (sales order ID: ${input.id})`,
      {
        error: errorMessage,
        stack: errorStack,
        salesOrderId: input.id,
      }
    );
    logger.error(
      `Failed to retrieve sales order from ShopVox API (sales order ID: ${input.id}): ${errorMessage}`
    );

    // Emit error finality event
    await emit({
      topic: "finality:error:work-order-created",
      data: {
        traceId,
        error: {
          message: `ShopVox API fetch failed: ${errorMessage}`,
          stack: errorStack,
          step: "process-shopvox-work-order-created",
        },
        result: {
          operation: "fetch_sales_order_from_shopvox",
        },
        input,
      },
    } as never);
    return;
  }

  try {
    // Create or update the WoSo task in Wrike
    await addLogToState(
      state,
      traceId,
      "info",
      "Creating or updating WoSo task in Wrike",
      { salesOrderId: salesOrder.id }
    );
    const result = await wrikeService.createOrUpdateWosoTask(salesOrder);
    await addDataToState(state, traceId, "wrike", "task", result);
    await addLogToState(
      state,
      traceId,
      "info",
      "Work order task processed in Wrike successfully",
      { taskId: result.taskId, wasCreated: result.wasCreated }
    );
    logger.info("Work order task processed in Wrike successfully");

    // Emit success finality event
    await emit({
      topic: "finality:work-order-created-success",
      data: {
        traceId,
        result: {
          salesOrderId: salesOrder.id,
          taskId: result.taskId,
        },
      },
    } as never);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await addLogToState(
      state,
      traceId,
      "error",
      `Failed to create/update WoSo task in Wrike API (sales order ID: ${salesOrder.id})`,
      {
        error: errorMessage,
        stack: errorStack,
        salesOrderId: salesOrder.id,
      }
    );
    logger.error(
      `Failed to create/update WoSo task in Wrike API (sales order ID: ${salesOrder.id}): ${errorMessage}`
    );

    // Emit error finality event
    await emit({
      topic: "finality:error:work-order-created",
      data: {
        traceId,
        error: {
          message: `Wrike API operation failed: ${errorMessage}`,
          stack: errorStack,
          step: "process-shopvox-work-order-created",
        },
        result: {
          operation: "create_or_update_woso_task",
        },
        input,
      },
    } as never);
  }
};
