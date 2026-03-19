# @qbtlabs/openmm-mcp

[![smithery badge](https://smithery.ai/badge/qbtlabs/openmm-mcp)](https://smithery.ai/servers/qbtlabs/openmm-mcp)
[![npm version](https://img.shields.io/npm/v/@qbtlabs/openmm-mcp.svg)](https://www.npmjs.com/package/@qbtlabs/openmm-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@qbtlabs/openmm-mcp.svg)](https://www.npmjs.com/package/@qbtlabs/openmm-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/QBT-Labs/OpenMM-MCP)

**📚 [Documentation](https://docs.openmm.io)** · **🤖 [AI Skills Portal](https://agents.openmm.io)** · **🔌 [API Reference](https://api.openmm.io)**

MCP (Model Context Protocol) server for [OpenMM](https://github.com/3rd-Eye-Labs/OpenMM) — exposes market data, account, trading, and strategy tools to AI agents via Claude Desktop, Claude Code, Cursor, Windsurf, and other MCP clients.

<a href="https://glama.ai/mcp/servers/QBT-Labs/openmm-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/QBT-Labs/openmm-mcp/badge" alt="openmm-mcp MCP server" />
</a>

## Two Ways to Use OpenMM MCP

| Option | Best For | API Keys | Payments |
|--------|----------|----------|----------|
| **🏠 Local (npm)** | Full control, your own keys | Stored locally | Free |
| **☁️ Hosted (mcp.openmm.io)** | No setup, pay-per-use | Not needed for public data | x402 USDC |

---

## 🏠 Option 1: Local Installation (Your Keys, Full Control)

Run the MCP server locally with your own exchange API keys.

### Quick Start

```bash
# Install globally
npm install -g @qbtlabs/openmm-mcp

# Run setup wizard
npx @qbtlabs/openmm-mcp setup
```

The setup wizard will:
- Configure your MCP client (Claude Desktop, Claude Code, Cursor, Windsurf)
- Prompt for exchange API credentials
- Automatically update config files

### Manual Configuration

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "openmm": {
      "command": "npx",
      "args": ["@qbtlabs/openmm-mcp"],
      "env": {
        "MEXC_API_KEY": "your_mexc_api_key",
        "MEXC_SECRET": "your_mexc_secret",
        "GATEIO_API_KEY": "your_gateio_key",
        "GATEIO_SECRET": "your_gateio_secret",
        "KRAKEN_API_KEY": "your_kraken_key",
        "KRAKEN_SECRET": "your_kraken_secret",
        "BITGET_API_KEY": "your_bitget_key",
        "BITGET_SECRET": "your_bitget_secret",
        "BITGET_PASSPHRASE": "your_bitget_passphrase"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add openmm -- npx @qbtlabs/openmm-mcp
```

Or edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "openmm": {
      "command": "npx",
      "args": ["@qbtlabs/openmm-mcp"],
      "env": {
        "MEXC_API_KEY": "your_key",
        "MEXC_SECRET": "your_secret"
      }
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "openmm": {
      "command": "npx",
      "args": ["@qbtlabs/openmm-mcp"],
      "env": {
        "MEXC_API_KEY": "your_key",
        "MEXC_SECRET": "your_secret"
      }
    }
  }
}
```

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "openmm": {
      "command": "npx",
      "args": ["@qbtlabs/openmm-mcp"],
      "env": {
        "MEXC_API_KEY": "your_key",
        "MEXC_SECRET": "your_secret"
      }
    }
  }
}
```

### Exchange API Keys

| Exchange | Required Environment Variables |
|----------|-------------------------------|
| **MEXC** | `MEXC_API_KEY`, `MEXC_SECRET` |
| **Gate.io** | `GATEIO_API_KEY`, `GATEIO_SECRET` |
| **Kraken** | `KRAKEN_API_KEY`, `KRAKEN_SECRET` |
| **Bitget** | `BITGET_API_KEY`, `BITGET_SECRET`, `BITGET_PASSPHRASE` |

**How to get API keys:**
- [MEXC API](https://www.mexc.com/user/openapi) — Enable Spot trading
- [Gate.io API](https://www.gate.io/myaccount/apikeys) — Enable Spot trading
- [Kraken API](https://pro.kraken.com/app/settings/api) — Enable trading permissions
- [Bitget API](https://www.bitget.com/account/newapi) — Enable Spot trading + passphrase

---

## ☁️ Option 2: Hosted Server with x402 Payments

Connect to `mcp.openmm.io` — no local installation, no API keys for public data. Pay per tool call with USDC on Base.

### How It Works

```
Your AI Agent → x402 Proxy → mcp.openmm.io → Data
                    ↓
            Signs USDC payment
                    ↓
            On-chain settlement (Base)
```

1. Agent calls a tool
2. Server returns `402 Payment Required` with price
3. Your wallet signs an EIP-3009 authorization (gasless for you)
4. Server submits payment on-chain and returns data

### Setup with x402 Proxy

```bash
# Install the x402 package
npm install -g @qbtlabs/x402

# Configure Claude Code with the proxy
```

Edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "openmm-x402": {
      "command": "qbtlabs-x402",
      "env": {
        "TARGET_URL": "https://mcp.openmm.io/mcp",
        "PRIVATE_KEY": "0x_your_wallet_private_key",
        "CHAIN": "base-sepolia"
      }
    }
  }
}
```

### Wallet Setup

1. **Create a wallet** for your AI agent (MetaMask, etc.)
2. **Fund with USDC** on Base Sepolia (testnet) or Base (mainnet)
3. **Export private key** and add to config

**Testnet faucets:**
- Base Sepolia ETH: [Coinbase Faucet](https://faucet.coinbase.com/)
- USDC: Use [Circle Faucet](https://faucet.circle.com/) or bridge from Sepolia

### Tool Pricing

| Category | Tools | Price (USDC) |
|----------|-------|--------------|
| **Free** | `list_exchanges` | $0.00 |
| **Read** | `get_ticker`, `get_orderbook`, `get_trades`, `get_ohlcv`, `get_balance`, `list_orders`, `get_cardano_price`, `discover_pools`, `get_strategy_status` | $0.001 |
| **Write** | `create_order`, `cancel_order`, `cancel_all_orders`, `start_grid_strategy`, `stop_strategy` | $0.01 |

### Payment Response

Every paid tool returns payment confirmation:

```json
{
  "result": {
    "content": [{"type": "text", "text": "...data..."}],
    "_payment": {
      "received": true,
      "txHash": "0x9720bcf1b81f9f11c2a5657722ddec77fc2c...",
      "explorer": "https://basescan.org/tx/0x9720bcf...",
      "amount": "$0.0010"
    }
  }
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TARGET_URL` | MCP server URL | Yes |
| `PRIVATE_KEY` | Wallet private key (for signing) | Yes |
| `CHAIN` | `base` (mainnet) or `base-sepolia` (testnet) | Yes |

---

## Available Tools (15)

| Tool | Description | Parameters |
|------|-------------|------------|
| **Market Data** |
| `list_exchanges` | List supported exchanges | — |
| `get_ticker` | Real-time price, bid/ask, spread, volume | `exchange`, `symbol` |
| `get_orderbook` | Order book depth (bids/asks) | `exchange`, `symbol`, `limit?` |
| `get_trades` | Recent trades with buy/sell summary | `exchange`, `symbol`, `limit?` |
| `get_ohlcv` | OHLCV candlestick data | `exchange`, `symbol`, `timeframe?`, `limit?` |
| **Account** |
| `get_balance` | Account balances (all or filtered) | `exchange`, `asset?` |
| `list_orders` | Open orders (all or by symbol) | `exchange`, `symbol?` |
| **Trading** |
| `create_order` | Place limit or market order | `exchange`, `symbol`, `type`, `side`, `amount`, `price?` |
| `cancel_order` | Cancel order by ID | `exchange`, `symbol`, `orderId` |
| `cancel_all_orders` | Cancel all orders for a pair | `exchange`, `symbol` |
| **Cardano DEX** |
| `get_cardano_price` | Aggregated token price from DEXes | `symbol` |
| `discover_pools` | Discover liquidity pools | `symbol`, `minLiquidity?` |
| **Strategy** |
| `start_grid_strategy` | Start grid trading | `exchange`, `symbol`, `lowerPrice`, `upperPrice`, `gridLevels?`, `totalAmount` |
| `stop_strategy` | Stop a running strategy | `strategyId`, `cancelOrders?` |
| `get_strategy_status` | Get strategy status | `strategyId` |

---

## Example Usage

**Check BTC price:**
```
"Get me the BTC/USDT ticker on MEXC"
```

**Place an order:**
```
"Buy 0.1 ETH at $2400 on Kraken"
```

**Start grid strategy:**
```
"Start a grid strategy on MEXC for INDY/USDT between $0.10 and $0.15 with 10 levels and $500 total"
```

**Check Cardano token:**
```
"What's the current price of SNEK on Cardano DEXes?"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your AI Agent                           │
│              (Claude Code, Cursor, etc.)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐       ┌─────────────────────────────┐
│   🏠 LOCAL (npm)    │       │   ☁️ HOSTED (mcp.openmm.io) │
│                     │       │                             │
│  npx @qbtlabs/      │       │  x402 Proxy (stdio)         │
│    openmm-mcp       │       │       │                     │
│        │            │       │       ▼                     │
│        ▼            │       │  HTTPS + EIP-3009 payment   │
│  Your API Keys      │       │       │                     │
│  (env variables)    │       │       ▼                     │
│        │            │       │  Cloudflare Worker          │
│        ▼            │       │  (15 tools, always online)  │
│  Direct exchange    │       │       │                     │
│  API calls          │       │       ▼                     │
│                     │       │  Exchange APIs              │
└─────────────────────┘       └─────────────────────────────┘
```

---

## Self-Hosting the HTTP Server

Run your own hosted instance:

### Option A: Cloudflare Workers

```bash
git clone https://github.com/QBT-Labs/openmm-mcp-worker.git
cd openmm-mcp-worker

# Add secrets
wrangler secret put X402_EVM_ADDRESS
wrangler secret put X402_PRIVATE_KEY
wrangler secret put MEXC_API_KEY
wrangler secret put MEXC_SECRET
# ... add other exchange keys

# Deploy
wrangler deploy
```

### Option B: Node.js HTTP Server

```bash
MCP_TRANSPORT=http PORT=3000 npx @qbtlabs/openmm-mcp
```

- `POST /mcp` — MCP JSON-RPC endpoint
- `GET /health` — Health check

### Option C: Docker

```bash
docker build -t openmm-mcp .
docker run -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e MEXC_API_KEY=your_key \
  -e MEXC_SECRET=your_secret \
  openmm-mcp
```

---

## Development

```bash
git clone https://github.com/QBT-Labs/openMM-mcp-agent.git
cd openMM-mcp-agent
npm install
cp .env.example .env  # Edit with your API keys

npm run typecheck    # Type checking
npm run lint         # Linting
npm run format:check # Format checking
npm test             # Run tests
npm run build        # Build to dist/
```

---

## Security

- **Local mode:** API keys stay on your machine, never leave your environment
- **Hosted mode:** No exchange API keys needed for public market data
- **x402 payments:** Sign transactions locally; private key never sent to server
- **EIP-3009:** Gasless signatures — you only need USDC, not ETH

---

## Resources

- [OpenMM SDK](https://github.com/3rd-Eye-Labs/OpenMM) — Underlying trading SDK
- [x402 Package](https://www.npmjs.com/package/@qbtlabs/x402) — Payment integration
- [MCP Specification](https://modelcontextprotocol.io) — Model Context Protocol docs
- [Base Network](https://base.org) — L2 for USDC payments

## License

MIT
