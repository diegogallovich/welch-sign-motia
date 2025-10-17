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
  // Log request details for debugging
  logger.info("Wrike wosos webhook received", {
    hasBody: !!req.body,
    bodyType: typeof req.body,
    hasRawBody: !!req.rawBody,
    rawBodyType: typeof req.rawBody,
    hasXHookSecret: !!req.headers["x-hook-secret"],
    bodyLength:
      typeof req.body === "string"
        ? req.body.length
        : JSON.stringify(req.body).length,
    rawBodyLength: req.rawBody ? req.rawBody.length : 0,
    eventCount: Array.isArray(req.body) ? req.body.length : 0,
    isVerificationRequest:
      req.body?.requestType === "WebHook secret verification",
    firstEvent:
      Array.isArray(req.body) && req.body.length > 0
        ? {
            eventType: req.body[0]?.eventType,
            taskId: req.body[0]?.taskId,
            customFieldId: req.body[0]?.customFieldId,
          }
        : null,
  });

  // First, handle webhook verification - this has a different structure
  const verificationResult = wrikeService.verifyWebhookRequest(req);

  // Log detailed verification information for debugging
  logger.info("Wrike webhook verification details", {
    isVerification: verificationResult.isVerification,
    isValid: verificationResult.isValid,
    hasError: !!verificationResult.error,
    error: verificationResult.error,
    rawBodyPreview: req.rawBody?.substring(0, 200),
    receivedSignature: req.headers["x-hook-secret"]?.substring(0, 20) + "...",
  });

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

  // Now validate body structure - should be an array of TaskCustomFieldChanged events
  if (!Array.isArray(req.body)) {
    logger.error("Invalid webhook body structure - expected array", {
      body: req.body,
    });
    return {
      status: 400,
      body: {
        message: "Invalid webhook body structure - expected array of events",
      },
    };
  }

  // Validate each event has required fields
  for (const event of req.body) {
    if (!event.eventType || event.eventType !== "TaskCustomFieldChanged") {
      logger.error("Invalid event type in webhook", { event });
      return {
        status: 400,
        body: {
          message: "Invalid event type - expected TaskCustomFieldChanged",
        },
      };
    }
    if (
      !event.taskId ||
      !event.customFieldId ||
      !event.webhookId ||
      !event.eventAuthorId ||
      !event.lastUpdatedDate
    ) {
      logger.error("Missing required fields in webhook event", { event });
      return {
        status: 400,
        body: { message: "Missing required fields in webhook event" },
      };
    }
  }

  // Process validated webhook events
  const wrikeWebhookEvents = process.env.WRIKE_WEBHOOK_EVENTS?.split(",");
  if (!wrikeWebhookEvents) {
    logger.error("Missing WRIKE_WEBHOOK_EVENTS in environment");
  }

  for (const event of req.body) {
    if (!wrikeWebhookEvents?.includes(event.eventType)) {
      logger.error("Wrike webhook event not in WRIKE_WEBHOOK_EVENTS", {
        ["Event Name"]: event.eventType,
      });
    } else {
      try {
        // Get the task from Wrike to extract custom fields
        const taskResult = await wrikeService.getTaskById(event.taskId);

        if (taskResult.data.length === 0) {
          logger.error("Task not found in Wrike", { taskId: event.taskId });
          continue;
        }

        const task = taskResult.data[0];

        // Extract the ShopVox ID from custom fields
        const shopvoxIdField = task.customFields?.find(
          (cf: any) => cf.id === WRIKE_CUSTOM_FIELDS.SHOPVOX_ID
        );
        const shopvoxId = shopvoxIdField?.value;

        if (!shopvoxId) {
          logger.error("ShopVox ID not found in task custom fields", {
            taskId: event.taskId,
            customFields: task.customFields,
          });
          continue;
        }

        // Check if this is a Target Install Date change
        const isTargetInstallDateChange =
          event.customFieldId === WRIKE_CUSTOM_FIELDS.TARGET_INSTALL_DATE;

        if (isTargetInstallDateChange) {
          // Extract the new value from the event (this is the updated due date)
          const newDueDate = event.value;

          logger.info("Processing Target Install Date change for WoSo", {
            eventType: event.eventType,
            taskId: event.taskId,
            customFieldId: event.customFieldId,
            shopvoxId,
            oldValue: event.oldValue,
            newValue: newDueDate,
          });

          // Emit the event with the extracted data
          await emit({
            topic: "wrike-woso-target-install-date-changed",
            data: {
              shopVoxSalesOrderId: shopvoxId,
              dueDate: newDueDate,
            },
          });
        } else {
          logger.info("Ignoring non-Target Install Date custom field change", {
            customFieldId: event.customFieldId,
            taskId: event.taskId,
          });
        }
      } catch (error) {
        logger.error("Error processing Wrike webhook event", {
          error: error instanceof Error ? error.message : String(error),
          event,
        });
      }
    }
  }

  return {
    status: 200,
    body: { message: "Webhook processed" },
  };
};
