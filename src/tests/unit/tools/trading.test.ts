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

describe('Trading MCP Tools', () => {
  let client: Client;

  const mockOrder = {
    id: 'order-123',
    symbol: 'BTC/USDT',
    type: 'limit' as const,
    side: 'buy' as const,
    amount: 0.1,
    price: 60000,
    filled: 0,
    remaining: 0.1,
    status: 'open' as const,
    timestamp: Date.now(),
  };

  const mockConnector = {
    createOrder: jest.fn().mockResolvedValue(mockOrder),
    cancelOrder: jest.fn().mockResolvedValue(undefined),
    cancelAllOrders: jest.fn().mockResolvedValue(undefined),
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

  describe('create_order', () => {
    it('should create a limit buy order with valid params', async () => {
      const result = await client.callTool({
        name: 'create_order',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
          type: 'limit',
          side: 'buy',
          amount: 0.1,
          price: 60000,
        },
      });

      const data = parseResult(result);
      expect(data.order.id).toBe('order-123');
      expect(data.order.symbol).toBe('BTC/USDT');
      expect(data.order.type).toBe('limit');
      expect(data.order.side).toBe('buy');
      expect(data.exchange).toBe('mexc');
      expect(mockConnector.createOrder).toHaveBeenCalledWith(
        'BTC/USDT',
        'limit',
        'buy',
        0.1,
        60000
      );
    });

    it('should error when limit order has no price', async () => {
      const result = await client.callTool({
        name: 'create_order',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
          type: 'limit',
          side: 'buy',
          amount: 0.1,
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should create a market order without price', async () => {
      const marketOrder = { ...mockOrder, type: 'market' as const, price: undefined };
      mockConnector.createOrder.mockResolvedValueOnce(marketOrder);

      const result = await client.callTool({
        name: 'create_order',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
          type: 'market',
          side: 'buy',
          amount: 0.1,
        },
      });

      const data = parseResult(result);
      expect(data.order.type).toBe('market');
      expect(data.exchange).toBe('mexc');
      expect(mockConnector.createOrder).toHaveBeenCalledWith(
        'BTC/USDT',
        'market',
        'buy',
        0.1,
        undefined
      );
    });

    it('should reject unsupported exchange', async () => {
      mockExchangeFactory.isSupported.mockReturnValue(false);

      const result = await client.callTool({
        name: 'create_order',
        arguments: {
          exchange: 'binance',
          symbol: 'BTC/USDT',
          type: 'limit',
          side: 'buy',
          amount: 0.1,
          price: 60000,
        },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('cancel_order', () => {
    it('should cancel an order successfully', async () => {
      const result = await client.callTool({
        name: 'cancel_order',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
          orderId: 'order-123',
        },
      });

      const data = parseResult(result);
      expect(data.orderId).toBe('order-123');
      expect(data.symbol).toBe('BTC/USDT');
      expect(data.exchange).toBe('mexc');
      expect(mockConnector.cancelOrder).toHaveBeenCalledWith('order-123', 'BTC/USDT');
    });
  });

  describe('cancel_all_orders', () => {
    it('should cancel all orders successfully', async () => {
      const result = await client.callTool({
        name: 'cancel_all_orders',
        arguments: {
          exchange: 'mexc',
          symbol: 'BTC/USDT',
        },
      });

      const data = parseResult(result);
      expect(data.symbol).toBe('BTC/USDT');
      expect(data.exchange).toBe('mexc');
      expect(mockConnector.cancelAllOrders).toHaveBeenCalledWith('BTC/USDT');
    });
  });
});
