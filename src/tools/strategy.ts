import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExchangeParam, SymbolParam, validateSymbol } from '../utils/index.js';
import { validateExchange, getConnectorSafe } from '../exchange/exchange-manager.js';

interface GridLevel {
  price: number;
  side: 'buy' | 'sell';
  orderSize: number;
}

function calculateGridLevels(
  centerPrice: number,
  levels: number,
  spacing: number,
  spacingModel: 'linear' | 'geometric',
  spacingFactor: number,
  orderSize: number,
  sizeModel: 'flat' | 'pyramidal'
): GridLevel[] {
  const spacings: number[] = [];
  for (let i = 1; i <= levels; i++) {
    if (spacingModel === 'geometric') {
      let cumulative = 0;
      for (let j = 0; j < i; j++) {
        cumulative += spacing * Math.pow(spacingFactor, j);
      }
      spacings.push(cumulative);
    } else {
      spacings.push(spacing * i);
    }
  }

  const weights: number[] = [];
  if (sizeModel === 'pyramidal') {
    const raw = Array.from({ length: levels }, (_, i) => levels - i);
    const sum = raw.reduce((a, b) => a + b, 0);
    const norm = levels / sum;
    raw.forEach(w => weights.push(w * norm));
  } else {
    for (let i = 0; i < levels; i++) weights.push(1.0);
  }

  const grid: GridLevel[] = [];
  for (let i = 0; i < spacings.length; i++) {
    const buyPrice = centerPrice * (1 - spacings[i]);
    const sellPrice = centerPrice * (1 + spacings[i]);
    const size = orderSize * weights[i];

    grid.push({ price: buyPrice, side: 'buy', orderSize: size / buyPrice });
    grid.push({ price: sellPrice, side: 'sell', orderSize: size / sellPrice });
  }

  return grid;
}

export function registerStrategyTools(server: McpServer): void {
  server.tool(
    'start_grid_strategy',
    'Calculate and optionally place grid trading orders around the current price',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
      levels: z.number().min(1).max(10).default(5).describe('Grid levels per side (default: 5)'),
      spacing: z.number().min(0.001).max(0.5).default(0.02).describe('Base spacing as decimal (default: 0.02 = 2%)'),
      orderSize: z.number().positive().default(50).describe('Base order size in quote currency (default: 50)'),
      spacingModel: z.enum(['linear', 'geometric']).default('linear').describe('Spacing model'),
      spacingFactor: z.number().positive().default(1.3).describe('Factor for geometric spacing (default: 1.3)'),
      sizeModel: z.enum(['flat', 'pyramidal']).default('flat').describe('Size model'),
      dryRun: z.boolean().default(true).describe('Preview grid without placing orders (default: true)'),
    },
    async ({ exchange, symbol, levels, spacing, orderSize, spacingModel, spacingFactor, sizeModel, dryRun }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);

      const connector = await getConnectorSafe(exchange);
      const ticker = await connector.getTicker(validSymbol);
      const centerPrice = ticker.last;

      const grid = calculateGridLevels(centerPrice, levels, spacing, spacingModel, spacingFactor, orderSize, sizeModel);

      const placedOrders: any[] = [];
      if (!dryRun) {
        for (const level of grid) {
          const order = await connector.createOrder(validSymbol, 'limit', level.side, level.orderSize, level.price);
          placedOrders.push(order);
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: dryRun ? 'preview' : 'active',
            centerPrice,
            config: { levels, spacing, spacingModel, spacingFactor, orderSize, sizeModel },
            grid: grid.map(l => ({
              side: l.side,
              price: l.price,
              amount: l.orderSize,
              valueQuote: l.price * l.orderSize,
            })),
            totalOrders: grid.length,
            totalBuyValue: grid.filter(l => l.side === 'buy').reduce((s, l) => s + l.price * l.orderSize, 0),
            totalSellValue: grid.filter(l => l.side === 'sell').reduce((s, l) => s + l.price * l.orderSize, 0),
            ...(dryRun ? {} : { placedOrders }),
            exchange: validExchange,
            symbol: validSymbol,
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'stop_strategy',
    'Cancel all open orders for a trading pair, effectively stopping any running grid strategy',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
    },
    async ({ exchange, symbol }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);

      const connector = await getConnectorSafe(exchange);
      const openOrders = await connector.getOpenOrders(validSymbol);
      const result = await connector.cancelAllOrders(validSymbol);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'stopped',
            cancelledOrders: openOrders.length,
            result,
            exchange: validExchange,
            symbol: validSymbol,
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_strategy_status',
    'Get current grid strategy status: open orders, current price, and P&L estimate',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
    },
    async ({ exchange, symbol }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);

      const connector = await getConnectorSafe(exchange);
      const [ticker, openOrders] = await Promise.all([
        connector.getTicker(validSymbol),
        connector.getOpenOrders(validSymbol),
      ]);

      const buyOrders = openOrders.filter((o: any) => o.side === 'buy');
      const sellOrders = openOrders.filter((o: any) => o.side === 'sell');

      const spread = sellOrders.length > 0 && buyOrders.length > 0
        ? Math.min(...sellOrders.map((o: any) => o.price)) - Math.max(...buyOrders.map((o: any) => o.price))
        : null;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            currentPrice: ticker.last,
            openOrders: {
              total: openOrders.length,
              buyOrders: buyOrders.length,
              sellOrders: sellOrders.length,
            },
            gridSpread: spread,
            orders: openOrders.map((o: any) => ({
              id: o.id,
              side: o.side,
              price: o.price,
              amount: o.amount,
              filled: o.filled,
              remaining: o.remaining,
            })),
            exchange: validExchange,
            symbol: validSymbol,
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      };
    }
  );
}