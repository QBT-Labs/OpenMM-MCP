import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const GRID_STRATEGY_DOCS = `# Grid Trading Strategy

The grid strategy places buy and sell orders at regular intervals around a center price, profiting from price oscillation within a range.

## Core Parameters
- **levels**: Number of grid levels per side (default: 5, max: 10, total orders = levels x 2)
- **spacing**: Base price spacing between levels (default: 0.02 = 2%)
- **size**: Base order size in quote currency (default: 50)
- **confidence**: Minimum price confidence to trade (default: 0.6 = 60%)

## Spacing Models
- **linear** (default): Equal spacing between all levels
- **geometric**: Spacing increases by a factor per level (tighter near center, wider at edges)
- **custom**: User-defined spacing offsets via grid profile file

## Size Models
- **flat** (default): Equal size for all levels
- **pyramidal**: Larger sizes near center price, smaller at outer levels
- **custom**: User-defined weight multipliers via grid profile file

## Risk Management
- **max-position**: Maximum position size as % of balance (default: 80%)
- **safety-reserve**: Safety reserve as % of balance (default: 20%)
- **deviation**: Price deviation % to trigger grid recreation (default: 1.5%)
- **debounce**: Delay between grid adjustments (default: 2000ms)

## Volatility Adjustment
When enabled, the grid automatically widens during volatile conditions:
- Below low threshold (default 2%): Normal spacing (1.0x)
- Between thresholds: Elevated spacing (1.5x)
- Above high threshold (default 5%): Wide spacing (2.0x)
`;

const GRID_PROFILES = {
  profiles: [
    {
      name: 'conservative',
      description: 'Low risk, tight grid for stable pairs',
      levels: 3,
      spacingModel: 'linear',
      baseSpacing: 0.01,
      sizeModel: 'flat',
      baseSize: 20,
      maxPosition: 0.5,
      safetyReserve: 0.4,
      confidence: 0.8,
    },
    {
      name: 'moderate',
      description: 'Balanced risk/reward with geometric spacing',
      levels: 5,
      spacingModel: 'geometric',
      baseSpacing: 0.005,
      spacingFactor: 1.3,
      sizeModel: 'pyramidal',
      baseSize: 50,
      maxPosition: 0.7,
      safetyReserve: 0.25,
      confidence: 0.6,
    },
    {
      name: 'aggressive',
      description: 'Higher risk, wider grid with more levels',
      levels: 10,
      spacingModel: 'geometric',
      baseSpacing: 0.003,
      spacingFactor: 1.5,
      sizeModel: 'pyramidal',
      baseSize: 100,
      maxPosition: 0.85,
      safetyReserve: 0.15,
      confidence: 0.5,
    },
  ],
};

export function registerStrategyResources(server: McpServer): void {
  server.resource('grid-strategy', 'strategies://grid', async () => ({
    contents: [
      {
        uri: 'strategies://grid',
        mimeType: 'text/markdown',
        text: GRID_STRATEGY_DOCS,
      },
    ],
  }));

  server.resource('grid-profiles', 'strategies://grid/profiles', async () => ({
    contents: [
      {
        uri: 'strategies://grid/profiles',
        mimeType: 'application/json',
        text: JSON.stringify(GRID_PROFILES, null, 2),
      },
    ],
  }));
}
