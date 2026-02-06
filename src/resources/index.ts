import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerExchangeResources } from './exchanges.js';
import { registerStrategyResources } from './strategies.js';

export function registerResources(server: McpServer): void {
  registerExchangeResources(server);
  registerStrategyResources(server);
}
