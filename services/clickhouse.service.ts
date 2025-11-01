import { createClient, ClickHouseClient } from "@clickhouse/client";

interface ExecutionEvent {
  traceId: string;
  flowName: string;
  stepName: string;
  eventType: string;
  status: string;
  errorCategory?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  metadata?: string;
  durationMs?: number | null;
  externalService?: string | null;
  eventTimestamp: Date;
}

class ClickHouseService {
  private client: ClickHouseClient | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const url = process.env.CLICKHOUSE_URL;
    const username = process.env.CLICKHOUSE_USER;
    const password = process.env.CLICKHOUSE_PASSWORD;

    if (!url || !username || !password) {
      console.warn(
        "ClickHouse credentials not fully configured. Reliability logging will be disabled."
      );
      console.warn(
        "Required: CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD"
      );
      return;
    }

    try {
      this.client = createClient({
        url,
        username,
        password,
      });
      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize ClickHouse client:", error);
      this.client = null;
    }
  }

  private async executeQuery(query: string, params?: any): Promise<void> {
    if (!this.client || !this.isInitialized) {
      return; // Silently fail if not configured
    }

    try {
      await this.client.exec({
        query,
        query_params: params || {},
      });
    } catch (error) {
      // Log but don't throw - reliability logging should never break execution
      console.error("ClickHouse query failed:", error);
    }
  }

  async logEvent(event: ExecutionEvent): Promise<void> {
    if (!this.client || !this.isInitialized) {
      return;
    }

    const query = `
      INSERT INTO execution_events (
        id, trace_id, flow_name, step_name, event_type, status,
        error_category, error_message, error_code, metadata,
        duration_ms, external_service, event_timestamp, created_at
      ) VALUES (
        generateUUIDv4(),
        {traceId: String},
        {flowName: String},
        {stepName: String},
        {eventType: String},
        {status: String},
        {errorCategory: Nullable(String)},
        {errorMessage: Nullable(String)},
        {errorCode: Nullable(String)},
        {metadata: String},
        {durationMs: Nullable(UInt64)},
        {externalService: Nullable(String)},
        {eventTimestamp: DateTime},
        now()
      )
    `;

    await this.executeQuery(query, {
      traceId: event.traceId,
      flowName: event.flowName,
      stepName: event.stepName,
      eventType: event.eventType,
      status: event.status,
      errorCategory: event.errorCategory || null,
      errorMessage: event.errorMessage || null,
      errorCode: event.errorCode || null,
      metadata: event.metadata || "{}",
      durationMs: event.durationMs || null,
      externalService: event.externalService || null,
      eventTimestamp: event.eventTimestamp,
    });
  }

  async logExecutionStart(
    traceId: string,
    flowName: string
  ): Promise<void> {
    await this.logEvent({
      traceId,
      flowName,
      stepName: "",
      eventType: "execution_started",
      status: "running",
      eventTimestamp: new Date(),
    });
  }

  async logExecutionComplete(
    traceId: string,
    flowName: string,
    success: boolean,
    durationMs?: number,
    errorMessage?: string,
    errorCategory?: string
  ): Promise<void> {
    await this.logEvent({
      traceId,
      flowName,
      stepName: "",
      eventType: success ? "execution_completed" : "execution_failed",
      status: success ? "success" : "failed",
      errorCategory: success ? null : (errorCategory || "unknown"),
      errorMessage: success ? null : (errorMessage || "Execution failed"),
      durationMs: durationMs || null,
      eventTimestamp: new Date(),
    });
  }

  async logStepEvent(
    traceId: string,
    flowName: string,
    stepName: string,
    eventType: "step_started" | "step_completed" | "step_failed",
    status: "running" | "success" | "failed",
    durationMs?: number,
    errorMessage?: string,
    errorCategory?: string,
    errorCode?: string
  ): Promise<void> {
    await this.logEvent({
      traceId,
      flowName,
      stepName,
      eventType,
      status,
      errorCategory: status === "failed" ? (errorCategory || "unknown") : null,
      errorMessage: status === "failed" ? (errorMessage || "Step failed") : null,
      errorCode: status === "failed" ? (errorCode || null) : null,
      durationMs: durationMs || null,
      eventTimestamp: new Date(),
    });
  }

  async logExternalApiCall(
    traceId: string,
    flowName: string,
    stepName: string,
    externalService: "wrike" | "shopvox",
    operation: string,
    durationMs: number,
    success: boolean,
    errorMessage?: string,
    errorCode?: string
  ): Promise<void> {
    await this.logEvent({
      traceId,
      flowName,
      stepName,
      eventType: "api_call",
      status: success ? "success" : "failed",
      errorCategory: success ? null : "api_error",
      errorMessage: success ? null : (errorMessage || "API call failed"),
      errorCode: success ? null : (errorCode || null),
      metadata: JSON.stringify({ operation, externalService }),
      durationMs,
      externalService,
      eventTimestamp: new Date(),
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}

export const clickHouseService = new ClickHouseService();

