# @qbtlabs/openmm-mcp

[![npm version](https://img.shields.io/npm/v/@qbtlabs/openmm-mcp.svg)](https://www.npmjs.com/package/@qbtlabs/openmm-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@qbtlabs/openmm-mcp.svg)](https://www.npmjs.com/package/@qbtlabs/openmm-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP (Model Context Protocol) server for [OpenMM](https://github.com/3rd-Eye-Labs/OpenMM) — exposes market data, account, trading, and strategy tools to AI agents via Claude Desktop, Claude Code, Cursor, Windsurf, and other MCP clients.

Install and connect — **13 tools** are now available to your AI agent.

## What Agents Can Do

- **Monitor markets** — Real-time prices, order books, and trade history across multiple exchanges
- **Trade** — Place limit and market orders, cancel orders, manage positions
- **Check balances** — View account holdings across all connected exchanges
- **Run grid strategies** — Configure and deploy automated grid trading with dry-run preview
- **Discover Cardano DEX liquidity** — Aggregated token prices and pool discovery via on-chain data

## Installation

```bash
npm install -g @qbtlabs/openmm-mcp
```

Or run directly:

```bash
npx @qbtlabs/openmm-mcp
```

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_ticker` | Real-time price, bid/ask, spread, volume | `exchange`, `symbol` |
| `get_orderbook` | Order book depth (bids/asks) | `exchange`, `symbol`, `limit?` |
| `get_trades` | Recent trades with buy/sell summary | `exchange`, `symbol`, `limit?` |
| `get_balance` | Account balances (all or filtered) | `exchange`, `asset?` |
| `list_orders` | Open orders (all or by symbol) | `exchange`, `symbol?` |
| `create_order` | Place limit or market order | `exchange`, `symbol`, `type`, `side`, `amount`, `price?` |
| `cancel_order` | Cancel order by ID | `exchange`, `symbol`, `orderId` |
| `cancel_all_orders` | Cancel all orders for a pair | `exchange`, `symbol` |
| `start_grid_strategy` | Calculate and place grid orders | `exchange`, `symbol`, `levels?`, `spacing?`, `orderSize?`, `spacingModel?`, `sizeModel?`, `dryRun?` |
| `stop_strategy` | Cancel all orders for a pair | `exchange`, `symbol` |
| `get_strategy_status` | Grid status with open orders and spread | `exchange`, `symbol` |
| `get_cardano_price` | Aggregated Cardano token price from DEXes | `symbol` |
| `discover_pools` | Discover Cardano DEX liquidity pools | `symbol` |

## MCP Resources

| URI | Description |
|-----|-------------|
| `exchanges://list` | Supported exchanges with credential requirements |
| `strategies://grid` | Grid trading strategy documentation |
| `strategies://grid/profiles` | Example grid profiles (conservative/moderate/aggressive) |

## Prompts

| Prompt | Description |
|--------|-------------|
| `market_analysis` | Analyze ticker + order book + trades for a pair |
| `portfolio_overview` | Summarize balances and open orders |
| `grid_setup_advisor` | Recommend grid config based on market analysis |

## Supported Exchanges

- **MEXC** — `MEXC_API_KEY`, `MEXC_SECRET_KEY`
- **Bitget** — `BITGET_API_KEY`, `BITGET_SECRET`, `BITGET_PASSPHRASE`
- **Gate.io** — `GATEIO_API_KEY`, `GATEIO_SECRET`
- **Kraken** — `KRAKEN_API_KEY`, `KRAKEN_SECRET`

## Framework Setup

### Claude Code

```bash
claude mcp add openmm -- npx @qbtlabs/openmm-mcp
```

Set your exchange API keys as environment variables before launching Claude Code.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openmm": {
      "command": "npx",
      "args": ["@qbtlabs/openmm-mcp"],
      "env": {
        "MEXC_API_KEY": "your_key",
        "MEXC_SECRET_KEY": "your_secret",
        "KRAKEN_API_KEY": "your_key",
        "KRAKEN_SECRET": "your_secret"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "openmm": {
      "command": "npx",
      "args": ["@qbtlabs/openmm-mcp"],
      "env": {
        "MEXC_API_KEY": "your_key",
        "MEXC_SECRET_KEY": "your_secret"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "openmm": {
      "command": "npx",
      "args": ["@qbtlabs/openmm-mcp"],
      "env": {
        "MEXC_API_KEY": "your_key",
        "MEXC_SECRET_KEY": "your_secret"
      }
    }
  }
}
```

### Any MCP-Compatible Client

The server uses **stdio** transport. Point your client at:

```
npx @qbtlabs/openmm-mcp
```

Pass exchange credentials as environment variables (see [Supported Exchanges](#supported-exchanges)).

## Example Usage

**Check a ticker price:**

```json
{
  "tool": "get_ticker",
  "arguments": {
    "exchange": "mexc",
    "symbol": "BTC/USDT"
  }
}
```

**Place a limit buy order:**

```json
{
  "tool": "create_order",
  "arguments": {
    "exchange": "kraken",
    "symbol": "ETH/USDT",
    "type": "limit",
    "side": "buy",
    "amount": 0.5,
    "price": 2400
  }
}
```

**Preview a grid strategy (dry run):**

```json
{
  "tool": "start_grid_strategy",
  "arguments": {
    "exchange": "mexc",
    "symbol": "INDY/USDT",
    "levels": 5,
    "spacing": 0.02,
    "orderSize": 50,
    "dryRun": true
  }
}
```

**Get aggregated Cardano DEX price:**

```json
{
  "tool": "get_cardano_price",
  "arguments": {
    "symbol": "INDY"
  }
}
```

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

## Resources

- [OpenMM SDK](https://github.com/3rd-Eye-Labs/OpenMM) — Underlying trading SDK
- [npm package](https://www.npmjs.com/package/@qbtlabs/openmm-mcp) — Published package
- [MCP Specification](https://modelcontextprotocol.io) — Model Context Protocol docs
- [QBT Labs](https://github.com/QBT-Labs) — Organization

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on submitting issues and pull requests.

## License

MIT