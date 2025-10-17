import { ApiMiddleware } from "motia";

/**
 * Middleware to capture raw request body before JSON parsing
 * This is needed for webhook signature verification where we need the exact raw bytes
 */
export const rawBodyCaptureMiddleware: ApiMiddleware = async (
  req,
  ctx,
  next
) => {
  // Store the raw body for signature verification
  // Wrike sends webhooks with pretty-printed JSON (2 spaces)
  if (typeof req.body === "string") {
    (req as any).rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    (req as any).rawBody = req.body.toString();
  } else {
    // Body is already parsed - recreate it in Wrike's format (pretty-printed with 2 spaces)
    (req as any).rawBody = JSON.stringify(req.body, null, 2);
  }

  return next();
};
