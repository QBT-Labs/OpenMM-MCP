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

describe('Account MCP Tools', () => {
  let client: Client;

  const mockBalances = {
    USDT: { asset: 'USDT', free: 1000, used: 200, total: 1200, available: 1000 },
    BTC: { asset: 'BTC', free: 0.5, used: 0.1, total: 0.6, available: 0.5 },
    ETH: { asset: 'ETH', free: 2.0, used: 0, total: 2.0, available: 2.0 },
  };

  const mockOrders = [
    {
      id: 'order-1',
      symbol: 'BTC/USDT',
      type: 'limit' as const,
      side: 'buy' as const,
      amount: 0.1,
      price: 60000,
      filled: 0,
      remaining: 0.1,
      status: 'open' as const,
      timestamp: Date.now(),
    },
    {
      id: 'order-2',
      symbol: 'ETH/USDT',
      type: 'limit' as const,
      side: 'sell' as const,
      amount: 1.0,
      price: 3500,
      filled: 0.5,
      remaining: 0.5,
      status: 'open' as const,
      timestamp: Date.now(),
    },
  ];

  const mockConnector = {
    getBalance: jest.fn().mockResolvedValue(mockBalances),
    getOpenOrders: jest.fn().mockResolvedValue(mockOrders),
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

  describe('get_balance', () => {
    it('should return all balances when no asset filter is provided', async () => {
      const result = await client.callTool({
        name: 'get_balance',
        arguments: { exchange: 'mexc' },
      });

      const data = parseResult(result);
      expect(data.balances).toHaveLength(3);
      expect(data.totalAssets).toBe(3);
      expect(data.exchange).toBe('mexc');
    });

    it('should filter by asset when provided', async () => {
      const result = await client.callTool({
        name: 'get_balance',
        arguments: { exchange: 'mexc', asset: 'BTC' },
      });

      const data = parseResult(result);
      expect(data.balances).toHaveLength(1);
      expect(data.balances[0].asset).toBe('BTC');
      expect(data.balances[0].free).toBe(0.5);
      expect(data.totalAssets).toBe(1);
    });

    it('should handle case-insensitive asset filter', async () => {
      const result = await client.callTool({
        name: 'get_balance',
        arguments: { exchange: 'mexc', asset: 'btc' },
      });

      const data = parseResult(result);
      expect(data.balances).toHaveLength(1);
      expect(data.balances[0].asset).toBe('BTC');
    });

    it('should return message when asset is not found', async () => {
      const result = await client.callTool({
        name: 'get_balance',
        arguments: { exchange: 'mexc', asset: 'DOGE' },
      });

      const data = parseResult(result);
      expect(data.asset).toBe('DOGE');
      expect(data.message).toContain('No balance found');
    });

    it('should reject unsupported exchange', async () => {
      mockExchangeFactory.isSupported.mockReturnValue(false);

      const result = await client.callTool({
        name: 'get_balance',
        arguments: { exchange: 'binance' },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('list_orders', () => {
    it('should return all open orders when no symbol filter is provided', async () => {
      const result = await client.callTool({
        name: 'list_orders',
        arguments: { exchange: 'mexc' },
      });

      const data = parseResult(result);
      expect(data.orders).toHaveLength(2);
      expect(data.totalOrders).toBe(2);
      expect(data.exchange).toBe('mexc');
      expect(data.symbol).toBeUndefined();
      expect(mockConnector.getOpenOrders).toHaveBeenCalledWith(undefined);
    });

    it('should pass symbol filter to connector', async () => {
      mockConnector.getOpenOrders.mockResolvedValueOnce([mockOrders[0]]);

      const result = await client.callTool({
        name: 'list_orders',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT' },
      });

      const data = parseResult(result);
      expect(data.orders).toHaveLength(1);
      expect(data.totalOrders).toBe(1);
      expect(data.symbol).toBe('BTC/USDT');
      expect(mockConnector.getOpenOrders).toHaveBeenCalledWith('BTC/USDT');
    });
  });
});
