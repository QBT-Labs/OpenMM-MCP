/**
 * x402 Payment Configuration
 *
 * Defines pricing tiers and payment addresses for OpenMM MCP tools.
 * Following Coinbase x402 format for Base (EVM) and Solana payments.
 */

// Payment receiver addresses
export const PAYMENT_ADDRESSES = {
  evm: process.env.X402_EVM_ADDRESS || '',
  solana: process.env.X402_SOLANA_ADDRESS || '',
};

// USDC contract addresses
export const USDC_CONTRACTS = {
  // Base Mainnet
  'eip155:8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  // Base Sepolia (testnet)
  'eip155:84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  // Solana Mainnet
  'solana:mainnet': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Solana Devnet
  'solana:devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

// Tool pricing in USD (converted to micro-units: $0.01 = 10000)
export type PricingTier = 'free' | 'read' | 'analysis' | 'write';

export interface ToolPricing {
  tier: PricingTier;
  price: number; // USD
}

export const PRICING_TIERS: Record<PricingTier, number> = {
  free: 0,
  read: 0.001, // $0.001 per call
  analysis: 0.005, // $0.005 per call
  write: 0.01, // $0.01 per call
};

// Tool-specific pricing overrides
export const TOOL_PRICING: Record<string, ToolPricing> = {
  // Market Data Tools - Read tier
  get_ticker: { tier: 'read', price: PRICING_TIERS.read },
  get_orderbook: { tier: 'read', price: PRICING_TIERS.read },
  get_trades: { tier: 'read', price: PRICING_TIERS.read },

  // Account Tools - Read tier
  get_balance: { tier: 'read', price: PRICING_TIERS.read },
  list_orders: { tier: 'read', price: PRICING_TIERS.read },

  // Cardano Tools - Analysis tier
  cardano_price: { tier: 'analysis', price: PRICING_TIERS.analysis },
  discover_pools: { tier: 'analysis', price: PRICING_TIERS.analysis },

  // Trading Tools - Write tier
  place_order: { tier: 'write', price: PRICING_TIERS.write },
  cancel_order: { tier: 'write', price: PRICING_TIERS.write },

  // Strategy Tools - Analysis tier
  grid_status: { tier: 'analysis', price: PRICING_TIERS.analysis },
};

/**
 * Get pricing for a tool
 */
export function getToolPricing(toolName: string): ToolPricing {
  return TOOL_PRICING[toolName] || { tier: 'free', price: 0 };
}

/**
 * Check if x402 is enabled (payment addresses configured)
 */
export function isX402Enabled(): boolean {
  return !!(PAYMENT_ADDRESSES.evm || PAYMENT_ADDRESSES.solana);
}

/**
 * Get active networks based on configured addresses
 */
export function getActiveNetworks(): string[] {
  const networks: string[] = [];

  if (PAYMENT_ADDRESSES.evm) {
    const isTestnet = process.env.X402_TESTNET === 'true';
    networks.push(isTestnet ? 'eip155:84532' : 'eip155:8453');
  }

  if (PAYMENT_ADDRESSES.solana) {
    const isTestnet = process.env.X402_TESTNET === 'true';
    networks.push(isTestnet ? 'solana:devnet' : 'solana:mainnet');
  }

  return networks;
}

/**
 * Build payment requirements for 402 response
 */
export function buildPaymentRequirements(priceUsd: number): {
  accepts: Array<{
    network: string;
    asset: string;
    amount: string;
    payTo: string;
  }>;
} {
  const accepts: Array<{
    network: string;
    asset: string;
    amount: string;
    payTo: string;
  }> = [];

  const networks = getActiveNetworks();
  const amountMicroUnits = Math.ceil(priceUsd * 1_000_000).toString();

  for (const network of networks) {
    const asset = USDC_CONTRACTS[network as keyof typeof USDC_CONTRACTS];
    const payTo = network.startsWith('eip155')
      ? PAYMENT_ADDRESSES.evm
      : PAYMENT_ADDRESSES.solana;

    if (asset && payTo) {
      accepts.push({
        network,
        asset,
        amount: amountMicroUnits,
        payTo,
      });
    }
  }

  return { accepts };
}
