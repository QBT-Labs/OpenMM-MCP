# @qbtlabs/openmm-mcp

[![smithery badge](https://smithery.ai/badge/qbtlabs/openmm-mcp)](https://smithery.ai/servers/qbtlabs/openmm-mcp)
[![npm version](https://img.shields.io/npm/v/@qbtlabs/openmm-mcp.svg)](https://www.npmjs.com/package/@qbtlabs/openmm-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@qbtlabs/openmm-mcp.svg)](https://www.npmjs.com/package/@qbtlabs/openmm-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/QBT-Labs/OpenMM-MCP)

**📚 [Documentation](https://docs.openmm.io)** · **🤖 [AI Skills Portal](https://agents.openmm.io)** · **🔌 [API Reference](https://api.openmm.io)**

MCP server for [OpenMM](https://github.com/3rd-Eye-Labs/OpenMM) — exposes market data, account, trading, and strategy tools to AI agents via any MCP client.

<a href="https://glama.ai/mcp/servers/QBT-Labs/openmm-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/QBT-Labs/openmm-mcp/badge" alt="openmm-mcp MCP server" />
</a>

## Two Ways to Use

| Option | Best For | API Keys | Payments |
|--------|----------|----------|----------|
| **Local (npm)** | Full control, your own keys | Encrypted vault | Free |
| **Hosted (mcp.openmm.io)** | No setup, pay-per-use | Not needed for public data | x402 USDC |

---

## Local Setup

**Prerequisites:** Node.js 20 or later.

### 1. Install and configure

```bash
npm install -g @qbtlabs/openmm-mcp
openmm-mcp --setup
```

The setup wizard writes the correct MCP config for your client (Claude Desktop, Claude Code, Cursor, Windsurf). No credentials are stored in config files — only the socket path.

### 2. Initialize encrypted vault

```bash
openmm-init
```

This creates an encrypted vault at `~/.openmm/vault.enc` containing your wallet key and exchange API credentials. You'll set a password, generate (or import) a wallet, and optionally add exchange keys.

### 3. Start the server

```bash
openmm serve
```

Type your vault password once. The unified socket starts at `/tmp/openmm.sock` — all MCP clients connect here. No credentials exist in any config file.

### Manual configuration

If you prefer to edit config files directly instead of using `--setup`:

| Client | Config file |
|--------|-------------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Code | `~/.claude.json` |
| Cursor | `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

```json
{
  "mcpServers": {
    "openmm": {
      "command": "node",
      "args": ["/path/to/openmm-mcp/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "OPENMM_SOCKET": "/tmp/openmm.sock",
        "PAYMENT_SERVER": "https://mcp.openmm.io",
        "X402_TESTNET": "true"
      }
    }
  }
}
```

Replace `/path/to/openmm-mcp` with the actual install path. For Claude Desktop, use the full path to `node` (e.g. from `which node`) to avoid nvm/PATH issues.

> **Tip:** Run `openmm-mcp --setup` instead — it writes the correct absolute paths automatically.

No API keys. No private keys. No passwords. Just the socket path.

### Without vault (quick start)

You can skip the vault and pass API keys directly in the `env` block:

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

The vault strengthens every scenario — nothing sensitive exists in any config file, process environment, or client memory.

### Client compatibility

| Client | Without vault | With vault |
|--------|--------------|------------|
| Claude Desktop | API keys in env | Only `OPENMM_SOCKET` |
| Claude Code | API keys in env | Only `OPENMM_SOCKET` |
| Cursor | API keys in env | Only `OPENMM_SOCKET` |
| Windsurf | API keys in env | Only `OPENMM_SOCKET` |

All clients connect to the same running `openmm serve` — one vault, one socket, any client.

---

## Hosted Server with x402 Payments

Connect to `mcp.openmm.io` — no local installation needed for public data.
Pay per tool call with USDC on Base.

### How it works

```
AI Agent (Claude / Cursor / Windsurf)
│  MCP stdio — no keys in config
▼
MCP Client Process
(reads OPENMM_SOCKET — credentials never here)
│  Unix socket /tmp/openmm.sock (mode 0600)
▼
openmm serve — unified vault process
┌──────────────────────────────────┐
│  ~/.openmm/vault.enc             │
│  AES-256-GCM + PBKDF2           │  ← wallet key + exchange keys, one vault
│            │                     │
│  Policy Engine                   │  ← maxPerTx, maxPerDay, allowedChains
│  (checked before key is touched) │
│            │                     │
│  signAndWipe()                   │  ← key used inline, wiped from memory
└──────────────────────────────────┘
│  EIP-3009 signature only
▼
mcp.openmm.io → x402 verification → Base L2 settlement
```

### Security properties

| Property | How |
|----------|-----|
| Keys encrypted at rest | AES-256-GCM + PBKDF2 in `~/.openmm/vault.enc` |
| Keys never in client memory | MCP process only holds socket path |
| Keys never in config files | No API keys, no private keys anywhere in config |
| Process isolation | Signing happens in `openmm serve`, not in the AI agent process |
| Policy enforcement | Spending limits checked before private key is accessed |
| Memory safety | `signAndWipe()` — key used once, goes out of scope immediately |

### Payment flow

1. Agent calls a tool
2. Server returns `402 Payment Required` with price
3. `openmm serve` signs EIP-3009 authorization (gasless — no ETH needed)
4. Server submits payment on-chain and returns data

### Tool Pricing

| Category | Tools | Price (USDC) |
|----------|-------|--------------|
| **Free** | `list_exchanges` | $0.00 |
| **Read** | `get_ticker`, `get_orderbook`, `get_trades`, `get_ohlcv`, `get_balance`, `list_orders`, `get_cardano_price`, `discover_pools`, `get_strategy_status` | $0.001 |
| **Write** | `create_order`, `cancel_order`, `cancel_all_orders`, `start_grid_strategy`, `stop_strategy` | $0.01 |

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

## CLI Reference

### Setup & Server

| Command | Description |
|---------|-------------|
| `openmm-init` | Create vault, generate/import wallet, add exchanges |
| `openmm-init --import <key>` | Create vault with an existing private key |
| `openmm serve` | Unlock vault, start unified socket |
| `openmm-status` | Show vault, socket, wallet, and exchange status (no password) |

### Exchange Credentials

| Command | Description |
|---------|-------------|
| `openmm-exchange list` | List configured exchanges |
| `openmm-exchange add <id>` | Add exchange credentials |
| `openmm-exchange remove <id>` | Remove exchange credentials |

Supported exchanges: `mexc`, `gateio`, `bitget`, `kraken`, `binance`, `coinbase`, `okx`

### Wallet

| Command | Description |
|---------|-------------|
| `openmm-wallet info` | Show wallet address and chain |
| `openmm-wallet set` | Set wallet credentials |
| `openmm-wallet export` | Display private key (requires confirmation) |

### Spending Policy

| Command | Description |
|---------|-------------|
| `openmm-policy show` | Show current policy |
| `openmm-policy set max-per-tx <amount>` | Max USDC per transaction |
| `openmm-policy set max-per-day <amount>` | Max USDC per day |
| `openmm-policy set allowed-chains <chains>` | Comma-separated chain IDs |
| `openmm-policy reset` | Clear all policy limits |

### Advanced

| Command | Description |
|---------|-------------|
| `openmm-vault info` | Show vault metadata |
| `openmm-vault change-password` | Change vault password |
| `openmm-vault export` | Export all credentials (dangerous) |
| `openmm-vault destroy` | Delete the vault |

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

## Security

- **Vault:** AES-256-GCM encrypted at `~/.openmm/vault.enc`
- **Password:** Interactive terminal only — never in any config file, env var, or CLI flag
- **Socket:** `/tmp/openmm.sock` mode `0600` — the socket is the authentication boundary
- **Policy:** Spending limits enforced at the socket before the private key is touched
- **Isolation:** Private key never enters any MCP client process memory — signing happens in the `openmm serve` process via IPC

---

## Development

```bash
git clone https://github.com/QBT-Labs/openMM-mcp-agent.git
cd openMM-mcp-agent
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

---

## Resources

- [OpenMM SDK](https://github.com/3rd-Eye-Labs/OpenMM) — Underlying trading SDK
- [x402 Package](https://www.npmjs.com/package/@qbtlabs/x402) — Payment integration
- [MCP Specification](https://modelcontextprotocol.io) — Model Context Protocol docs
- [Base Network](https://base.org) — L2 for USDC payments

## License

MIT

## Hosted deployment

A hosted deployment is available on [Fronteir AI](https://fronteir.ai/mcp/qbt-labs-openmm-mcp).

