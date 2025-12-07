import { ApiRouteConfig, Handlers } from "motia";
import { z } from "zod";
import { rawBodyCaptureMiddleware } from "../middleware/raw-body-capture.middleware";
import { wrikeService } from "../services/wrike.service";

export const config: ApiRouteConfig = {
  type: "api",
  name: "wrike-shopvox-db-webhook",
  path: "/api/webhooks/wrike/shopvox-db",
  method: "POST",
  emits: ["subtask:created"],
  flows: ["wrike-to-wrike"],
  middleware: [rawBodyCaptureMiddleware],
  bodySchema: z.array(
    z.object({
      webhookId: z.string(),
      eventAuthorId: z.string(),
      eventType: z.literal("TaskCreated"),
      taskId: z.string(),
      lastUpdatedDate: z.string(),
    })
  ) as any,
};

export const handler: Handlers["wrike-shopvox-db-webhook"] = async (
  req: any,
  { logger, emit }: any
) => {
  const verificationResult = wrikeService.verifyWebhookRequest(req);

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

  const { taskId, eventType } = req.body[0];

  logger.info(`Wrike ShopVox DB webhook received: ${eventType}`);

  try {
    const task = await wrikeService.getTaskById(taskId);
    if (task.data.length === 0) {
      logger.warn(`Task not found in Wrike for ID ${taskId}`);
      return {
        status: 404,
        body: { message: "Task not found in Wrike" },
      };
    }

    const superTasks = task.data[0].superTaskIds;
    if (superTasks.length === 0) {
      logger.warn(`Task ${taskId} has no super tasks`);
      return {
        status: 404,
        body: { message: "Task has no super tasks" },
      };
    } else if (superTasks.length > 1) {
      logger.warn(`Task ${taskId} has multiple super tasks`);
      return {
        status: 404,
        body: { message: "Task has multiple super tasks" },
      };
    } else {
      logger.info(
        `Subtask created: ${taskId} with parent task: ${superTasks[0]}`
      );
      await emit({
        topic: "subtask:created",
        data: {
          subtaskId: taskId,
          parentTaskId: superTasks[0],
        },
      });
      return {
        status: 200,
        body: { success: true, subtaskId: taskId, parentTaskId: superTasks[0] },
      };
    }
  } catch (error) {
    logger.error(`Error fetching task from Wrike: ${taskId}`);
    return {
      status: 500,
      body: {
        message: "Error fetching task from Wrike",
      },
    };
  }
};
