import { createServer } from '../../../index';
import { ExchangeFactory } from '@3rd-eye-labs/openmm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

jest.mock('@3rd-eye-labs/openmm', () => ({
  ExchangeFactory: {
    isSupported: jest.fn().mockReturnValue(true),
    getSupportedExchanges: jest.fn().mockReturnValue(['mexc', 'gateio', 'bitget', 'kraken']),
    getExchange: jest.fn(),
    clearAllConnectors: jest.fn(),
  },
}));

const mockExchangeFactory = ExchangeFactory as jest.Mocked<typeof ExchangeFactory>;

interface TextContent {
  type: 'text';
  text: string;
}

function parseResult(result: Awaited<ReturnType<Client['callTool']>>): any {
  const content = result.content as TextContent[];
  return JSON.parse(content[0].text);
}

describe('Market Data MCP Tools', () => {
  let client: Client;

  const mockTicker = {
    symbol: 'BTC/USDT',
    last: 65000,
    bid: 64990,
    ask: 65010,
    baseVolume: 1234.5,
    quoteVolume: 80000000,
    timestamp: Date.now(),
  };

  const mockOrderBook = {
    symbol: 'BTC/USDT',
    bids: [
      { price: 64990, amount: 1.5 },
      { price: 64980, amount: 2.0 },
      { price: 64970, amount: 3.0 },
    ],
    asks: [
      { price: 65010, amount: 1.2 },
      { price: 65020, amount: 2.5 },
      { price: 65030, amount: 1.8 },
    ],
    timestamp: Date.now(),
  };

  const mockTrades = [
    { id: '1', symbol: 'BTC/USDT', side: 'buy', price: 65000, amount: 0.5, timestamp: Date.now() },
    {
      id: '2',
      symbol: 'BTC/USDT',
      side: 'sell',
      price: 64990,
      amount: 0.3,
      timestamp: Date.now(),
    },
    { id: '3', symbol: 'BTC/USDT', side: 'buy', price: 65005, amount: 0.8, timestamp: Date.now() },
  ];

  const mockOHLCV = [
    { timestamp: 1700000000000, open: 64000, high: 64500, low: 63800, close: 64200, volume: 100 },
    { timestamp: 1700003600000, open: 64200, high: 65200, low: 64100, close: 65000, volume: 150 },
  ];

  const mockConnector = {
    getTicker: jest.fn().mockResolvedValue(mockTicker),
    getOrderBook: jest.fn().mockResolvedValue(mockOrderBook),
    getRecentTrades: jest.fn().mockResolvedValue(mockTrades),
    getOHLCV: jest.fn().mockResolvedValue(mockOHLCV),
  };

  beforeAll(async () => {
    mockExchangeFactory.isSupported.mockReturnValue(true);
    mockExchangeFactory.getSupportedExchanges.mockReturnValue([
      'mexc',
      'gateio',
      'bitget',
      'kraken',
    ]);
    mockExchangeFactory.getExchange.mockResolvedValue(mockConnector as any);

    const server = await createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockExchangeFactory.isSupported.mockReturnValue(true);
    mockExchangeFactory.getSupportedExchanges.mockReturnValue([
      'mexc',
      'gateio',
      'bitget',
      'kraken',
    ]);
    mockExchangeFactory.getExchange.mockResolvedValue(mockConnector as any);
  });

  describe('get_ticker', () => {
    it('should return ticker data with spread', async () => {
      const result = await client.callTool({
        name: 'get_ticker',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT' },
      });

      const data = parseResult(result);
      expect(data.symbol).toBe('BTC/USDT');
      expect(data.last).toBe(65000);
      expect(data.bid).toBe(64990);
      expect(data.ask).toBe(65010);
      expect(data.spread).toBe(20);
      expect(data.spreadPercent).toBeCloseTo(0.0308, 3);
      expect(data.exchange).toBe('mexc');
    });

    it('should reject unsupported exchange', async () => {
      mockExchangeFactory.isSupported.mockReturnValue(false);

      const result = await client.callTool({
        name: 'get_ticker',
        arguments: { exchange: 'binance', symbol: 'BTC/USDT' },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('get_orderbook', () => {
    it('should return order book with default limit', async () => {
      const result = await client.callTool({
        name: 'get_orderbook',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT' },
      });

      const data = parseResult(result);
      expect(data.symbol).toBe('BTC/USDT');
      expect(data.bids).toHaveLength(3);
      expect(data.asks).toHaveLength(3);
      expect(data.spread).toBe(20);
      expect(data.exchange).toBe('mexc');
    });

    it('should respect limit parameter', async () => {
      const result = await client.callTool({
        name: 'get_orderbook',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT', limit: 2 },
      });

      const data = parseResult(result);
      expect(data.bids).toHaveLength(2);
      expect(data.asks).toHaveLength(2);
      expect(data.bidLevels).toBe(2);
      expect(data.askLevels).toBe(2);
    });
  });

  describe('get_trades', () => {
    it('should return trades with summary', async () => {
      const result = await client.callTool({
        name: 'get_trades',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT' },
      });

      const data = parseResult(result);
      expect(data.trades).toHaveLength(3);
      expect(data.summary.totalTrades).toBe(3);
      expect(data.summary.buyTrades).toBe(2);
      expect(data.summary.sellTrades).toBe(1);
      expect(data.exchange).toBe('mexc');
    });

    it('should respect limit parameter', async () => {
      const result = await client.callTool({
        name: 'get_trades',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT', limit: 2 },
      });

      const data = parseResult(result);
      expect(data.trades).toHaveLength(2);
      expect(data.summary.totalTrades).toBe(2);
    });
  });

  describe('get_ohlcv', () => {
    it('should return candles with summary', async () => {
      const result = await client.callTool({
        name: 'get_ohlcv',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT', timeframe: '1h' },
      });

      const data = parseResult(result);
      expect(data.symbol).toBe('BTC/USDT');
      expect(data.timeframe).toBe('1h');
      expect(data.candles).toHaveLength(2);
      expect(data.summary.count).toBe(2);
      expect(data.summary.periodHigh).toBe(65200);
      expect(data.summary.periodLow).toBe(63800);
      expect(data.summary.avgVolume).toBe(125);
      expect(data.summary.latestClose).toBe(65000);
      expect(data.summary.priceChange).toBe(1000);
      expect(data.exchange).toBe('mexc');
    });

    it('should pass timeframe and limit through to the connector', async () => {
      await client.callTool({
        name: 'get_ohlcv',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT', timeframe: '4h', limit: 50 },
      });

      expect(mockConnector.getOHLCV).toHaveBeenCalledWith('BTC/USDT', '4h', 50);
    });

    it('should handle an empty candle set without producing Infinity or NaN', async () => {
      mockConnector.getOHLCV.mockResolvedValueOnce([]);

      const result = await client.callTool({
        name: 'get_ohlcv',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT' },
      });

      const data = parseResult(result);
      expect(data.candles).toEqual([]);
      expect(data.summary.count).toBe(0);
      expect(JSON.stringify(data)).not.toMatch(/Infinity|NaN|null/);
    });
  });

  // QBT-688: public market data must not require API credentials.
  describe('public market data does not require authentication', () => {
    it.each([
      ['get_ticker', { exchange: 'mexc', symbol: 'BTC/USDT' }],
      ['get_orderbook', { exchange: 'mexc', symbol: 'BTC/USDT' }],
      ['get_trades', { exchange: 'mexc', symbol: 'BTC/USDT' }],
      ['get_ohlcv', { exchange: 'mexc', symbol: 'BTC/USDT' }],
    ])('%s should request a connector with requireAuth: false', async (name, args) => {
      await client.callTool({ name, arguments: args });

      expect(mockExchangeFactory.getExchange).toHaveBeenCalledWith(
        'mexc',
        expect.objectContaining({ requireAuth: false })
      );
    });
  });
});
