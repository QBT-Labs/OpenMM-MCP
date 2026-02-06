import { createServer } from '../../../index';
import { ExchangeFactory } from '@3rd-eye-labs/openmm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

jest.mock('@3rd-eye-labs/openmm', () => ({
  ExchangeFactory: {
    isSupported: jest.fn().mockReturnValue(true),
    getSupportedExchanges: jest.fn().mockReturnValue(['mexc', 'gateio', 'bitget', 'kraken']),
    getExchange: jest.fn(),
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

describe('Strategy MCP Tools', () => {
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

  const mockOpenOrders = [
    { id: 'o1', side: 'buy', price: 64000, amount: 0.001, filled: 0, remaining: 0.001 },
    { id: 'o2', side: 'buy', price: 63000, amount: 0.001, filled: 0, remaining: 0.001 },
    { id: 'o3', side: 'sell', price: 66000, amount: 0.001, filled: 0, remaining: 0.001 },
    { id: 'o4', side: 'sell', price: 67000, amount: 0.001, filled: 0, remaining: 0.001 },
  ];

  const mockConnector = {
    getTicker: jest.fn().mockResolvedValue(mockTicker),
    getOpenOrders: jest.fn().mockResolvedValue(mockOpenOrders),
    cancelAllOrders: jest.fn().mockResolvedValue(undefined),
    createOrder: jest.fn().mockResolvedValue({ id: 'new-order', status: 'open' }),
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

    const server = createServer();
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

  describe('start_grid_strategy', () => {
    it('should preview grid with default params (dry run)', async () => {
      const result = await client.callTool({
        name: 'start_grid_strategy',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
        },
      });

      const data = parseResult(result);
      expect(data.status).toBe('preview');
      expect(data.centerPrice).toBe(65000);
      expect(data.totalOrders).toBe(10); // 5 levels * 2 sides
      expect(data.grid).toHaveLength(10);
      expect(data.exchange).toBe('mexc');
      expect(data.symbol).toBe('BTC/USDT');
      expect(mockConnector.createOrder).not.toHaveBeenCalled();
    });

    it('should generate correct buy/sell sides', async () => {
      const result = await client.callTool({
        name: 'start_grid_strategy',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
          levels: 3,
        },
      });

      const data = parseResult(result);
      const buys = data.grid.filter((o: any) => o.side === 'buy');
      const sells = data.grid.filter((o: any) => o.side === 'sell');
      expect(buys).toHaveLength(3);
      expect(sells).toHaveLength(3);
      buys.forEach((b: any) => expect(b.price).toBeLessThan(65000));
      sells.forEach((s: any) => expect(s.price).toBeGreaterThan(65000));
    });

    it('should use geometric spacing when specified', async () => {
      const result = await client.callTool({
        name: 'start_grid_strategy',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
          levels: 3,
          spacing: 0.01,
          spacingModel: 'geometric',
          spacingFactor: 2.0,
        },
      });

      const data = parseResult(result);
      const buys = data.grid
        .filter((o: any) => o.side === 'buy')
        .sort((a: any, b: any) => b.price - a.price);

      // Geometric spacing: gaps should increase
      const gap1 = data.centerPrice - buys[0].price;
      const gap2 = buys[0].price - buys[1].price;
      expect(gap2).toBeGreaterThan(gap1 * 0.9); // wider gaps at further levels
    });

    it('should use pyramidal sizing when specified', async () => {
      const result = await client.callTool({
        name: 'start_grid_strategy',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
          levels: 3,
          sizeModel: 'pyramidal',
        },
      });

      const data = parseResult(result);
      const buys = data.grid
        .filter((o: any) => o.side === 'buy')
        .sort((a: any, b: any) => b.price - a.price);

      // Pyramidal: closest levels should have largest size (highest value)
      expect(buys[0].valueQuote).toBeGreaterThan(buys[2].valueQuote);
    });

    it('should reject unsupported exchange', async () => {
      mockExchangeFactory.isSupported.mockReturnValue(false);

      const result = await client.callTool({
        name: 'start_grid_strategy',
        arguments: {
          exchange: 'binance',
          symbol: 'BTC/USDT',
        },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('stop_strategy', () => {
    it('should cancel all orders and return count', async () => {
      const result = await client.callTool({
        name: 'stop_strategy',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
        },
      });

      const data = parseResult(result);
      expect(data.status).toBe('stopped');
      expect(data.cancelledOrders).toBe(4);
      expect(data.exchange).toBe('mexc');
      expect(data.symbol).toBe('BTC/USDT');
      expect(mockConnector.cancelAllOrders).toHaveBeenCalledWith('BTC/USDT');
    });
  });

  describe('get_strategy_status', () => {
    it('should return current price and order breakdown', async () => {
      const result = await client.callTool({
        name: 'get_strategy_status',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
        },
      });

      const data = parseResult(result);
      expect(data.currentPrice).toBe(65000);
      expect(data.openOrders.total).toBe(4);
      expect(data.openOrders.buyOrders).toBe(2);
      expect(data.openOrders.sellOrders).toBe(2);
      expect(data.gridSpread).toBe(66000 - 64000);
      expect(data.orders).toHaveLength(4);
      expect(data.exchange).toBe('mexc');
      expect(data.symbol).toBe('BTC/USDT');
    });

    it('should handle empty order book', async () => {
      mockConnector.getOpenOrders.mockResolvedValueOnce([]);

      const result = await client.callTool({
        name: 'get_strategy_status',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
        },
      });

      const data = parseResult(result);
      expect(data.openOrders.total).toBe(0);
      expect(data.gridSpread).toBeNull();
      expect(data.orders).toHaveLength(0);
    });
  });
});
