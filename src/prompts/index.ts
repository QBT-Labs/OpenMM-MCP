import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTradingPrompts } from './trading.js';
import { registerAnalysisPrompts } from './analysis.js';

export function registerPrompts(server: McpServer): void {
  registerTradingPrompts(server);
  registerAnalysisPrompts(server);
}