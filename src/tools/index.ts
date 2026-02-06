import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMarketDataTools } from './market-data.js';
import { registerAccountTools } from './account.js';
import { registerTradingTools } from './trading.js';

export function registerTools(server: McpServer): void {
  registerMarketDataTools(server);
  registerAccountTools(server);
  registerTradingTools(server);
}