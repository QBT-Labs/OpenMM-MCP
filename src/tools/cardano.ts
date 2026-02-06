import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const SUPPORTED_TOKENS: Record<
  string,
  { policyId: string; assetName: string; minLiquidity: number }
> = {
  INDY: {
    policyId: '533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0',
    assetName: '494e4459',
    minLiquidity: 100000,
  },
  SNEK: {
    policyId: '279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f',
    assetName: '534e454b',
    minLiquidity: 50000,
  },
  NIGHT: {
    policyId: '0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa',
    assetName: '4e49474854',
    minLiquidity: 25000,
  },
  MIN: {
    policyId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6',
    assetName: '4d494e',
    minLiquidity: 100000,
  },
};

const IRIS_BASE_URL = 'https://iris.indigoprotocol.io';

const CEX_ENDPOINTS = [
  {
    name: 'Binance',
    url: 'https://api.binance.com/api/v3/ticker/price?symbol=ADAUSDT',
    parse: (data: { price: string }) => parseFloat(data.price),
  },
  {
    name: 'MEXC',
    url: 'https://api.mexc.com/api/v3/ticker/price?symbol=ADAUSDT',
    parse: (data: { price: string }) => parseFloat(data.price),
  },
  {
    name: 'Coingecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd',
    parse: (data: { cardano?: { usd?: number } }) => data?.cardano?.usd ?? 0,
  },
];

async function fetchADAUSDT(): Promise<{ price: number; sources: string[] }> {
  const prices: number[] = [];
  const sources: string[] = [];

  for (const endpoint of CEX_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint.url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const price = endpoint.parse(data);
      if (price > 0 && !isNaN(price)) {
        prices.push(price);
        sources.push(endpoint.name);
      }
    } catch {
      // skip failed endpoint
    }
  }

  if (prices.length === 0) {
    throw new Error('Failed to fetch ADA/USDT price from any CEX source');
  }

  return {
    price: prices.reduce((sum, p) => sum + p, 0) / prices.length,
    sources,
  };
}

async function fetchIrisPools(): Promise<any[]> {
  const resp = await fetch(`${IRIS_BASE_URL}/api/liquidity-pools`, {
    headers: { 'User-Agent': 'OpenMM-MCP-Agent/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`Iris API error: ${resp.status}`);
  }
  const data = await resp.json();
  return data?.data || data || [];
}

async function fetchIrisPrices(identifiers: string[]): Promise<number[]> {
  const resp = await fetch(`${IRIS_BASE_URL}/api/liquidity-pools/prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'OpenMM-MCP-Agent/1.0' },
    body: JSON.stringify({ identifiers }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`Iris prices API error: ${resp.status}`);
  }
  const data = await resp.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((entry: { price: string }) => parseFloat(entry.price))
    .filter((p: number) => p > 0);
}

function matchesToken(pool: any, policyId: string): boolean {
  const tokenA = pool.tokenA;
  const tokenB = pool.tokenB;
  return tokenA?.policyId === policyId || tokenB?.policyId === policyId;
}

export function registerCardanoTools(server: McpServer): void {
  server.tool(
    'get_cardano_price',
    'Get aggregated price for a Cardano native token from DEX liquidity pools (TOKEN/USDT via ADA bridge)',
    {
      symbol: z.string().describe('Cardano token symbol (INDY, SNEK, MIN, NIGHT)'),
    },
    async ({ symbol }) => {
      const upper = symbol.toUpperCase();
      const token = SUPPORTED_TOKENS[upper];
      if (!token) {
        throw new Error(
          `Unsupported token: ${symbol}. Supported: ${Object.keys(SUPPORTED_TOKENS).join(', ')}`
        );
      }

      const [adaPrice, allPools] = await Promise.all([fetchADAUSDT(), fetchIrisPools()]);

      const tokenPools = allPools
        .filter((p: any) => matchesToken(p, token.policyId))
        .filter((p: any) => (p.state?.tvl || 0) >= token.minLiquidity)
        .sort((a: any, b: any) => (b.state?.tvl || 0) - (a.state?.tvl || 0))
        .slice(0, 3);

      if (tokenPools.length === 0) {
        throw new Error(`No liquidity pools found for ${upper} above minimum TVL threshold`);
      }

      const identifiers = tokenPools.map((p: any) => p.identifier).filter(Boolean);
      let tokenAdaPrice: number;

      if (identifiers.length > 0) {
        const prices = await fetchIrisPrices(identifiers);
        if (prices.length > 0) {
          const totalTvl = tokenPools.reduce((sum: number, p: any) => sum + (p.state?.tvl || 0), 0);
          tokenAdaPrice = tokenPools.reduce((sum: number, p: any, i: number) => {
            const weight = (p.state?.tvl || 0) / totalTvl;
            return sum + (prices[i] || 0) * weight;
          }, 0);
        } else {
          tokenAdaPrice =
            tokenPools.reduce((sum: number, p: any) => sum + (p.state?.price || 0), 0) /
            tokenPools.length;
        }
      } else {
        tokenAdaPrice =
          tokenPools.reduce((sum: number, p: any) => sum + (p.state?.price || 0), 0) /
          tokenPools.length;
      }

      const tokenUsdtPrice = tokenAdaPrice * adaPrice.price;
      const confidence = Math.min(tokenPools.length / 3, 1);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                symbol: `${upper}/USDT`,
                price: tokenUsdtPrice,
                tokenAdaPrice,
                adaUsdtPrice: adaPrice.price,
                confidence,
                poolsUsed: tokenPools.length,
                sources: {
                  ada: adaPrice.sources,
                  pools: tokenPools.map((p: any) => ({
                    dex: p.dex || 'unknown',
                    tvl: p.state?.tvl,
                  })),
                },
                timestamp: new Date().toISOString(),
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
    'discover_pools',
    'Discover Cardano DEX liquidity pools for a native token via Iris API',
    {
      symbol: z.string().describe('Cardano token symbol (INDY, SNEK, MIN, NIGHT)'),
    },
    async ({ symbol }) => {
      const upper = symbol.toUpperCase();
      const token = SUPPORTED_TOKENS[upper];
      if (!token) {
        throw new Error(
          `Unsupported token: ${symbol}. Supported: ${Object.keys(SUPPORTED_TOKENS).join(', ')}`
        );
      }

      const allPools = await fetchIrisPools();
      const tokenPools = allPools
        .filter((p: any) => matchesToken(p, token.policyId))
        .sort((a: any, b: any) => (b.state?.tvl || 0) - (a.state?.tvl || 0));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                symbol: upper,
                totalPools: tokenPools.length,
                pools: tokenPools.map((p: any) => ({
                  identifier: p.identifier,
                  dex: p.dex || 'unknown',
                  tvl: p.state?.tvl || 0,
                  reserveA: p.state?.reserveA || 0,
                  reserveB: p.state?.reserveB || 0,
                  price: p.state?.price || null,
                  isActive: p.isActive !== false,
                })),
                timestamp: new Date().toISOString(),
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
