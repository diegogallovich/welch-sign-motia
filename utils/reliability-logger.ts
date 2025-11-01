import { clickHouseService } from "../services/clickhouse.service";

/**
 * Derives a human-readable flow name from the step name
 * Reused from flow-notification.step.ts pattern
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
    "process-wrike-woso-target-install-date-changed": "Wrike → ShopVox",
    "process-wrike-woso-user-field-changed": "Wrike User Field Update → ShopVox",
  };

  return flowMap[stepName] || "Motia Workflow";
}

/**
 * Categorizes errors into standardized categories
 */
function categorizeError(error: Error | string | unknown): string {
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
 * Logs execution start event (non-blocking)
 */
export function logExecutionStart(
  traceId: string,
  stepName: string
): void {
  const flowName = getFlowNameFromStep(stepName);
  clickHouseService
    .logExecutionStart(traceId, flowName)
    .catch((err) => console.error("ClickHouse log failed:", err));
}

/**
 * Logs step start event (non-blocking)
 */
export function logStepStart(
  traceId: string,
  stepName: string,
  metadata?: any
): void {
  const flowName = getFlowNameFromStep(stepName);
  clickHouseService
    .logStepEvent(traceId, flowName, stepName, "step_started", "running")
    .catch((err) => console.error("ClickHouse log failed:", err));
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
  const flowName = getFlowNameFromStep(stepName);
  clickHouseService
    .logStepEvent(
      traceId,
      flowName,
      stepName,
      "step_completed",
      "success",
      durationMs
    )
    .catch((err) => console.error("ClickHouse log failed:", err));
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
  const flowName = getFlowNameFromStep(stepName);
  const errorMessage =
    error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  const errorCategory = categorizeError(error);

  clickHouseService
    .logStepEvent(
      traceId,
      flowName,
      stepName,
      "step_failed",
      "failed",
      durationMs,
      errorMessage,
      errorCategory,
      undefined
    )
    .catch((err) => console.error("ClickHouse log failed:", err));
}

/**
 * Logs external API call event (non-blocking)
 */
export function logExternalApiCall(
  traceId: string,
  stepName: string,
  externalService: "wrike" | "shopvox",
  operation: string,
  durationMs: number,
  success: boolean,
  error?: Error | string | unknown,
  errorCode?: string
): void {
  const flowName = getFlowNameFromStep(stepName);
  const errorMessage =
    error instanceof Error
      ? error.message
      : error
      ? String(error)
      : undefined;

  clickHouseService
    .logExternalApiCall(
      traceId,
      flowName,
      stepName,
      externalService,
      operation,
      durationMs,
      success,
      errorMessage,
      errorCode
    )
    .catch((err) => console.error("ClickHouse log failed:", err));
}

/**
 * Logs execution completion event (non-blocking)
 */
export function logExecutionComplete(
  traceId: string,
  stepName: string,
  success: boolean,
  durationMs?: number,
  error?: Error | string | unknown
): void {
  const flowName = getFlowNameFromStep(stepName);
  const errorMessage =
    error instanceof Error
      ? error.message
      : error
      ? String(error)
      : undefined;
  const errorCategory = error ? categorizeError(error) : undefined;

  clickHouseService
    .logExecutionComplete(
      traceId,
      flowName,
      success,
      durationMs,
      errorMessage,
      errorCategory
    )
    .catch((err) => console.error("ClickHouse log failed:", err));
}

