import { createServer } from '../../../index';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

jest.mock('@3rd-eye-labs/openmm', () => ({
  ExchangeFactory: {
    isSupported: jest.fn().mockReturnValue(true),
    getSupportedExchanges: jest.fn().mockReturnValue(['mexc', 'gateio', 'bitget', 'kraken']),
    getExchange: jest.fn(),
  },
}));

describe('MCP Prompts', () => {
  let client: Client;

  beforeAll(async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('market_analysis', () => {
    it('should return market analysis prompt with exchange and symbol', async () => {
      const result = await client.getPrompt({
        name: 'market_analysis',
        arguments: { exchange: 'kraken', symbol: 'BTC/USDT' },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');

      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('BTC/USDT');
      expect(text).toContain('kraken');
      expect(text).toContain('get_ticker');
      expect(text).toContain('get_orderbook');
      expect(text).toContain('get_trades');
    });
  });

  describe('portfolio_overview', () => {
    it('should return portfolio overview prompt with exchange', async () => {
      const result = await client.getPrompt({
        name: 'portfolio_overview',
        arguments: { exchange: 'mexc' },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');

      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('mexc');
      expect(text).toContain('get_balance');
      expect(text).toContain('list_orders');
    });
  });

  describe('grid_setup_advisor', () => {
    it('should return grid setup advisor prompt', async () => {
      const result = await client.getPrompt({
        name: 'grid_setup_advisor',
        arguments: { exchange: 'gateio', symbol: 'SNEK/USDT' },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');

      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('SNEK/USDT');
      expect(text).toContain('gateio');
      expect(text).toContain('grid trading strategy');
      expect(text).toContain('strategies://grid');
    });

    it('should include budget when provided', async () => {
      const result = await client.getPrompt({
        name: 'grid_setup_advisor',
        arguments: { exchange: 'kraken', symbol: 'BTC/USD', budget: '500' },
      });

      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('500');
    });
  });
});