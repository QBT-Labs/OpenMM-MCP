/**
 * Payment module
 *
 * Supports two modes:
 * 1. Direct key mode: Uses WALLET_PRIVATE_KEY env var (legacy)
 * 2. Signer mode: Uses isolated x402-signer process (secure)
 *
 * Signer mode keeps private keys in a separate process with:
 * - Encrypted vault storage
 * - Policy enforcement (spending limits)
 * - Process isolation (keys never in agent memory)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface JWTClaims {
  user_id: string;
  exchange: string;
  tool: string;
  issued_at: number;
  expires_at: number;
  payment_tx: string;
}

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
let signerEnabled = false;

export function isX402Enabled(): boolean {
  return !!process.env.X402_EVM_ADDRESS;
}

/**
 * Check if payment capabilities are available.
 * Supports both direct key mode and signer mode.
 */
export function initPaymentClient(): void {
  // Direct key mode (legacy)
  paymentEnabled = !!process.env.WALLET_PRIVATE_KEY;
  
  // Signer mode (secure) - check if signer socket exists
  const signerSocket = process.env.X402_SIGNER_SOCKET || '/tmp/x402-signer.sock';
  const fs = require('fs');
  if (fs.existsSync(signerSocket)) {
    signerEnabled = true;
    console.log(`🔐 x402 signer mode enabled (${signerSocket})`);
  }
}

export function isPaymentClientEnabled(): boolean {
  return paymentEnabled || signerEnabled;
}

export function isSignerEnabled(): boolean {
  return signerEnabled;
}

/**
 * Wrap an McpServer with the split payment flow.
 * Uses isolated signer if available, otherwise falls back to direct key.
 */
export async function wrapServerWithPayment(server: McpServer): Promise<void> {
  const workerUrl = process.env.PAYMENT_SERVER || 'https://mcp.openmm.io';
  const testnet = process.env.X402_TESTNET === 'true';
  
  // Try signer mode first (more secure)
  if (signerEnabled) {
    await wrapWithSignerMode(server, { workerUrl, testnet });
    return;
  }
  
  // Fall back to direct key mode
  const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) return;

  const { wrapWithSplitPayment } = await import('@qbtlabs/x402/split');

  wrapWithSplitPayment(server as any, {
    privateKey,
    workerUrl,
    testnet,
    freeTools: FREE_TOOLS,
  });
}

/**
 * Wrap server with signer mode (isolated key management)
 */
async function wrapWithSignerMode(
  server: McpServer,
  options: { workerUrl: string; testnet: boolean }
): Promise<void> {
  const { SignerClient } = await import('@qbtlabs/x402');
  
  const signerSocket = process.env.X402_SIGNER_SOCKET || '/tmp/x402-signer.sock';
  const client = new SignerClient({ socketPath: signerSocket });
  
  // Verify signer is available
  if (!await client.isAvailable()) {
    console.error('❌ x402 signer not available at', signerSocket);
    console.error('   Start with: npx tsx src/scripts/signer-cli.ts start');
    return;
  }
  
  // Get wallet address from signer (no key exposure)
  const address = await client.getAddress();
  console.log(`✅ x402 signer connected, address: ${address}`);
  
  // Store signer client for later use
  (server as any)._signerClient = client;
  (server as any)._signerAddress = address;
  
  // Import the split payment wrapper with signer support
  const { wrapWithSplitPayment } = await import('@qbtlabs/x402/split');
  
  wrapWithSplitPayment(server as any, {
    // Use signer for signing instead of raw key
    signer: {
      address,
      sign: async (payload: { to: string; amount: string; chainId: number }) => {
        return client.sign(payload);
      }
    },
    workerUrl: options.workerUrl,
    testnet: options.testnet,
    freeTools: FREE_TOOLS,
  });
}

/**
 * Get the signer client if available
 */
export function getSignerClient(server: McpServer): any | null {
  return (server as any)._signerClient || null;
}

/**
 * Get the signer address if available
 */
export function getSignerAddress(server: McpServer): string | null {
  return (server as any)._signerAddress || null;
}
