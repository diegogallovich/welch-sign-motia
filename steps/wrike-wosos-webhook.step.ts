import { ApiRouteConfig, Handlers } from "motia";
import { z } from "zod";
import { wrikeService } from "../services/wrike.service";
import { rawBodyCaptureMiddleware } from "../middleware/raw-body-capture.middleware";
import { WRIKE_CUSTOM_FIELDS } from "../constants/wrike-fields";

export const config: ApiRouteConfig = {
  type: "api",
  name: "wrike-wosos-webhook",
  path: "/api/webhooks/wrike/wosos",
  method: "POST",
  emits: ["wrike-woso-target-install-date-changed"],
  flows: ["wrike-to-shopvox"],
  middleware: [rawBodyCaptureMiddleware],
  bodySchema: z.array(
    z.object({
      customFieldId: z.string(),
      oldValue: z.string().optional(),
      value: z.string().optional(),
      taskId: z.string(),
      webhookId: z.string(),
      eventAuthorId: z.string(),
      eventType: z.literal("TaskCustomFieldChanged"),
      lastUpdatedDate: z.string(),
    })
  ) as any, // Type assertion to satisfy Motia's ZodObject requirement
};

export const handler: Handlers["wrike-wosos-webhook"] = async (
  req: any,
  { logger, emit }: any
) => {
  // First, handle webhook verification - this has a different structure
  const verificationResult = wrikeService.verifyWebhookRequest(req);

  // 1. Handle Wrike's webhook secret verification request
  if (verificationResult.isVerification && verificationResult.isValid) {
    logger.info("Responding to Wrike webhook secret verification");

    return {
      status: 200,
      headers: {
        "X-Hook-Secret": verificationResult.calculatedSecret!,
      },
      body: { success: true },
    };
  }

  // 2. For all other webhook calls, verify the authenticity of the payload
  if (!verificationResult.isVerification) {
    if (!verificationResult.isValid) {
      logger.warn(
        `Wrike webhook verification failed: ${verificationResult.error}`
      );
      return {
        status: 401,
        body: { message: verificationResult.error },
      };
    } else {
      logger.info("Wrike webhook verified successfully");
    }
  }

  // Validate body structure - should be an array of TaskCustomFieldChanged events
  if (!Array.isArray(req.body)) {
    logger.warn("Webhook body is not an array, skipping processing");
    return {
      status: 200,
      body: { message: "Webhook received but not processed" },
    };
  }

  // Validate each event has required fields
  for (const event of req.body) {
    if (!event.eventType || event.eventType !== "TaskCustomFieldChanged") {
      logger.warn(
        `Webhook event type ${event.eventType} not supported, skipping processing`
      );
      return {
        status: 200,
        body: { message: "Webhook received but event type not supported" },
      };
    }
    if (
      !event.taskId ||
      !event.customFieldId ||
      !event.webhookId ||
      !event.eventAuthorId ||
      !event.lastUpdatedDate
    ) {
      logger.warn("Webhook event missing required fields, skipping processing");
      return {
        status: 200,
        body: { message: "Webhook received but event incomplete" },
      };
    }
  }

  // Process validated webhook events
  const wrikeWebhookEvents = process.env.WRIKE_WEBHOOK_EVENTS?.split(",");
  if (!wrikeWebhookEvents) {
    logger.warn("WRIKE_WEBHOOK_EVENTS not configured in environment");
  }

  for (const event of req.body) {
    if (!wrikeWebhookEvents?.includes(event.eventType)) {
      logger.warn(
        `Event type ${event.eventType} not in WRIKE_WEBHOOK_EVENTS whitelist, skipping`
      );
    } else {
      try {
        // Get the task from Wrike to extract custom fields
        const taskResult = await wrikeService.getTaskById(event.taskId);

        if (taskResult.data.length === 0) {
          logger.warn(`Task not found in Wrike for ID ${event.taskId}`);
          continue;
        }

        const task = taskResult.data[0];

        // Extract the ShopVox ID from custom fields
        const shopvoxIdField = task.customFields?.find(
          (cf: any) => cf.id === WRIKE_CUSTOM_FIELDS.SHOPVOX_ID
        );
        const shopvoxId = shopvoxIdField?.value;

        if (!shopvoxId) {
          logger.warn(
            `ShopVox ID not found in task custom fields for task ${event.taskId}`
          );
          continue;
        }

        // Check if this is a Target Install Date change
        const isTargetInstallDateChange =
          event.customFieldId === WRIKE_CUSTOM_FIELDS.TARGET_INSTALL_DATE;

        // Checkk if this is a Project Manager change
        const isProjectManagerChange =
          event.customFieldId === WRIKE_CUSTOM_FIELDS.PROJECT_MANAGER;

        // Check if it is a Sales Rep change
        const isSalesRepChange =
          event.customFieldId === WRIKE_CUSTOM_FIELDS.SALES_REP;

        if (isTargetInstallDateChange) {
          // Extract the new value from the event (this is the updated due date)
          const newDueDate = event.value;

          logger.info(
            `Processing Target Install Date change for task ${event.taskId}`
          );

          // Emit the event with the extracted data
          await emit({
            topic: "wrike-woso-target-install-date-changed",
            data: {
              shopVoxSalesOrderId: shopvoxId,
              dueDate: newDueDate,
            },
          });
        } else if (isSalesRepChange) {
          logger.info(`Sales rep change: ${event.value}`);
          logger.info(JSON.stringify(event, null, 2));
        } else if (isProjectManagerChange) {
          logger.info(`Project manager change: ${event.value}`);
          logger.info(JSON.stringify(event, null, 2));
        } else {
          logger.info(`Ignoring non-Target Install Date custom field change`);
        }
      } catch (error) {
        logger.error(
          `Error processing Wrike webhook event for task ${event.taskId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  return {
    status: 200,
    body: { message: "Webhook processed" },
  };
};
