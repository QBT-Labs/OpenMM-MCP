import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExchangeParam, SymbolParam, validateSymbol } from '../utils/index.js';
import { validateExchange, getConnectorSafe } from '../exchange/exchange-manager.js';

export function registerTradingTools(server: McpServer): void {
  server.tool(
    'create_order',
    'Create a new order (limit or market) on a supported exchange',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
      type: z.enum(['limit', 'market']).describe('Order type: limit or market'),
      side: z.enum(['buy', 'sell']).describe('Order side: buy or sell'),
      amount: z.number().positive().describe('Order amount in base currency'),
      price: z
        .number()
        .positive()
        .optional()
        .describe('Order price (required for limit orders, ignored for market orders)'),
    },
    async ({ exchange, symbol, type, side, amount, price }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);

      if (type === 'limit' && price === undefined) {
        throw new Error('Price is required for limit orders');
      }

      const connector = await getConnectorSafe(exchange);
      const order = await connector.createOrder(validSymbol, type, side, amount, price);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                order,
                exchange: validExchange,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    'cancel_order',
    'Cancel a specific order by ID on a supported exchange',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
      orderId: z.string().describe('The order ID to cancel'),
    },
    async ({ exchange, symbol, orderId }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);

      const connector = await getConnectorSafe(exchange);
      const result = await connector.cancelOrder(orderId, validSymbol);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                cancelled: result,
                orderId,
                symbol: validSymbol,
                exchange: validExchange,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    'cancel_all_orders',
    'Cancel all open orders for a trading pair on a supported exchange',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
    },
    async ({ exchange, symbol }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);

      const connector = await getConnectorSafe(exchange);
      const result = await connector.cancelAllOrders(validSymbol);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                cancelled: result,
                symbol: validSymbol,
                exchange: validExchange,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
