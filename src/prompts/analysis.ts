import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerAnalysisPrompts(server: McpServer): void {
  server.prompt(
    'grid_setup_advisor',
    'Analyze market conditions and recommend optimal grid trading configuration',
    {
      exchange: z.string().describe('Exchange to trade on (e.g., mexc, kraken)'),
      symbol: z.string().describe('Trading pair to set up grid for (e.g., BTC/USDT)'),
      budget: z
        .string()
        .optional()
        .describe('Trading budget in quote currency (e.g., "500" for 500 USDT)'),
    },
    async ({ exchange, symbol, budget }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `I want to set up a grid trading strategy for ${symbol} on ${exchange}.${budget ? ` My budget is ${budget} in quote currency.` : ''}`,
              '',
              'Please analyze the market and recommend a grid configuration:',
              '',
              '1. First, gather market data using these tools:',
              `   - get_ticker with exchange="${exchange}" and symbol="${symbol}"`,
              `   - get_orderbook with exchange="${exchange}" and symbol="${symbol}" and limit=50`,
              `   - get_trades with exchange="${exchange}" and symbol="${symbol}" and limit=100`,
              `   - get_balance with exchange="${exchange}"`,
              '',
              '2. Then read the grid strategy documentation:',
              '   - Read resource strategies://grid for strategy docs',
              '   - Read resource strategies://grid/profiles for example profiles',
              '',
              '3. Based on your analysis, recommend:',
              '   - Number of grid levels (and why)',
              '   - Spacing model (linear vs geometric) and spacing value',
              '   - Size model (flat vs pyramidal) and base order size',
              '   - Risk parameters (max-position, safety-reserve, confidence)',
              '   - Whether to enable volatility adjustment',
              '   - The complete CLI command to start the strategy',
              '',
              '4. Explain the reasoning behind each parameter choice based on:',
              '   - Current spread and volatility',
              '   - Order book depth and liquidity',
              '   - Available balance and position sizing',
              '   - Risk/reward tradeoffs for this specific market',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
