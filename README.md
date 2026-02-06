# openMM-mcp-agent

Standalone MCP (Model Context Protocol) server for [OpenMM](https://github.com/3rd-Eye-Labs/OpenMM) — exposes market data, account, and trading tools to AI agents via Claude Desktop, Cursor, and other MCP clients.

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

## Resources

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

## Setup

```bash
# Clone and install
git clone https://github.com/QBT-Labs/openMM-mcp-agent.git
cd openMM-mcp-agent
npm install

# Set exchange credentials
cp .env.example .env
# Edit .env with your API keys

# Build
npm run build
```

## Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openmm": {
      "command": "node",
      "args": ["/path/to/openMM-mcp-agent/dist/index.js"],
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

## Cursor Integration

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "openmm": {
      "command": "node",
      "args": ["/path/to/openMM-mcp-agent/dist/index.js"],
      "env": {
        "MEXC_API_KEY": "your_key",
        "MEXC_SECRET_KEY": "your_secret"
      }
    }
  }
}
```

## Development

```bash
npm run typecheck    # Type checking
npm run lint         # Linting
npm run format:check # Format checking
npm test             # Run tests
npm run build        # Build to dist/
```

## License

MIT
