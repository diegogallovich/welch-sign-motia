import { EventConfig, FlowContext, Handlers } from "motia";
import { z } from "zod";
import { shopvoxService } from "../../services/shopvox.service";
import { addLogToState, addDataToState } from "../../utils/state-logger";
import { normalizeDateForComparison } from "../../utils/date-normalizer";

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
    wrikeTaskId: z.string(),
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
      await addDataToState(
        state,
        traceId,
        "wrike",
        "taskId",
        input.wrikeTaskId
      );

      // Loop prevention: Check if ShopVox already has the correct date
      await addLogToState(
        state,
        traceId,
        "info",
        "Checking current ShopVox due date for loop prevention",
        { salesOrderId: input.shopVoxSalesOrderId }
      );

      try {
        const currentSalesOrder = await shopvoxService.getSalesOrder(
          input.shopVoxSalesOrderId
        );

        // Normalize dates for comparison
        const wrikeDueDate = normalizeDateForComparison(input.dueDate);
        const shopvoxDueDate = normalizeDateForComparison(
          currentSalesOrder.dueDate
        );

        if (wrikeDueDate === shopvoxDueDate && wrikeDueDate !== "") {
          await addLogToState(
            state,
            traceId,
            "info",
            "Skipping ShopVox update - due dates already match, preventing loop",
            { wrikeDueDate, shopvoxDueDate }
          );
          logger.info(
            "Skipping ShopVox update - due dates already match, preventing loop"
          );

          // Emit success finality event even though we skipped
          await emit({
            topic: "finality:target-install-date-updated-success",
            data: {
              traceId,
              result: {
                shopVoxSalesOrderId: input.shopVoxSalesOrderId,
                dueDate: input.dueDate,
                skipped: true,
                reason: "loop_prevention",
              },
            },
          } as never);
          return; // Exit early to break the loop
        } else {
          await addLogToState(
            state,
            traceId,
            "info",
            "Due dates differ, proceeding with ShopVox update",
            { wrikeDueDate, shopvoxDueDate }
          );
          logger.info("Due dates differ, proceeding with ShopVox update");
        }
      } catch (error) {
        const warnMessage = `Loop detection check failed, proceeding with normal update: ${
          error instanceof Error ? error.message : String(error)
        }`;
        await addLogToState(state, traceId, "warn", warnMessage, {
          salesOrderId: input.shopVoxSalesOrderId,
        });
        logger.warn(warnMessage);
        // Continue with normal flow if loop detection fails
      }

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
          result: {
            shopVoxSalesOrderId: input.shopVoxSalesOrderId,
            dueDate: input.dueDate,
          },
        },
      } as never);
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
      } as never);
    }
  };
