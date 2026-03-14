import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExchangeParam, SymbolParam, LimitParam, validateSymbol } from '../utils/index.js';
import { validateExchange, getConnectorSafe } from '../exchange/exchange-manager.js';

const TimeframeParam = z
  .enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'])
  .default('1h')
  .describe('Candlestick timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w)');

export function registerMarketDataTools(server: McpServer): void {

  server.tool(
    'get_ticker',
    'Get real-time price, bid/ask, spread, and volume for a trading pair',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
    },
    async ({ exchange, symbol }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);
      const connector = await getConnectorSafe(exchange);
      const ticker = await connector.getTicker(validSymbol);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                symbol: ticker.symbol,
                last: ticker.last,
                bid: ticker.bid,
                ask: ticker.ask,
                spread: ticker.ask - ticker.bid,
                spreadPercent: ((ticker.ask - ticker.bid) / ticker.ask) * 100,
                baseVolume: ticker.baseVolume,
                quoteVolume: ticker.quoteVolume,
                timestamp: ticker.timestamp,
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
    'get_orderbook',
    'Fetch order book depth (bids and asks) for a trading pair',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
      limit: LimitParam(10, 100),
    },
    async ({ exchange, symbol, limit }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);
      const connector = await getConnectorSafe(exchange);
      const orderbook = await connector.getOrderBook(validSymbol);

      const bids = orderbook.bids.slice(0, limit);
      const asks = orderbook.asks.slice(0, limit);
      const spread =
        orderbook.asks.length > 0 && orderbook.bids.length > 0
          ? orderbook.asks[0].price - orderbook.bids[0].price
          : null;
      const spreadPercent =
        spread !== null && orderbook.asks[0].price > 0
          ? (spread / orderbook.asks[0].price) * 100
          : null;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                symbol: orderbook.symbol,
                bids,
                asks,
                spread,
                spreadPercent,
                bidLevels: bids.length,
                askLevels: asks.length,
                timestamp: orderbook.timestamp,
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
    'get_trades',
    'Get recent trades for a trading pair',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
      limit: LimitParam(20, 100),
    },
    async ({ exchange, symbol, limit }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);
      const connector = await getConnectorSafe(exchange);
      const trades = await connector.getRecentTrades(validSymbol);
      const limitedTrades = trades.slice(0, limit);

      const buyTrades = limitedTrades.filter((t) => t.side === 'buy');
      const sellTrades = limitedTrades.filter((t) => t.side === 'sell');
      const totalVolume = limitedTrades.reduce((sum, trade) => sum + trade.price * trade.amount, 0);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                symbol: validSymbol,
                trades: limitedTrades,
                summary: {
                  totalTrades: limitedTrades.length,
                  buyTrades: buyTrades.length,
                  sellTrades: sellTrades.length,
                  totalVolume,
                },
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
    'get_ohlcv',
    'Get OHLCV (candlestick) data for a trading pair',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
      timeframe: TimeframeParam,
      limit: LimitParam(100, 500),
    },
    async ({ exchange, symbol, timeframe, limit }) => {
      const validExchange = validateExchange(exchange);
      const validSymbol = validateSymbol(symbol);
      const connector = await getConnectorSafe(exchange);

      type OHLCVConnector = {
        getOHLCV?: (
          symbol: string,
          timeframe: string,
          limit: number
        ) => Promise<
          Array<{
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
          }>
        >;
      };
      const connectorWithOHLCV = connector as unknown as OHLCVConnector;

      if (!connectorWithOHLCV.getOHLCV) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `OHLCV not supported on ${validExchange}` }, null, 2),
            },
          ],
        };
      }

      const ohlcv = await connectorWithOHLCV.getOHLCV(validSymbol, timeframe, limit);
      const high = Math.max(...ohlcv.map((c) => c.high));
      const low = Math.min(...ohlcv.map((c) => c.low));
      const volumes = ohlcv.map((c) => c.volume);
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const priceChange = ohlcv.length > 1 ? ohlcv[ohlcv.length - 1].close - ohlcv[0].open : 0;
      const priceChangePercent = ohlcv.length > 1 ? (priceChange / ohlcv[0].open) * 100 : 0;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                symbol: validSymbol,
                timeframe,
                candles: ohlcv.map((c) => ({
                  timestamp: c.timestamp,
                  open: c.open,
                  high: c.high,
                  low: c.low,
                  close: c.close,
                  volume: c.volume,
                })),
                summary: {
                  count: ohlcv.length,
                  periodHigh: high,
                  periodLow: low,
                  avgVolume,
                  priceChange,
                  priceChangePercent,
                  latestClose: ohlcv[ohlcv.length - 1]?.close,
                },
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
