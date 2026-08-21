/**
 * Per-tool usage analytics for the hosted worker.
 *
 * Cloudflare's built-in metrics count HTTP invocations, which for an MCP server
 * is one number for every tool combined — the tool name lives in the JSON-RPC
 * body. This records a data point per call so the questions that actually
 * matter ("how many calls", "which tools", "which clients") can be answered.
 *
 * Column layout, referenced positionally by the SQL API. Do not reorder — the
 * queries in stats.ts and any saved dashboards depend on it.
 *
 *   index1  : tool name (or method when there is no tool) — the sampling key
 *   blob1   : JSON-RPC method            e.g. "tools/call", "initialize"
 *   blob2   : tool name                  e.g. "get_ticker", "" for non-tool calls
 *   blob3   : client name                from initialize's clientInfo, else "unknown"
 *   blob4   : "ok" | "error"
 *   double1 : latency in milliseconds
 *   double2 : HTTP status code
 */

/** Minimal shape of the Analytics Engine binding, to avoid a types dependency. */
export interface AnalyticsEngineDataset {
  writeDataPoint(event: {
    indexes?: string[];
    blobs?: (string | null)[];
    doubles?: number[];
  }): void;
}

export interface McpCallRecord {
  method: string;
  tool: string;
  client: string;
  status: 'ok' | 'error';
  httpStatus: number;
  latencyMs: number;
}

/** What a JSON-RPC request body tells us before the handler runs. */
export interface McpRequestInfo {
  method: string;
  tool: string;
  client: string;
}

/**
 * Extract the method, tool and client from a JSON-RPC body. Returns safe
 * defaults for anything unparseable — analytics must never break a request.
 */
export function parseMcpRequest(body: string): McpRequestInfo {
  const empty: McpRequestInfo = { method: 'unknown', tool: '', client: 'unknown' };

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return empty;
  }

  // Batched requests: attribute the batch to its first entry.
  const message = Array.isArray(payload) ? payload[0] : payload;
  if (!message || typeof message !== 'object') return empty;

  const record = message as Record<string, unknown>;
  const params = (record.params ?? {}) as Record<string, unknown>;
  const clientInfo = (params.clientInfo ?? {}) as Record<string, unknown>;

  return {
    method: typeof record.method === 'string' ? record.method : 'unknown',
    tool: typeof params.name === 'string' ? params.name : '',
    client: typeof clientInfo.name === 'string' ? clientInfo.name : 'unknown',
  };
}

/**
 * Write one data point. Silently does nothing when the binding is absent, so
 * local runs and tests need no configuration.
 */
export function recordMcpCall(
  dataset: AnalyticsEngineDataset | undefined,
  record: McpCallRecord
): void {
  if (!dataset) return;

  try {
    dataset.writeDataPoint({
      // Analytics Engine accepts exactly one index; more than one drops the point.
      indexes: [(record.tool || record.method).slice(0, 96)],
      blobs: [record.method, record.tool, record.client, record.status],
      doubles: [record.latencyMs, record.httpStatus],
    });
  } catch {
    // Never let telemetry take down a request.
  }
}
