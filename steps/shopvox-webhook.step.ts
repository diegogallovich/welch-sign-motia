import { ApiRouteConfig, Handlers } from "motia";
import { z } from "zod";

export const config: ApiRouteConfig = {
    type: "api",
    name: "shopvox-webhook",
    path: "/api/webhooks/shopvox",
    method: "POST",
    emits: [
        "invoice:created", "invoice:updated", "invoice:deleted", "invoice:destroyed",
        "sales_order:created", "sales_order:updated", "sales_order:deleted", "sales_order:destroyed",
        "quote:created", "quote:updated", "quote:deleted", "quote:destroyed",
        "job:created", "job:updated", "job:deleted", "job:destroyed",
        "job_step:changed",
        "work_order:created", "work_order:updated", "work_order:deleted", "work_order:destroyed",
        "company:created", "company:updated", "company:deleted", "company:destroyed",
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
        })
    })
}

export const handler: Handlers["shopvox-webhook"] = async (req, { emit, logger }) => {
    const { event_object, event_action, webhook_token, event } = req.body;

    if (webhook_token !== process.env.SHOPVOX_WEBHOOK_TOKEN) {
        logger.error("Invalid webhook token");
        return {
            status: 401,
            body: {
                message: "Invalid webhook token"
            }
        };
    }

    const eventString = `${event_object}:${event_action}`;
    logger.info("ShopVox event queued for processing", { eventString })

    await emit({
        topic: eventString,
        data: event
    } as never)

    return {
        status: 200
    }
}