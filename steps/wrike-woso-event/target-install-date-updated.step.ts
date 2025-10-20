import { EventConfig, FlowContext, Handlers } from "motia";
import { z } from "zod";
import { shopvoxService } from "../../services/shopvox.service";
import { addLogToState, addDataToState } from "../../utils/state-logger";

export const config: EventConfig = {
  type: "event",
  name: "process-wrike-woso-target-install-date-changed",
  description: "Processes a Wrike WoSo target install date changed event",
  subscribes: ["wrike-woso-target-install-date-changed"],
  emits: [
    "finality:target-install-date-updated-success",
    "finality:error:target-install-date-updated",
  ],
  input: z.object({
    shopVoxSalesOrderId: z.string(),
    dueDate: z.string(),
  }),
  flows: ["wrike-to-shopvox"],
};

export const handler: Handlers["process-wrike-woso-target-install-date-changed"] =
  async (input, { emit, logger, state, traceId }: FlowContext) => {
    await addLogToState(
      state,
      traceId,
      "info",
      "Processing target install date change from Wrike",
      {
        step: "process-wrike-woso-target-install-date-changed",
        shopVoxSalesOrderId: input.shopVoxSalesOrderId,
        newDueDate: input.dueDate,
      }
    );
    logger.info("Processing target install date change from Wrike");

    try {
      // Store input data to state
      await addDataToState(state, traceId, "wrike", "dueDateUpdate", input);

      // Update the sales order due date in ShopVox
      await addLogToState(
        state,
        traceId,
        "info",
        "Updating sales order due date in ShopVox",
        {
          salesOrderId: input.shopVoxSalesOrderId,
          newDueDate: input.dueDate,
        }
      );

      await shopvoxService.updateSalesOrder(input.shopVoxSalesOrderId, {
        dueDate: input.dueDate,
      });

      await addLogToState(
        state,
        traceId,
        "info",
        "Sales order due date updated in ShopVox successfully",
        {
          salesOrderId: input.shopVoxSalesOrderId,
          dueDate: input.dueDate,
        }
      );
      logger.info("Sales order due date updated in ShopVox successfully");

      // Emit success finality event
      await emit({
        topic: "finality:target-install-date-updated-success",
        data: {
          traceId,
          shopVoxSalesOrderId: input.shopVoxSalesOrderId,
          dueDate: input.dueDate,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      await addLogToState(
        state,
        traceId,
        "error",
        "Failed to update sales order due date in ShopVox",
        {
          error: errorMessage,
          stack: errorStack,
          salesOrderId: input.shopVoxSalesOrderId,
        }
      );
      logger.error(`Failed to update sales order due date: ${errorMessage}`);

      // Emit error finality event
      await emit({
        topic: "finality:error:target-install-date-updated",
        data: {
          traceId,
          error: {
            message: errorMessage,
            stack: errorStack,
            step: "process-wrike-woso-target-install-date-changed",
          },
          input,
        },
      });
    }
  };
