import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerTradingPrompts(server: McpServer): void {
  server.prompt(
    'market_analysis',
    'Analyze market conditions for a trading pair using ticker, order book, and recent trades data',
    {
      exchange: z.string().describe('Exchange to analyze (e.g., mexc, kraken)'),
      symbol: z.string().describe('Trading pair to analyze (e.g., BTC/USDT)'),
    },
    async ({ exchange, symbol }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Analyze the market conditions for ${symbol} on ${exchange}.`,
              '',
              'Please use these tools to gather data:',
              `1. get_ticker with exchange="${exchange}" and symbol="${symbol}"`,
              `2. get_orderbook with exchange="${exchange}" and symbol="${symbol}" and limit=20`,
              `3. get_trades with exchange="${exchange}" and symbol="${symbol}" and limit=50`,
              '',
              'Then provide analysis covering:',
              '- Current price and spread assessment',
              '- Order book depth and imbalance (bid vs ask pressure)',
              '- Recent trade flow (buy vs sell dominance, volume trends)',
              '- Overall market sentiment (bullish/bearish/neutral)',
              '- Key support and resistance levels from the order book',
            ].join('\n'),
          },
        },
      ],
    })
  );

  server.prompt(
    'portfolio_overview',
    'Get a comprehensive overview of account balances and open orders across an exchange',
    {
      exchange: z.string().describe('Exchange to review (e.g., mexc, kraken)'),
    },
    async ({ exchange }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Provide a comprehensive portfolio overview for my ${exchange} account.`,
              '',
              'Please use these tools to gather data:',
              `1. get_balance with exchange="${exchange}"`,
              `2. list_orders with exchange="${exchange}"`,
              '',
              'Then provide a summary covering:',
              '- Total portfolio value breakdown by asset',
              '- Assets with significant balances vs dust',
              '- Open order summary (count, total value, spread across pairs)',
              '- Risk exposure assessment (concentration in single assets)',
              '- Recommendations for portfolio management',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
