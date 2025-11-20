import { Pool, PoolClient } from "pg";

interface FlowExecution {
  id?: string;
  traceId: string;
  flowName: string;
  flowType: string;
  status: "running" | "success" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  errorCategory?: "api_error" | "validation_error" | "timeout" | "unknown";
  inputSummary?: Record<string, any>;
}

interface StepExecution {
  id?: string;
  executionId: string;
  stepName: string;
  status: "started" | "success" | "failed" | "skipped";
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  errorCategory?: "api_error" | "validation_error" | "timeout" | "unknown";
  skipReason?: string;
  metadata?: Record<string, any>;
}

interface ExternalApiCall {
  executionId: string;
  stepExecutionId?: string;
  service: "wrike" | "shopvox" | "mailgun" | "other";
  operation: string;
  status: "success" | "failed" | "timeout";
  httpStatus?: number;
  durationMs: number;
  errorMessage?: string;
  calledAt?: Date;
}

interface FullExecutionTrace {
  execution: FlowExecution;
  steps: StepExecution[];
  apiCalls: ExternalApiCall[];
}

class PostgresService {
  private pool: Pool | null = null;
  private isInitialized: boolean = false;
  private executionIdCache: Map<string, string> = new Map(); // traceId -> executionId
  private stepExecutionCache: Map<string, string> = new Map(); // traceId:stepName -> stepExecutionId
  private initPromise: Promise<void> | null = null; // Initialization promise

  constructor() {
    this.initPromise = this.initializePool();
  }

  private async initializePool(): Promise<void> {
    const host = process.env.POSTGRESQL_HOST;
    const port = parseInt(process.env.POSTGRESQL_PORT || "5432");
    const database = process.env.POSTGRESQL_DB;
    const user = process.env.POSTGRESQL_USER;
    const password = process.env.POSTGRESQL_PASSWORD;

    if (!host || !database || !user || !password) {
      console.warn(
        "PostgreSQL configuration incomplete. Observability logging will be disabled."
      );
      console.warn(
        "Required: POSTGRESQL_HOST, POSTGRESQL_DB, POSTGRESQL_USER, POSTGRESQL_PASSWORD"
      );
      return;
    }

    try {
      this.pool = new Pool({
        host,
        port,
        database,
        user,
        password,
        max: 20, // Maximum pool size
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 5000, // Fail fast if connection takes too long
        // Always use SSL for secure connections
        ssl: {
          rejectUnauthorized: false, // Accept self-signed certificates
        },
      });

      // Test connection and wait for it
      const client = await this.pool.connect();
      console.log("PostgreSQL connection pool initialized successfully (SSL enabled)");
      client.release();
      this.isInitialized = true;

      // Handle pool errors gracefully
      this.pool.on("error", (err) => {
        console.warn("PostgreSQL pool error (non-fatal):", err.message);
      });
    } catch (error) {
      console.error("Failed to create PostgreSQL pool:", error);
      this.pool = null;
    }
  }

  /**
   * Wait for pool initialization to complete
   */
  private async waitForInit(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
    }
    return this.isInitialized && this.pool !== null;
  }

  /**
   * Execute a query with automatic error handling
   * Never throws - always gracefully handles errors
   */
  private async executeQuery<T = any>(
    query: string,
    params: any[] = []
  ): Promise<T | null> {
    if (!this.pool || !this.isInitialized) {
      return null; // Silently skip if not configured
    }

    try {
      const result = await this.pool.query(query, params);
      return result.rows as T;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Only log connection errors once to avoid spam
      if (
        errorMsg.includes("ECONNREFUSED") ||
        errorMsg.includes("ENOTFOUND") ||
        errorMsg.includes("timeout")
      ) {
        console.warn(
          "PostgreSQL connection issue (observability degraded):",
          errorMsg.substring(0, 100)
        );
      } else {
        console.warn("PostgreSQL query failed (non-fatal):", errorMsg);
      }
      return null;
    }
  }

  /**
   * Log the start of a flow execution
   */
  async logFlowStart(
    traceId: string,
    flowName: string,
    flowType: string,
    inputSummary?: Record<string, any>
  ): Promise<string | null> {
    if (!(await this.waitForInit())) return null;

    const query = `
      INSERT INTO flow_executions (trace_id, flow_name, flow_type, status, input_summary, started_at)
      VALUES ($1, $2, $3, 'running', $4, NOW())
      RETURNING id
    `;

    const result = await this.executeQuery<{ id: string }[]>(query, [
      traceId,
      flowName,
      flowType,
      inputSummary ? JSON.stringify(inputSummary) : null,
    ]);

    if (result && result[0]) {
      const executionId = result[0].id;
      this.executionIdCache.set(traceId, executionId);
      return executionId;
    }

    return null;
  }

  /**
   * Log the completion of a flow execution
   */
  async logFlowComplete(
    traceId: string,
    status: "success" | "failed",
    durationMs?: number,
    error?: Error | string,
    errorCategory?: "api_error" | "validation_error" | "timeout" | "unknown"
  ): Promise<void> {
    if (!(await this.waitForInit())) return;

    const errorMessage = error instanceof Error ? error.message : error;
    const query = `
      UPDATE flow_executions
      SET status = $1,
          completed_at = NOW(),
          duration_ms = $2,
          error_message = $3,
          error_category = $4
      WHERE trace_id = $5
    `;

    await this.executeQuery(query, [
      status,
      durationMs || null,
      errorMessage || null,
      status === "failed" ? errorCategory || "unknown" : null,
      traceId,
    ]);

    // Clean up cache
    this.executionIdCache.delete(traceId);
  }

  /**
   * Log the start of a step execution
   */
  async logStepStart(
    traceId: string,
    stepName: string,
    metadata?: Record<string, any>
  ): Promise<string | null> {
    if (!(await this.waitForInit())) return null;

    const executionId = this.executionIdCache.get(traceId);
    if (!executionId) {
      console.warn(
        `No execution ID found for trace ${traceId}. Call logFlowStart first.`
      );
      return null;
    }

    const query = `
      INSERT INTO step_executions (execution_id, step_name, status, metadata, started_at)
      VALUES ($1, $2, 'started', $3, NOW())
      RETURNING id
    `;

    const result = await this.executeQuery<{ id: string }[]>(query, [
      executionId,
      stepName,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    if (result && result[0]) {
      const stepExecutionId = result[0].id;
      this.stepExecutionCache.set(`${traceId}:${stepName}`, stepExecutionId);
      return stepExecutionId;
    }

    return null;
  }

  /**
   * Log the completion of a step execution
   */
  async logStepComplete(
    traceId: string,
    stepName: string,
    status: "success" | "failed" | "skipped",
    durationMs?: number,
    error?: Error | string,
    errorCategory?: "api_error" | "validation_error" | "timeout" | "unknown",
    skipReason?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!(await this.waitForInit())) return;

    const stepExecutionId = this.stepExecutionCache.get(`${traceId}:${stepName}`);
    if (!stepExecutionId) {
      console.warn(
        `No step execution ID found for ${stepName} in trace ${traceId}`
      );
      return;
    }

    const errorMessage = error instanceof Error ? error.message : error;
    const query = `
      UPDATE step_executions
      SET status = $1,
          completed_at = NOW(),
          duration_ms = $2,
          error_message = $3,
          error_category = $4,
          skip_reason = $5,
          metadata = COALESCE($6, metadata)
      WHERE id = $7
    `;

    await this.executeQuery(query, [
      status,
      durationMs || null,
      errorMessage || null,
      status === "failed" ? errorCategory || "unknown" : null,
      skipReason || null,
      metadata ? JSON.stringify(metadata) : null,
      stepExecutionId,
    ]);

    // Clean up cache
    this.stepExecutionCache.delete(`${traceId}:${stepName}`);
  }

  /**
   * Log an external API call
   */
  async logApiCall(
    traceId: string,
    stepName: string | null,
    service: "wrike" | "shopvox" | "mailgun" | "other",
    operation: string,
    durationMs: number,
    status: "success" | "failed" | "timeout",
    httpStatus?: number,
    error?: Error | string
  ): Promise<void> {
    if (!(await this.waitForInit())) return;

    const executionId = this.executionIdCache.get(traceId);
    if (!executionId) {
      // If we don't have an execution ID, skip API call logging
      return;
    }

    const stepExecutionId = stepName
      ? this.stepExecutionCache.get(`${traceId}:${stepName}`)
      : null;

    const errorMessage = error instanceof Error ? error.message : error;
    const query = `
      INSERT INTO external_api_calls (
        execution_id, step_execution_id, service, operation,
        status, http_status, duration_ms, error_message, called_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `;

    await this.executeQuery(query, [
      executionId,
      stepExecutionId || null,
      service,
      operation,
      status,
      httpStatus || null,
      durationMs,
      errorMessage || null,
    ]);
  }

  /**
   * Get full execution trace details
   */
  async getFlowExecution(traceId: string): Promise<FullExecutionTrace | null> {
    if (!this.pool || !this.isInitialized) {
      return null;
    }

    try {
      // Get execution
      const execQuery = `SELECT * FROM flow_executions WHERE trace_id = $1`;
      const execResult = await this.pool.query(execQuery, [traceId]);

      if (execResult.rows.length === 0) {
        return null;
      }

      const execution = execResult.rows[0];
      const executionId = execution.id;

      // Get steps
      const stepsQuery = `
        SELECT * FROM step_executions 
        WHERE execution_id = $1 
        ORDER BY started_at ASC
      `;
      const stepsResult = await this.pool.query(stepsQuery, [executionId]);

      // Get API calls
      const apiCallsQuery = `
        SELECT * FROM external_api_calls 
        WHERE execution_id = $1 
        ORDER BY called_at ASC
      `;
      const apiCallsResult = await this.pool.query(apiCallsQuery, [executionId]);

      return {
        execution,
        steps: stepsResult.rows,
        apiCalls: apiCallsResult.rows,
      };
    } catch (error) {
      console.error("Failed to get flow execution:", error);
      return null;
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isInitialized = false;
    }
  }
}

export const postgresService = new PostgresService();

