import { createServer } from '../../../index';
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

const mockFetch = jest.fn();
global.fetch = mockFetch;

const INDY = {
  policyId: '533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0',
  assetName: '494e4459',
};
const MIN = {
  policyId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6',
  assetName: '4d494e',
};
const SNEK = {
  policyId: '279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f',
  assetName: '534e454b',
};

interface TextContent {
  type: 'text';
  text: string;
}

function parseResult(result: Awaited<ReturnType<Client['callTool']>>): any {
  const content = result.content as TextContent[];
  return JSON.parse(content[0].text);
}

function errorText(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as TextContent[]).map((entry) => entry.text).join('\n');
}

function response(data: unknown, ok = true, status = ok ? 200 : 503) {
  return Promise.resolve({ ok, status, json: async () => data });
}

function minswapPool(
  token: { policyId: string; assetName: string },
  options: { id?: string; ada?: number; tokens?: number } = {}
) {
  const { id = 'min-lp', ada = 100_000, tokens = 500_000 } = options;
  return {
    lp_asset: { currency_symbol: 'lp-policy', token_name: id },
    type: 'MinswapV2',
    asset_a: { currency_symbol: '', token_name: '' },
    asset_b: { currency_symbol: token.policyId, token_name: token.assetName },
    liquidity_a: ada,
    liquidity_b: tokens,
  };
}

function sundaePool(
  token: { policyId: string; assetName: string },
  options: {
    id?: string;
    adaRaw?: string;
    tokenRaw?: string;
    tokenDecimals?: number;
  } = {}
) {
  const {
    id = 'sundae-pool',
    adaRaw = '120000000000',
    tokenRaw = '400000000000',
    tokenDecimals = 6,
  } = options;
  return {
    id,
    version: 'V3',
    current: {
      quantityA: {
        quantity: adaRaw,
        asset: { id: 'ada.lovelace', decimals: 6 },
      },
      quantityB: {
        quantity: tokenRaw,
        asset: { id: `${token.policyId}.${token.assetName}`, decimals: tokenDecimals },
      },
    },
  };
}

type ProviderConfig = {
  minswap?: unknown;
  sundae?: unknown;
  minswapStatus?: number;
  sundaeStatus?: number;
  adaPrice?: number;
};

function setupProviders(config: ProviderConfig) {
  mockFetch.mockImplementation((input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api-mainnet-prod.minswap.org/v1/pools/metrics') {
      if (config.minswapStatus) return response({}, false, config.minswapStatus);
      return response(config.minswap ?? { pool_metrics: [] });
    }
    if (url === 'https://api.sundae.fi/graphql') {
      if (config.sundaeStatus) return response({}, false, config.sundaeStatus);
      return response(config.sundae ?? { data: { pools: { byAsset: [] } } });
    }
    if (url.includes('binance') || url.includes('mexc')) {
      return config.adaPrice
        ? response({ price: String(config.adaPrice) })
        : response({}, false, 503);
    }
    if (url.includes('coingecko')) {
      return config.adaPrice
        ? response({ cardano: { usd: config.adaPrice } })
        : response({}, false, 503);
    }
    throw new Error(`Unexpected fetch: ${url} ${JSON.stringify(init)}`);
  });
}

describe('Cardano MCP Tools', () => {
  let client: Client;

  beforeAll(async () => {
    setupProviders({});
    const server = await createServer();
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

  describe('discover_pools', () => {
    it('normalizes, deduplicates, and sorts direct ADA pools from both providers', async () => {
      setupProviders({
        minswap: {
          pool_metrics: [
            minswapPool(MIN, { id: 'lower', ada: 100_000, tokens: 500_000 }),
            minswapPool(MIN, { id: 'lower', ada: 100_000, tokens: 500_000 }),
          ],
        },
        sundae: {
          data: {
            pools: {
              byAsset: [sundaePool(MIN, { id: 'higher' })],
            },
          },
        },
      });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'MIN' },
      });
      const data = parseResult(result);

      expect(data.symbol).toBe('MIN');
      expect(data.totalPools).toBe(2);
      expect(data.pools).toEqual([
        {
          identifier: 'higher',
          dex: 'sundaeswap',
          tvl: 240_000,
          reserveA: 400_000,
          reserveB: 120_000,
          price: 0.3,
          isActive: true,
        },
        {
          identifier: 'lp-policylower',
          dex: 'minswap',
          tvl: 200_000,
          reserveA: 500_000,
          reserveB: 100_000,
          price: 0.2,
          isActive: true,
        },
      ]);

      const minswapCall = mockFetch.mock.calls.find(([url]) => String(url).includes('minswap'));
      expect(minswapCall?.[1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify({
          term: `${MIN.policyId}${MIN.assetName}`,
          only_verified: false,
          limit: 100,
          sort_field: 'liquidity',
          sort_direction: 'desc',
        }),
      });
      const sundaeCall = mockFetch.mock.calls.find(([url]) => String(url).includes('sundae'));
      expect(JSON.parse(sundaeCall?.[1]?.body as string)).toEqual(
        expect.objectContaining({ variables: { asset: `${MIN.policyId}.${MIN.assetName}` } })
      );
      expect(mockFetch.mock.calls.some(([url]) => String(url).toLowerCase().includes('iris'))).toBe(
        false
      );
      expect(JSON.stringify(data).toLowerCase()).not.toContain('iris');
    });

    it('falls back to SundaeSwap when Minswap fails', async () => {
      setupProviders({
        minswapStatus: 503,
        sundae: { data: { pools: { byAsset: [sundaePool(INDY)] } } },
      });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'INDY' },
      });
      const data = parseResult(result);

      expect(data.totalPools).toBe(1);
      expect(data.pools[0].dex).toBe('sundaeswap');
    });

    it('falls back to Minswap when SundaeSwap fails', async () => {
      setupProviders({
        minswap: { pool_metrics: [minswapPool(INDY)] },
        sundaeStatus: 429,
      });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'INDY' },
      });
      const data = parseResult(result);

      expect(data.totalPools).toBe(1);
      expect(data.pools[0].dex).toBe('minswap');
    });

    it('skips a malformed Minswap pool but retains valid siblings', async () => {
      setupProviders({
        minswap: {
          pool_metrics: [
            minswapPool(INDY, { id: 'valid' }),
            { ...minswapPool(INDY), liquidity_a: '100000' },
          ],
        },
        sundae: { data: { pools: { byAsset: [] } } },
      });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'INDY' },
      });
      const data = parseResult(result);

      expect(data.totalPools).toBe(1);
      expect(data.pools[0]).toMatchObject({ dex: 'minswap', identifier: 'lp-policyvalid' });
    });

    it('skips a malformed SundaeSwap pool but retains valid siblings', async () => {
      setupProviders({
        minswap: { pool_metrics: [] },
        sundae: {
          data: {
            pools: {
              byAsset: [sundaePool(INDY, { id: 'valid' }), { id: 'malformed' }],
            },
          },
        },
      });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'INDY' },
      });
      const data = parseResult(result);

      expect(data.totalPools).toBe(1);
      expect(data.pools[0]).toMatchObject({ dex: 'sundaeswap', identifier: 'valid' });
    });

    it('rejects GraphQL partial data when the response contains errors', async () => {
      setupProviders({
        minswapStatus: 503,
        sundae: {
          errors: [{ message: 'resolver failed' }],
          data: { pools: { byAsset: [sundaePool(INDY)] } },
        },
      });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'INDY' },
      });

      expect(result.isError).toBe(true);
      expect(errorText(result)).toContain('SundaeSwap [payload]: resolver failed');
    });

    it('normalizes zero-decimal SNEK quantities without scaling them', async () => {
      setupProviders({
        minswapStatus: 503,
        sundae: {
          data: {
            pools: {
              byAsset: [
                sundaePool(SNEK, {
                  adaRaw: '60000000000',
                  tokenRaw: '3000000000',
                  tokenDecimals: 0,
                }),
              ],
            },
          },
        },
      });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'SNEK' },
      });
      const data = parseResult(result);

      expect(data.pools[0]).toMatchObject({
        reserveA: 3_000_000_000,
        reserveB: 60_000,
        tvl: 120_000,
        price: 0.00002,
      });
    });

    it('returns a categorized error when both providers fail', async () => {
      setupProviders({ minswapStatus: 503, sundae: { errors: [{ message: 'upstream down' }] } });

      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'MIN' },
      });

      expect(result.isError).toBe(true);
      expect(errorText(result)).toContain('Minswap [http]');
      expect(errorText(result)).toContain('SundaeSwap [payload]');
    });

    it('rejects unsupported tokens before making provider calls', async () => {
      setupProviders({});
      const result = await client.callTool({
        name: 'discover_pools',
        arguments: { symbol: 'FAKE' },
      });

      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('get_cardano_price', () => {
    it('uses an overflow-safe TVL-weighted price from both DEX sources', async () => {
      setupProviders({
        adaPrice: 0.5,
        minswap: {
          pool_metrics: [minswapPool(INDY, { id: 'huge', ada: 1e307, tokens: 5e307 })],
        },
        sundae: {
          data: {
            pools: {
              byAsset: [sundaePool(INDY, { id: 'normal' })],
            },
          },
        },
      });

      const result = await client.callTool({
        name: 'get_cardano_price',
        arguments: { symbol: 'INDY' },
      });
      const data = parseResult(result);

      expect(data.symbol).toBe('INDY/USDT');
      expect(data.tokenAdaPrice).toBeCloseTo(0.2, 12);
      expect(data.price).toBeCloseTo(0.1, 12);
      expect(data.adaUsdtPrice).toBe(0.5);
      expect(data.poolsUsed).toBe(2);
      expect(data.confidence).toBe(0.5);
      expect(data.sources.pools.map((pool: { dex: string }) => pool.dex)).toEqual([
        'minswap',
        'sundaeswap',
      ]);
      expect(Number.isFinite(data.price)).toBe(true);
    });

    it('keeps the weighted result finite when finite pool products would overflow', async () => {
      setupProviders({
        adaPrice: 0.5,
        minswap: {
          pool_metrics: [
            minswapPool(INDY, { id: 'huge-a', ada: 100_000, tokens: 1e-303 }),
            minswapPool(INDY, { id: 'huge-b', ada: 100_000, tokens: 1e-303 }),
          ],
        },
        sundae: { data: { pools: { byAsset: [] } } },
      });

      const result = await client.callTool({
        name: 'get_cardano_price',
        arguments: { symbol: 'INDY' },
      });
      const data = parseResult(result);

      expect(data.tokenAdaPrice).toBe(1e308);
      expect(data.price).toBe(5e307);
      expect(data.confidence).toBe(0.7);
      expect(Number.isFinite(data.price)).toBe(true);
    });

    it('ignores non-positive and non-finite prices from CEX sources', async () => {
      setupProviders({
        minswap: { pool_metrics: [minswapPool(INDY)] },
        sundaeStatus: 503,
      });
      mockFetch.mockImplementation((input: string | URL) => {
        const url = String(input);
        if (url.includes('minswap')) return response({ pool_metrics: [minswapPool(INDY)] });
        if (url.includes('sundae')) return response({}, false, 503);
        if (url.includes('binance')) return response({ price: 'Infinity' });
        if (url.includes('mexc')) return response({ price: '-1' });
        if (url.includes('coingecko')) return response({ cardano: { usd: 0 } });
        throw new Error(`Unexpected fetch: ${url}`);
      });

      const result = await client.callTool({
        name: 'get_cardano_price',
        arguments: { symbol: 'INDY' },
      });

      expect(result.isError).toBe(true);
      expect(errorText(result)).toContain('Failed to fetch ADA/USDT');
    });

    it('errors when no pool meets the configured TVL threshold', async () => {
      setupProviders({
        adaPrice: 0.45,
        minswap: { pool_metrics: [minswapPool(SNEK, { ada: 10, tokens: 1_000 })] },
        sundae: { data: { pools: { byAsset: [] } } },
      });

      const result = await client.callTool({
        name: 'get_cardano_price',
        arguments: { symbol: 'SNEK' },
      });

      expect(result.isError).toBe(true);
      expect(errorText(result)).toContain('minimum TVL threshold');
    });
  });
});
