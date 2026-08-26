/**
 * Payment module
 *
 * Uses the unified IPC socket for payment signing.
 * The MCP process never holds private keys — it delegates signing
 * to the `openmm serve` process via /tmp/openmm.sock.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolPricing } from '@qbtlabs/x402';

export interface JWTClaims {
  user_id: string;
  exchange: string;
  tool: string;
  issued_at: number;
  expires_at: number;
  payment_tx: string;
}

// Tool pricing in USD - format expected by x402 setToolPrices
export const TOOL_PRICING: Record<string, ToolPricing> = {
  list_exchanges: { tier: 'free', price: 0 },
  get_ticker: { tier: 'read', price: 0.001 },
  get_orderbook: { tier: 'read', price: 0.001 },
  get_trades: { tier: 'read', price: 0.001 },
  get_ohlcv: { tier: 'read', price: 0.001 },
  get_balance: { tier: 'read', price: 0.001 },
  list_orders: { tier: 'read', price: 0.001 },
  get_cardano_price: { tier: 'read', price: 0.001 },
  discover_pools: { tier: 'read', price: 0.001 },
  get_strategy_status: { tier: 'read', price: 0.001 },
  create_order: { tier: 'write', price: 0.01 },
  cancel_order: { tier: 'write', price: 0.01 },
  cancel_all_orders: { tier: 'write', price: 0.01 },
  start_grid_strategy: { tier: 'write', price: 0.01 },
  stop_strategy: { tier: 'write', price: 0.01 },
};

const FREE_TOOLS = Object.entries(TOOL_PRICING)
  .filter(([, pricing]) => pricing.price === 0)
  .map(([name]) => name);

let paymentEnabled = false;

export function isX402Enabled(): boolean {
  // HTTP mode: x402 is enabled when PAYMENT_SERVER is configured
  return process.env.MCP_TRANSPORT === 'http' && !!process.env.PAYMENT_SERVER;
}

/**
 * Check if the unified IPC socket is available for signing.
 */
export async function initPaymentClient(): Promise<void> {
  const { existsSync } = await import('fs');
  const socketPath = process.env.OPENMM_SOCKET || '/tmp/openmm.sock';
  if (existsSync(socketPath)) {
    paymentEnabled = true;
    console.log(`🔐 Payment signing via socket (${socketPath})`);
  }
}

export function isPaymentClientEnabled(): boolean {
  return paymentEnabled;
}

/**
 * Wrap an McpServer with the split payment flow.
 * Uses UnifiedIPCClient for signing — private key never in this process.
 */
export async function wrapServerWithPayment(server: McpServer): Promise<void> {
  const workerUrl = process.env.PAYMENT_SERVER || 'https://mcp.openmm.io';
  const testnet = process.env.X402_TESTNET === 'true';

  const { UnifiedIPCClient } = await import('../ipc/client.js');
  const client = new UnifiedIPCClient();

  try {
    await client.connect();
    const status = await client.ping();

    if (!status.wallet) {
      console.error('⚠️  No wallet in unified socket — payment signing disabled');
      client.disconnect();
      return;
    }

    console.log(`✅ Payment signer connected, address: ${status.wallet}`);

    const { wrapWithSplitPayment } = await import('@qbtlabs/x402/split');

    // x402 bundles its own nested copy of @modelcontextprotocol/sdk, so its
    // McpServer is nominally distinct from ours despite being structurally the
    // same class. Cast to the parameter's own type rather than to `any`.
    wrapWithSplitPayment(server as unknown as Parameters<typeof wrapWithSplitPayment>[0], {
      signer: {
        address: status.wallet,
        sign: async (payload: { to: string; amount: string; chainId: number }) => {
          return client.signPayment(payload);
        },
      },
      workerUrl,
      testnet,
      freeTools: FREE_TOOLS,
    });
  } catch (error) {
    console.error('⚠️  Payment socket unavailable:', (error as Error).message);
    client.disconnect();
  }
}
