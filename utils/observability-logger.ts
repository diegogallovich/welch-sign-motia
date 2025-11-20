import { postgresService } from "../services/postgres.service";

/**
 * Derives a human-readable flow name from the step name
 */
function getFlowNameFromStep(stepName?: string): string {
  if (!stepName) return "Unknown Flow";

  const flowMap: Record<string, string> = {
    "process-shopvox-quote-created": "ShopVox Quote → Wrike",
    "process-shopvox-quote-updated": "ShopVox Quote → Wrike",
    "process-shopvox-quote-destroyed": "ShopVox Quote → Wrike",
    "process-shopvox-work-order-created": "ShopVox Work Order → Wrike",
    "process-shopvox-work-order-updated": "ShopVox Work Order → Wrike",
    "process-shopvox-work-order-deleted": "ShopVox Work Order → Wrike",
    "process-wrike-woso-user-field-changed":
      "Wrike User Field Update → ShopVox",
    "flow-notification-handler": "Flow Notification Handler",
  };

  return flowMap[stepName] || "Motia Workflow";
}

/**
 * Derives flow type from step name
 */
function getFlowTypeFromStep(stepName?: string): string {
  if (!stepName) return "unknown";

  if (stepName.includes("wrike-woso")) {
    return "wrike-to-shopvox";
  } else if (
    stepName.includes("shopvox-quote") ||
    stepName.includes("shopvox-work-order")
  ) {
    return "shopvox-to-wrike";
  } else if (stepName.includes("notification")) {
    return "notification";
  }

  return "unknown";
}

/**
 * Categorizes errors into standardized categories
 */
function categorizeError(
  error: Error | string | unknown
): "api_error" | "validation_error" | "timeout" | "unknown" {
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  if (
    errorMessage.includes("timeout") ||
    errorMessage.includes("ETIMEDOUT") ||
    errorMessage.includes("AbortError")
  ) {
    return "timeout";
  }

  if (
    errorMessage.includes("API") ||
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("HTTP") ||
    errorMessage.includes("status")
  ) {
    return "api_error";
  }

  if (
    errorMessage.includes("validation") ||
    errorMessage.includes("invalid") ||
    errorMessage.includes("required")
  ) {
    return "validation_error";
  }

  return "unknown";
}

/**
 * Extract lightweight input summary (IDs only, not full payloads)
 */
function extractInputSummary(input: any): Record<string, any> | undefined {
  if (!input) return undefined;

  const summary: Record<string, any> = {};

  // Extract common ID fields
  if (input.id) summary.id = input.id;
  if (input.salesOrderId) summary.salesOrderId = input.salesOrderId;
  if (input.quoteId) summary.quoteId = input.quoteId;
  if (input.taskId) summary.taskId = input.taskId;
  if (input.event_object) summary.eventObject = input.event_object;
  if (input.event_action) summary.eventAction = input.event_action;

  return Object.keys(summary).length > 0 ? summary : undefined;
}

/**
 * Logs flow execution start event (non-blocking)
 */
export function logFlowStart(
  traceId: string,
  stepName: string,
  input?: any
): void {
  const flowName = getFlowNameFromStep(stepName);
  const flowType = getFlowTypeFromStep(stepName);
  const inputSummary = extractInputSummary(input);

  postgresService
    .logFlowStart(traceId, flowName, flowType, inputSummary)
    .catch((err) =>
      console.warn("PostgreSQL flow start logging failed:", err?.message)
    );
}

/**
 * Logs flow execution completion event (non-blocking)
 */
export function logFlowComplete(
  traceId: string,
  stepName: string,
  success: boolean,
  durationMs?: number,
  error?: Error | string | unknown
): void {
  const status = success ? "success" : "failed";
  const errorCategory = error ? categorizeError(error) : undefined;

  postgresService
    .logFlowComplete(traceId, status, durationMs, error as any, errorCategory)
    .catch((err) =>
      console.warn("PostgreSQL flow complete logging failed:", err?.message)
    );
}

/**
 * Logs step start event (non-blocking)
 */
export function logStepStart(
  traceId: string,
  stepName: string,
  metadata?: any
): void {
  // Extract only essential metadata (IDs and key identifiers)
  const lightMetadata = metadata
    ? {
        ...(metadata.salesOrderId && { salesOrderId: metadata.salesOrderId }),
        ...(metadata.quoteId && { quoteId: metadata.quoteId }),
        ...(metadata.taskId && { taskId: metadata.taskId }),
        ...(metadata.operation && { operation: metadata.operation }),
      }
    : undefined;

  postgresService
    .logStepStart(traceId, stepName, lightMetadata)
    .catch((err) =>
      console.warn("PostgreSQL step start logging failed:", err?.message)
    );
}

/**
 * Logs step completion event (non-blocking)
 */
export function logStepComplete(
  traceId: string,
  stepName: string,
  durationMs: number,
  metadata?: any
): void {
  // Extract only essential metadata
  const lightMetadata = metadata
    ? {
        ...(metadata.salesOrderId && { salesOrderId: metadata.salesOrderId }),
        ...(metadata.quoteId && { quoteId: metadata.quoteId }),
        ...(metadata.taskId && { taskId: metadata.taskId }),
        ...(metadata.wasCreated !== undefined && {
          wasCreated: metadata.wasCreated,
        }),
        ...(metadata.skipped !== undefined && { skipped: metadata.skipped }),
        ...(metadata.reason && { reason: metadata.reason }),
      }
    : undefined;

  const skipReason = metadata?.skipped ? metadata.reason : undefined;

  postgresService
    .logStepComplete(
      traceId,
      stepName,
      metadata?.skipped ? "skipped" : "success",
      durationMs,
      undefined,
      undefined,
      skipReason,
      lightMetadata
    )
    .catch((err) =>
      console.warn("PostgreSQL step complete logging failed:", err?.message)
    );
}

/**
 * Logs step error event (non-blocking)
 */
export function logStepError(
  traceId: string,
  stepName: string,
  error: Error | string | unknown,
  durationMs?: number,
  metadata?: any
): void {
  const errorCategory = categorizeError(error);

  // Extract only essential metadata
  const lightMetadata = metadata
    ? {
        ...(metadata.salesOrderId && { salesOrderId: metadata.salesOrderId }),
        ...(metadata.quoteId && { quoteId: metadata.quoteId }),
        ...(metadata.taskId && { taskId: metadata.taskId }),
        ...(metadata.operation && { operation: metadata.operation }),
      }
    : undefined;

  postgresService
    .logStepComplete(
      traceId,
      stepName,
      "failed",
      durationMs,
      error as any,
      errorCategory,
      undefined,
      lightMetadata
    )
    .catch((err) =>
      console.warn("PostgreSQL step error logging failed:", err?.message)
    );
}

/**
 * Logs external API call event (non-blocking)
 */
export function logApiCall(
  traceId: string,
  stepName: string | null,
  service: "wrike" | "shopvox" | "mailgun" | "other",
  operation: string,
  durationMs: number,
  success: boolean,
  httpStatus?: number,
  error?: Error | string | unknown
): void {
  const status = success
    ? "success"
    : error?.toString().includes("timeout")
    ? "timeout"
    : "failed";

  postgresService
    .logApiCall(
      traceId,
      stepName,
      service,
      operation,
      durationMs,
      status,
      httpStatus,
      error as any
    )
    .catch((err) =>
      console.warn("PostgreSQL API call logging failed:", err?.message)
    );
}

