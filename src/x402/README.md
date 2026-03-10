# x402 Payment Integration

This module implements the [x402 payment protocol](https://docs.cdp.coinbase.com/x402/welcome) for OpenMM MCP, enabling pay-per-use access to trading tools.

## Overview

When x402 is enabled, tools that require payment will return a 402 response with payment requirements. Clients using `@coinbase/payments-mcp` or `@x402/axios` will automatically handle the payment flow.

## Configuration

Set these environment variables to enable x402:

```bash
# Your Base wallet address for receiving USDC payments
X402_EVM_ADDRESS=0x1234...

# Your Solana wallet address for receiving USDC payments (optional)
X402_SOLANA_ADDRESS=So11...

# Use testnet networks (Base Sepolia, Solana Devnet)
X402_TESTNET=false
```

## Pricing Tiers

| Tier | Price | Tools |
|------|-------|-------|
| Free | $0 | - |
| Read | $0.001 | `get_ticker`, `get_orderbook`, `get_trades`, `get_balance`, `list_orders` |
| Analysis | $0.005 | `cardano_price`, `discover_pools`, `grid_status` |
| Write | $0.01 | `place_order`, `cancel_order` |

## Client Integration

### Using Coinbase Payments MCP (Recommended)

```bash
npx @coinbase/payments-mcp
```

This provides a full wallet + onramp + automatic payment handling.

### Using x402 Axios Wrapper

```typescript
import axios from 'axios';
import { x402Client, wrapAxiosWithPayment } from '@x402/axios';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const client = new x402Client();
const signer = privateKeyToAccount('0x...');
registerExactEvmScheme(client, { signer });

const api = wrapAxiosWithPayment(axios.create({ baseURL }), client);

// Automatic payment handling on 402 responses
const response = await api.get('/mcp', { params: { tool: 'get_ticker' } });
```

### Using OpenMM CLI

The OpenMM CLI has built-in x402 support:

```bash
openmm wallet create my-wallet
openmm wallet fund  # Fund with USDC on Base
openmm ticker --exchange mexc --symbol BTC/USDT  # Auto-pays if required
```

## Response Format

When payment is required, the tool returns:

```json
{
  "error": "Payment Required",
  "code": 402,
  "tool": "get_ticker",
  "price": 0.001,
  "priceFormatted": "$0.0010",
  "accepts": [
    {
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "1000",
      "payTo": "0x..."
    },
    {
      "network": "solana:mainnet",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000",
      "payTo": "So..."
    }
  ],
  "message": "This tool requires payment of $0.0010 USDC.",
  "docs": "https://docs.cdp.coinbase.com/x402/welcome"
}
```

## Supported Networks

| Network | Chain ID | USDC Contract |
|---------|----------|---------------|
| Base Mainnet | eip155:8453 | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |
| Base Sepolia | eip155:84532 | 0x036CbD53842c5426634e7929541eC2318f3dCF7e |
| Solana Mainnet | solana:mainnet | EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v |
| Solana Devnet | solana:devnet | 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU |

## Development

To test x402 locally:

1. Set up a test wallet on Base Sepolia
2. Get test USDC from a faucet
3. Run with testnet mode:

```bash
X402_EVM_ADDRESS=0x... X402_TESTNET=true npm run dev
```

## References

- [x402 Protocol Spec](https://docs.cdp.coinbase.com/x402/protocol)
- [Coinbase Payments MCP](https://docs.cdp.coinbase.com/payments-mcp/welcome)
- [x402 GitHub](https://github.com/coinbase/x402)
