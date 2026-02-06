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

const mockFetch = jest.fn();
global.fetch = mockFetch;

interface TextContent {
  type: 'text';
  text: string;
}

function parseResult(result: Awaited<ReturnType<Client['callTool']>>): any {
  const content = result.content as TextContent[];
  return JSON.parse(content[0].text);
}

function setupFetchByUrl(config: {
  adaPrice?: number;
  pools?: any[];
  prices?: number[];
  allFail?: boolean;
}) {
  mockFetch.mockImplementation((url: string) => {
    if (config.allFail) {
      return Promise.resolve({ ok: false });
    }

    if (typeof url === 'string' && url.includes('liquidity-pools/prices')) {
      const priceData = (config.prices || []).map(p => ({ price: String(p) }));
      return Promise.resolve({ ok: true, json: async () => priceData });
    }

    if (typeof url === 'string' && url.includes('liquidity-pools')) {
      return Promise.resolve({ ok: true, json: async () => config.pools || [] });
    }

    if (typeof url === 'string' && (url.includes('binance') || url.includes('mexc'))) {
      if (config.adaPrice) {
        return Promise.resolve({ ok: true, json: async () => ({ price: String(config.adaPrice) }) });
      }
      return Promise.resolve({ ok: false });
    }

    if (typeof url === 'string' && url.includes('coingecko')) {
      if (config.adaPrice) {
        return Promise.resolve({ ok: true, json: async () => ({ cardano: { usd: config.adaPrice } }) });
      }
      return Promise.resolve({ ok: false });
    }

    return Promise.resolve({ ok: false });
  });
}

describe('Cardano MCP Tools', () => {
  let client: Client;

  beforeAll(async () => {
    setupFetchByUrl({ adaPrice: 0.45, pools: [] });

    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('get_cardano_price', () => {
    it('should return aggregated price for INDY', async () => {
      const indyPool = {
        identifier: 'pool-1',
        dex: 'minswap',
        pair: { tokenA: { policyId: '533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0' }, tokenB: {} },
        state: { tvl: 200000, price: 0.5 },
        isActive: true,
      };

      setupFetchByUrl({ adaPrice: 0.45, pools: [indyPool], prices: [0.52] });

      const result = await client.callTool({
        name: 'get_cardano_price',
        arguments: { symbol: 'INDY' },
      });

      const data = parseResult(result);
      expect(data.symbol).toBe('INDY/USDT');
      expect(data.price).toBeGreaterThan(0);
      expect(data.tokenAdaPrice).toBeGreaterThan(0);
      expect(data.adaUsdtPrice).toBe(0.45);
      expect(data.poolsUsed).toBe(1);
      expect(data.timestamp).toBeDefined();
    });

    it('should reject unsupported token', async () => {
      const result = await client.callTool({
        name: 'get_cardano_price',
        arguments: { symbol: 'UNKNOWN' },
      });

      expect(result.isError).toBe(true);
    });

    it('should error when no CEX price available', async () => {
      setupFetchByUrl({ allFail: true });

      const result = await client.callTool({
        name: 'get_cardano_price',
        arguments: { symbol: 'SNEK' },
      });

      expect(result.isError).toBe(true);
    });

    it('should error when no pools above TVL threshold', async () => {
      const lowTvlPool = {
        identifier: 'pool-low',
        dex: 'sundaeswap',
        pair: { tokenA: { policyId: '279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f' }, tokenB: {} },
        state: { tvl: 100, price: 0.01 },
      };

      setupFetchByUrl({ adaPrice: 0.45, pools: [lowTvlPool] });

      const result = await client.callTool({
        name: 'get_cardano_price',
        arguments: { symbol: 'SNEK' },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('discover_pools', () => {
    it('should return pools for a supported token', async () => {
      const pools = [
        {
          identifier: 'pool-a',
          dex: 'minswap',
          pair: { tokenA: { policyId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6' }, tokenB: {} },
          state: { tvl: 500000, reserveA: 1000000, reserveB: 2000000, price: 0.3 },
          isActive: true,
        },
        {
          identifier: 'pool-b',
          dex: 'sundaeswap',
          pair: { tokenA: {}, tokenB: { policyId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6' } },
          state: { tvl: 200000, reserveA: 500000, reserveB: 800000, price: 0.28 },
          isActive: true,
        },
      ];

      setupFetchByUrl({ pools });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'MIN' },
      });

      const data = parseResult(result);
      expect(data.symbol).toBe('MIN');
      expect(data.totalPools).toBe(2);
      expect(data.pools).toHaveLength(2);
      expect(data.pools[0].dex).toBe('minswap');
      expect(data.pools[0].tvl).toBe(500000);
      expect(data.pools[1].dex).toBe('sundaeswap');
    });

    it('should reject unsupported token', async () => {
      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'FAKE' },
      });

      expect(result.isError).toBe(true);
    });
  });
});