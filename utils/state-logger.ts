import { InternalStateManager } from "motia";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  metadata?: any;
}

interface FlowState {
  logs: LogEntry[];
  data: {
    shopvox?: any;
    wrike?: any;
  };
}

/**
 * Adds a log entry to the state for a given trace
 */
export async function addLogToState(
  state: InternalStateManager,
  traceId: string,
  level: "info" | "warn" | "error",
  message: string,
  metadata?: any
): Promise<void> {
  try {
    // Get existing logs or initialize empty array
    const existingLogs =
      (await state.get<LogEntry[]>(traceId, "logs.entries")) || [];

    // Create new log entry
    const newLog: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(metadata && { metadata }),
    };

    // Append the new log
    existingLogs.push(newLog);

    // Store back to state
    await state.set(traceId, "logs.entries", existingLogs);
  } catch (error) {
    console.error("Failed to add log to state:", error);
  }
}

/**
 * Stores data from external sources (ShopVox, Wrike) to state
 */
export async function addDataToState(
  state: InternalStateManager,
  traceId: string,
  source: "shopvox" | "wrike",
  dataType: string,
  data: any
): Promise<void> {
  try {
    const key = `data.${source}.${dataType}`;
    await state.set(traceId, key, data);
  } catch (error) {
    console.error(`Failed to add ${source} data to state:`, error);
  }
}

/**
 * Retrieves all flow state including logs and data for a trace
 */
export async function getFlowState(
  state: InternalStateManager,
  traceId: string
): Promise<FlowState> {
  try {
    // Get all logs
    const logs = (await state.get<LogEntry[]>(traceId, "logs.entries")) || [];

    // Get ShopVox data - try common keys
    const shopvoxQuote = await state.get(traceId, "data.shopvox.quote");
    const shopvoxSalesOrder = await state.get(
      traceId,
      "data.shopvox.salesOrder"
    );

    // Get Wrike data - try common keys
    const wrikeTask = await state.get(traceId, "data.wrike.task");
    const wrikeCustomFields = await state.get(
      traceId,
      "data.wrike.customFields"
    );

    // Consolidate data
    const shopvoxData: any = {};
    if (shopvoxQuote) shopvoxData.quote = shopvoxQuote;
    if (shopvoxSalesOrder) shopvoxData.salesOrder = shopvoxSalesOrder;

    const wrikeData: any = {};
    if (wrikeTask) wrikeData.task = wrikeTask;
    if (wrikeCustomFields) wrikeData.customFields = wrikeCustomFields;

    return {
      logs,
      data: {
        ...(Object.keys(shopvoxData).length > 0 && { shopvox: shopvoxData }),
        ...(Object.keys(wrikeData).length > 0 && { wrike: wrikeData }),
      },
    };
  } catch (error) {
    console.error("Failed to get flow state:", error);
    return {
      logs: [],
      data: {},
    };
  }
}

/**
 * Clears all state for a given trace (useful for cleanup after notifications)
 */
export async function clearFlowState(
  state: InternalStateManager,
  traceId: string
): Promise<void> {
  try {
    await state.clear(traceId);
  } catch (error) {
    console.error("Failed to clear flow state:", error);
  }
}
