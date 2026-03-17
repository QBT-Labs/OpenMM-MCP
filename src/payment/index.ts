/**
 * Payment module
 *
 * Delegates to @qbtlabs/x402/split for the split execution flow where
 * payment verification happens on the remote Worker and tool execution
 * happens locally with the user's exchange keys.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { wrapWithSplitPayment } from '@qbtlabs/x402/split';

export type { JWTClaims } from '@qbtlabs/x402/split';

export const TOOL_PRICING: Record<string, number> = {
  list_exchanges: 0,
  get_ticker: 0.001,
  get_orderbook: 0.001,
  get_trades: 0.001,
  get_ohlcv: 0.001,
  get_balance: 0.001,
  list_orders: 0.001,
  get_cardano_price: 0.001,
  discover_pools: 0.001,
  get_strategy_status: 0.001,
  create_order: 0.01,
  cancel_order: 0.01,
  cancel_all_orders: 0.01,
  start_grid_strategy: 0.01,
  stop_strategy: 0.01,
};

const FREE_TOOLS = Object.entries(TOOL_PRICING)
  .filter(([, price]) => price === 0)
  .map(([name]) => name);

let paymentEnabled = false;

export function isX402Enabled(): boolean {
  return !!process.env.X402_EVM_ADDRESS;
}

/**
 * Check if a wallet private key is available for split execution.
 * Call before createServer() so isPaymentClientEnabled() is accurate.
 */
export function initPaymentClient(): void {
  paymentEnabled = !!process.env.WALLET_PRIVATE_KEY;
}

export function isPaymentClientEnabled(): boolean {
  return paymentEnabled;
}

/**
 * Wrap an McpServer with the split payment flow.
 * Uses @qbtlabs/x402/split — signs EIP-3009 locally, requests JWT from Worker.
 */
export function wrapServerWithPayment(server: McpServer): void {
  const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) return;

  // Cast needed: sidecar uses CJS build of MCP SDK, x402 uses ESM.
  // Same interface at runtime.
  wrapWithSplitPayment(server as any, {
    privateKey,
    workerUrl: process.env.PAYMENT_SERVER || 'https://mcp.openmm.io',
    testnet: process.env.X402_TESTNET === 'true',
    freeTools: FREE_TOOLS,
  });
}
