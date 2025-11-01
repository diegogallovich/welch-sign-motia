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

    if (!url) {
      console.warn(
        "CLICKHOUSE_URL not set. Reliability logging will be disabled."
      );
      return;
    }

    // Parse URL and extract credentials if needed
    let normalizedHost: string;
    let finalUsername: string;
    let finalPassword: string;

    try {
      let normalizedUrl = url.trim();

      // Remove trailing slash if present
      normalizedUrl = normalizedUrl.replace(/\/$/, "");

      // Handle clickhouse:// protocol (extracts username:password@host:port format)
      if (normalizedUrl.startsWith("clickhouse://")) {
        // Convert clickhouse:// to http:// for parsing
        normalizedUrl = normalizedUrl.replace("clickhouse://", "http://");
      }

      // If URL doesn't have protocol, assume https for ClickHouse Cloud
      if (
        !normalizedUrl.startsWith("http://") &&
        !normalizedUrl.startsWith("https://")
      ) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      // Parse URL to extract components
      const urlObj = new URL(normalizedUrl);

      // Extract username and password from URL if present
      if (urlObj.username && urlObj.password) {
        // Credentials are in the URL
        finalUsername = decodeURIComponent(urlObj.username);
        finalPassword = decodeURIComponent(urlObj.password);
        // Remove credentials from URL for the host
        normalizedHost = `${urlObj.protocol}//${urlObj.hostname}:${
          urlObj.port || ""
        }`;
      } else {
        // Use environment variables for credentials
        finalUsername = username || "";
        finalPassword = password || "";
        normalizedHost = `${urlObj.protocol}//${urlObj.hostname}:${
          urlObj.port || ""
        }`;
      }

      // Remove port if it's empty to avoid double colons
      normalizedHost = normalizedHost.replace(/:(?=\/\/|$)/, "");

      // Set default ports if not specified
      if (!urlObj.port) {
        if (urlObj.protocol === "https:") {
          normalizedHost = normalizedHost.replace(/:$/, ":8443");
        } else {
          normalizedHost = normalizedHost.replace(/:$/, ":8123");
        }
      }

      // Validate that we have credentials
      if (!finalUsername || !finalPassword) {
        console.warn(
          "ClickHouse credentials missing. Check CLICKHOUSE_URL or CLICKHOUSE_USER/CLICKHOUSE_PASSWORD."
        );
        this.client = null;
        return;
      }
    } catch (urlError) {
      console.error("Invalid CLICKHOUSE_URL format:", url);
      console.error(
        "Expected format: clickhouse://user:pass@host:port or https://host:port with CLICKHOUSE_USER/CLICKHOUSE_PASSWORD"
      );
      this.client = null;
      return;
    }

    try {
      this.client = createClient({
        host: normalizedHost,
        username: finalUsername,
        password: finalPassword,
        request_timeout: 30000,
        application: "motia-reliability-monitoring",
      });
      this.isInitialized = true;
      console.log(
        `ClickHouse client initialized successfully (${normalizedHost})`
      );
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
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Only log connection errors once to avoid spam
      if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("ENOTFOUND")) {
        // Connection issues - check configuration
        const url = process.env.CLICKHOUSE_URL;
        if (url) {
          console.error(
            "ClickHouse connection failed. Check CLICKHOUSE_URL:",
            url.substring(0, 50) + "..."
          );
          console.error("Error:", errorMsg);
        } else {
          console.error(
            "ClickHouse connection failed. CLICKHOUSE_URL is not set."
          );
        }
      } else {
        // Other errors (query syntax, etc.)
        console.error("ClickHouse query failed:", errorMsg);
      }
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

  async logExecutionStart(traceId: string, flowName: string): Promise<void> {
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
      errorCategory: success ? null : errorCategory || "unknown",
      errorMessage: success ? null : errorMessage || "Execution failed",
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
      errorCategory: status === "failed" ? errorCategory || "unknown" : null,
      errorMessage: status === "failed" ? errorMessage || "Step failed" : null,
      errorCode: status === "failed" ? errorCode || null : null,
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
      errorMessage: success ? null : errorMessage || "API call failed",
      errorCode: success ? null : errorCode || null,
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
