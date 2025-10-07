import { ApiRouteConfig, Handlers } from "motia";
import { z } from "zod";

export const config: ApiRouteConfig = {
  type: "api",
  name: "shopvox-webhook",
  path: "/api/webhooks/shopvox",
  method: "POST",
  emits: [
    "quote:created",
    "quote:updated",
    "quote:destroyed",
    "work_order:created",
    "work_order:updated",
    "work_order:destroyed",
  ],
  flows: ["shopvox-to-wrike"],
  bodySchema: z.object({
    event_object: z.string(),
    event_action: z.string(),
    timestamp: z.number(),
    webhook_token: z.string(),
    event: z.object({
      id: z.string(),
      name: z.string(),
    }),
  }),
};

export const handler: Handlers["shopvox-webhook"] = async (
  req,
  { emit, logger }
) => {
  const { event_object, event_action, webhook_token, event } = req.body;

  if (webhook_token !== process.env.SHOPVOX_WEBHOOK_TOKEN) {
    logger.error("Invalid webhook token");
    return {
      status: 401,
      body: {
        message: "Invalid webhook token",
      },
    };
  }

  const eventString = `${event_object}:${event_action}`;

  // switch case to capture invalid event strings
  switch (eventString) {
    case "quote:created":
      break;
    case "quote:updated":
      break;
    case "quote:destroyed":
      break;
    case "work_order:created":
      break;
    case "work_order:updated":
      break;
    case "work_order:destroyed":
      break;
    default:
      logger.error("Invalid event string", { eventString });
      return {
        status: 400,
        body: {
          message: "Invalid event string",
        },
      };
  }

  logger.info("ShopVox event queued for processing", { eventString });

  await emit({
    topic: eventString,
    data: event,
  });

  return {
    status: 200,
  };
};
