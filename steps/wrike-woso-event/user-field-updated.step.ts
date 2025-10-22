import { EventConfig, FlowContext, Handlers } from "motia";
import { z } from "zod";
// import { shopvoxService } from "../../services/shopvox.service";
import { addLogToState, addDataToState } from "../../utils/state-logger";
import { mapWrikeApiV2IdToShopVoxUserId } from "../../utils/user-mapping";

export const config: EventConfig = {
  type: "event",
  name: "process-wrike-woso-user-field-changed",
  description: "Processes a Wrike WoSo user field changed event",
  subscribes: ["wrike-woso-user-field-changed"],
  emits: [],
  input: z.object({
    shopVoxSalesOrderId: z.string(),
    fieldType: z.enum([
      "estimator",
      "salesRep",
      "projectManager",
      "productionManager",
    ]),
    apiV2Ids: z.string(), // Comma-separated string from Wrike
  }),
  flows: ["wrike-to-shopvox"],
};

export const handler: Handlers["process-wrike-woso-user-field-changed"] =
  async (input, { logger, state, traceId }: FlowContext) => {
    await addLogToState(
      state,
      traceId,
      "info",
      `Processing ${input.fieldType} field change from Wrike`,
      {
        step: "process-wrike-woso-user-field-changed",
        shopVoxSalesOrderId: input.shopVoxSalesOrderId,
        fieldType: input.fieldType,
        rawApiV2Ids: input.apiV2Ids,
      }
    );
    logger.info(`Processing ${input.fieldType} field change from Wrike`);

    try {
      // Store input data to state
      await addDataToState(state, traceId, "wrike", "userFieldUpdate", input);

      // Parse the API v2 IDs from the value string
      // Wrike sends them as comma-separated string, possibly with quotes
      const cleanedIds = input.apiV2Ids
        .replace(/^"/, "")
        .replace(/"$/, "")
        .trim();

      if (!cleanedIds) {
        await addLogToState(
          state,
          traceId,
          "info",
          "Empty value received, skipping update",
          {
            fieldType: input.fieldType,
          }
        );
        logger.info("Empty value received, skipping update");

        return;
      }

      const idArray = cleanedIds.split(",").map((id) => id.trim());

      // Only process if exactly one ID is present
      if (idArray.length !== 1) {
        await addLogToState(
          state,
          traceId,
          "warn",
          `Expected exactly one user ID, got ${idArray.length}. Skipping update.`,
          {
            fieldType: input.fieldType,
            idCount: idArray.length,
            ids: idArray,
          }
        );
        logger.warn(
          `Expected exactly one user ID for ${input.fieldType}, got ${idArray.length}. Skipping update.`
        );

        return;
      }

      const wrikeApiV2Id = idArray[0];

      // Map the Wrike API v2 ID to ShopVox user ID
      const shopVoxUserId = mapWrikeApiV2IdToShopVoxUserId(wrikeApiV2Id);

      await addLogToState(
        state,
        traceId,
        "info",
        `Mapped Wrike API v2 ID to ShopVox user ID`,
        {
          wrikeApiV2Id,
          shopVoxUserId,
          fieldType: input.fieldType,
        }
      );

      // Build the update object based on field type
      const updates: {
        estimatorId?: string;
        primarySalesRepId?: string;
        productionManagerId?: string;
        projectManagerId?: string;
      } = {};

      switch (input.fieldType) {
        case "estimator":
          updates.estimatorId = shopVoxUserId;
          break;
        case "salesRep":
          updates.primarySalesRepId = shopVoxUserId;
          break;
        case "projectManager":
          updates.projectManagerId = shopVoxUserId;
          break;
        case "productionManager":
          updates.productionManagerId = shopVoxUserId;
          break;
      }

      await addLogToState(
        state,
        traceId,
        "info",
        `Updating ${input.fieldType} in ShopVox`,
        {
          salesOrderId: input.shopVoxSalesOrderId,
          fieldType: input.fieldType,
          shopVoxUserId,
        }
      );

      // Update the sales order in ShopVox
      // await shopvoxService.updateSalesOrder(input.shopVoxSalesOrderId, updates);

      await addLogToState(
        state,
        traceId,
        "info",
        `${input.fieldType} updated in ShopVox successfully`,
        {
          salesOrderId: input.shopVoxSalesOrderId,
          fieldType: input.fieldType,
          shopVoxUserId,
        }
      );
      logger.info(`${input.fieldType} updated in ShopVox successfully`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      await addLogToState(
        state,
        traceId,
        "error",
        `Failed to update ${input.fieldType} in ShopVox`,
        {
          error: errorMessage,
          stack: errorStack,
          salesOrderId: input.shopVoxSalesOrderId,
          fieldType: input.fieldType,
        }
      );
      logger.error(`Failed to update ${input.fieldType}: ${errorMessage}`);
    }
  };
