import { EventConfig, FlowContext, Handlers } from "motia";
import { z } from "zod";
import { shopvoxService } from "../../services/shopvox.service";

export const config: EventConfig = {
  type: "event",
  name: "process-wrike-woso-target-install-date-changed",
  description: "Processes a Wrike WoSo target install date changed event",
  subscribes: ["wrike-woso-target-install-date-changed"],
  emits: ["updated-woso-due-date-in-shopvox"],
  input: z.object({
    shopVoxSalesOrderId: z.string(),
    dueDate: z.string(),
  }),
  flows: ["wrike-to-shopvox"],
};

export const handler: Handlers["process-wrike-woso-target-install-date-changed"] =
  async (input, { emit, logger, state, traceId }: FlowContext) => {
    logger.info("Processing Wrike WoSo target install date changed event", {
      input,
    });

    try {
      // Update the sales order due date in ShopVox
      await shopvoxService.updateSalesOrder(
        input.shopVoxSalesOrderId,
        input.dueDate
      );

      logger.info("Sales order due date updated in ShopVox", {
        salesOrderId: input.shopVoxSalesOrderId,
        dueDate: input.dueDate,
      });

      await emit({
        topic: "updated-woso-due-date-in-shopvox",
        data: input,
      } as never);
    } catch (error) {
      logger.error("Error updating sales order due date in ShopVox", {
        error,
        traceId,
      });
      return;
    }
  };
