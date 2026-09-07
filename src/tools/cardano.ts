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

const MINSWAP_POOLS_URL = 'https://api-mainnet-prod.minswap.org/v1/pools/metrics';
const SUNDAESWAP_GRAPHQL_URL = 'https://api.sundae.fi/graphql';
const ADA_ASSET_ID = 'ada.lovelace';
const PROVIDER_TIMEOUT_MS = 10000;

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

const assetMetadataSchema = z.object({
  currency_symbol: z.string(),
  token_name: z.string(),
});

const minswapPoolSchema = z.object({
  lp_asset: assetMetadataSchema,
  type: z.string().min(1),
  asset_a: assetMetadataSchema,
  asset_b: assetMetadataSchema,
  liquidity_a: z.number().finite().positive(),
  liquidity_b: z.number().finite().positive(),
});

const minswapResponseSchema = z.object({
  pool_metrics: z.array(z.unknown()),
});

const sundaeAssetAmountSchema = z.object({
  quantity: z.string().regex(/^\d+$/),
  asset: z.object({
    id: z.string().min(1),
    decimals: z.number().int().min(0).max(255),
  }),
});

const sundaePoolSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  current: z.object({
    quantityA: sundaeAssetAmountSchema,
    quantityB: sundaeAssetAmountSchema,
  }),
});

const sundaeResponseSchema = z.object({
  data: z.object({
    pools: z.object({
      byAsset: z.array(z.unknown()),
    }),
  }),
  errors: z.array(z.object({ message: z.string().optional() }).passthrough()).optional(),
});

interface NormalizedPool {
  identifier: string;
  dex: 'minswap' | 'sundaeswap';
  tvl: number;
  reserveA: number;
  reserveB: number;
  price: number;
  isActive: true;
}

type ProviderErrorCategory = 'http' | 'network' | 'payload';

class ProviderError extends Error {
  constructor(
    readonly provider: 'Minswap' | 'SundaeSwap',
    readonly category: ProviderErrorCategory,
    message: string
  ) {
    super(message);
  }
}

async function fetchADAUSDT(): Promise<{ price: number; sources: string[] }> {
  const prices: number[] = [];
  const sources: string[] = [];

  for (const endpoint of CEX_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint.url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const price = endpoint.parse(data);
      if (Number.isFinite(price) && price > 0) {
        prices.push(price);
        sources.push(endpoint.name);
      }
    } catch {
      // A single CEX failure must not prevent fallback to the remaining sources.
    }
  }

  if (prices.length === 0) {
    throw new Error('Failed to fetch ADA/USDT price from any CEX source');
  }

  let average = 0;
  prices.forEach((price, index) => {
    average += (price - average) / (index + 1);
  });
  if (!Number.isFinite(average) || average <= 0) {
    throw new Error('Failed to calculate a valid ADA/USDT price');
  }

  return { price: average, sources };
}

async function fetchProviderJson(
  provider: 'Minswap' | 'SundaeSwap',
  url: string,
  init: RequestInit
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed';
    throw new ProviderError(provider, 'network', message);
  }

  if (!response.ok) {
    throw new ProviderError(provider, 'http', `HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new ProviderError(provider, 'payload', message);
  }
}

function assetId(policyId: string, assetName: string): string {
  return `${policyId}.${assetName}`;
}

function isMinswapAda(asset: z.infer<typeof assetMetadataSchema>): boolean {
  return asset.currency_symbol === '' && asset.token_name === '';
}

function isMinswapToken(
  asset: z.infer<typeof assetMetadataSchema>,
  policyId: string,
  tokenName: string
): boolean {
  return asset.currency_symbol === policyId && asset.token_name === tokenName;
}

function assertPositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be finite and positive`);
  }
  return value;
}

async function fetchMinswapPools(policyId: string, tokenName: string): Promise<NormalizedPool[]> {
  const raw = await fetchProviderJson('Minswap', MINSWAP_POOLS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      term: `${policyId}${tokenName}`,
      only_verified: false,
      limit: 100,
      sort_field: 'liquidity',
      sort_direction: 'desc',
    }),
  });

  const parsed = minswapResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProviderError(
      'Minswap',
      'payload',
      parsed.error.issues[0]?.message ?? 'invalid payload'
    );
  }

  let validEntries = 0;
  const pools: NormalizedPool[] = [];
  for (const value of parsed.data.pool_metrics) {
    const parsedPool = minswapPoolSchema.safeParse(value);
    if (!parsedPool.success) continue;
    const pool = parsedPool.data;
    try {
      const adaIsA = isMinswapAda(pool.asset_a);
      const adaIsB = isMinswapAda(pool.asset_b);
      const tokenIsA = isMinswapToken(pool.asset_a, policyId, tokenName);
      const tokenIsB = isMinswapToken(pool.asset_b, policyId, tokenName);
      if (!((adaIsA && tokenIsB) || (adaIsB && tokenIsA))) {
        validEntries += 1;
        continue;
      }

      const adaReserve = adaIsA ? pool.liquidity_a : pool.liquidity_b;
      const tokenReserve = tokenIsA ? pool.liquidity_a : pool.liquidity_b;
      const tvl = assertPositiveFinite(adaReserve * 2, 'Minswap TVL');
      const price = assertPositiveFinite(adaReserve / tokenReserve, 'Minswap price');
      const identifier = `${pool.lp_asset.currency_symbol}${pool.lp_asset.token_name}`;
      if (!identifier) throw new Error('LP asset identifier is empty');

      pools.push({
        identifier,
        dex: 'minswap',
        tvl,
        reserveA: tokenReserve,
        reserveB: adaReserve,
        price,
        isActive: true,
      });
      validEntries += 1;
    } catch {
      // Skip one malformed pool without discarding valid siblings.
    }
  }
  if (parsed.data.pool_metrics.length > 0 && validEntries === 0) {
    throw new ProviderError('Minswap', 'payload', 'no valid pool entries');
  }
  return pools;
}

function normalizeRawQuantity(quantity: string, decimals: number): number {
  if (!/^\d+$/.test(quantity) || /^0+$/.test(quantity)) {
    throw new Error('quantity must be a positive integer string');
  }

  const significant = quantity.replace(/^0+/, '');
  const exponent = significant.length - decimals - 1;
  const precision =
    significant.length === 1 ? significant : `${significant[0]}.${significant.slice(1)}`;
  return assertPositiveFinite(Number(`${precision}e${exponent}`), 'normalized quantity');
}

async function fetchSundaeSwapPools(
  policyId: string,
  tokenName: string
): Promise<NormalizedPool[]> {
  const tokenAssetId = assetId(policyId, tokenName);
  const raw = await fetchProviderJson('SundaeSwap', SUNDAESWAP_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query PoolsByAsset($asset: ID!) {
        pools {
          byAsset(asset: $asset) {
            id
            version
            current {
              quantityA { quantity asset { id decimals } }
              quantityB { quantity asset { id decimals } }
            }
          }
        }
      }`,
      variables: { asset: tokenAssetId },
    }),
  });

  const parsed = sundaeResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProviderError(
      'SundaeSwap',
      'payload',
      parsed.error.issues[0]?.message ?? 'invalid payload'
    );
  }
  if (parsed.data.errors?.length) {
    throw new ProviderError(
      'SundaeSwap',
      'payload',
      parsed.data.errors.map((error) => error.message ?? 'GraphQL error').join('; ')
    );
  }

  let validEntries = 0;
  const pools: NormalizedPool[] = [];
  for (const value of parsed.data.data.pools.byAsset) {
    const parsedPool = sundaePoolSchema.safeParse(value);
    if (!parsedPool.success) continue;
    const pool = parsedPool.data;
    const amountA = pool.current.quantityA;
    const amountB = pool.current.quantityB;
    const adaAmount = amountA.asset.id === ADA_ASSET_ID ? amountA : amountB;
    const tokenAmount = amountA.asset.id === tokenAssetId ? amountA : amountB;
    const hasDirectPair =
      [amountA.asset.id, amountB.asset.id].includes(ADA_ASSET_ID) &&
      [amountA.asset.id, amountB.asset.id].includes(tokenAssetId);
    if (!hasDirectPair) {
      validEntries += 1;
      continue;
    }

    try {
      const adaReserve = normalizeRawQuantity(adaAmount.quantity, adaAmount.asset.decimals);
      const tokenReserve = normalizeRawQuantity(tokenAmount.quantity, tokenAmount.asset.decimals);
      const tvl = assertPositiveFinite(adaReserve * 2, 'SundaeSwap TVL');
      const price = assertPositiveFinite(adaReserve / tokenReserve, 'SundaeSwap price');

      pools.push({
        identifier: pool.id,
        dex: 'sundaeswap',
        tvl,
        reserveA: tokenReserve,
        reserveB: adaReserve,
        price,
        isActive: true,
      });
      validEntries += 1;
    } catch {
      continue;
    }
  }
  if (parsed.data.data.pools.byAsset.length > 0 && validEntries === 0) {
    throw new ProviderError('SundaeSwap', 'payload', 'no valid pool entries');
  }
  return pools;
}

function providerFailure(reason: unknown): string {
  if (reason instanceof ProviderError) {
    return `${reason.provider} [${reason.category}]: ${reason.message}`;
  }
  const message = reason instanceof Error ? reason.message : String(reason);
  return `unknown [payload]: ${message}`;
}

async function discoverTokenPools(policyId: string, tokenName: string): Promise<NormalizedPool[]> {
  const results = await Promise.allSettled([
    fetchMinswapPools(policyId, tokenName),
    fetchSundaeSwapPools(policyId, tokenName),
  ]);
  const pools = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

  if (results.every((result) => result.status === 'rejected')) {
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => providerFailure(result.reason));
    throw new Error(`Failed to fetch Cardano DEX pools: ${failures.join('; ')}`);
  }

  const deduplicated = new Map<string, NormalizedPool>();
  for (const pool of pools) {
    const key = `${pool.dex}:${pool.identifier}`;
    const existing = deduplicated.get(key);
    if (!existing || pool.tvl > existing.tvl) deduplicated.set(key, pool);
  }

  return [...deduplicated.values()].sort(
    (a, b) =>
      b.tvl - a.tvl || a.dex.localeCompare(b.dex) || a.identifier.localeCompare(b.identifier)
  );
}

function weightedPrice(pools: NormalizedPool[]): number {
  const maxTvl = Math.max(...pools.map((pool) => pool.tvl));
  let scaledWeightTotal = 0;
  let price = 0;
  for (const pool of pools) {
    const scaledWeight = pool.tvl / maxTvl;
    const nextWeightTotal = scaledWeightTotal + scaledWeight;
    price += (pool.price - price) * (scaledWeight / nextWeightTotal);
    scaledWeightTotal = nextWeightTotal;
  }
  return assertPositiveFinite(price, 'weighted token price');
}

function poolConfidence(pools: NormalizedPool[]): number {
  if (new Set(pools.map((pool) => pool.dex)).size === 1) return 0.7;
  const prices = pools.map((pool) => pool.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const midpoint = minimum / 2 + maximum / 2;
  const relativeSpread = midpoint > 0 ? (maximum - minimum) / midpoint : 1;
  return Math.max(0.5, 0.9 - Math.min(relativeSpread, 0.4));
}

function supportedToken(symbol: string) {
  const upper = symbol.toUpperCase();
  const token = SUPPORTED_TOKENS[upper];
  if (!token) {
    throw new Error(
      `Unsupported token: ${symbol}. Supported: ${Object.keys(SUPPORTED_TOKENS).join(', ')}`
    );
  }
  return { upper, token };
}

export function registerCardanoTools(server: McpServer): void {
  server.tool(
    'get_cardano_price',
    'Get aggregated price for a Cardano native token from DEX liquidity pools (TOKEN/USDT via ADA bridge)',
    {
      symbol: z.string().describe('Cardano token symbol (INDY, SNEK, MIN, NIGHT)'),
    },
    async ({ symbol }) => {
      const { upper, token } = supportedToken(symbol);
      const [adaPrice, allPools] = await Promise.all([
        fetchADAUSDT(),
        discoverTokenPools(token.policyId, token.assetName),
      ]);
      const tokenPools = allPools.filter((pool) => pool.tvl >= token.minLiquidity).slice(0, 3);

      if (tokenPools.length === 0) {
        throw new Error(`No liquidity pools found for ${upper} above minimum TVL threshold`);
      }

      const tokenAdaPrice = weightedPrice(tokenPools);
      const tokenUsdtPrice = assertPositiveFinite(
        tokenAdaPrice * adaPrice.price,
        'token USDT price'
      );

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
                confidence: poolConfidence(tokenPools),
                poolsUsed: tokenPools.length,
                sources: {
                  ada: adaPrice.sources,
                  pools: tokenPools.map((pool) => ({ dex: pool.dex, tvl: pool.tvl })),
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
    'Discover direct ADA liquidity pools for a Cardano native token via Minswap and SundaeSwap',
    {
      symbol: z.string().describe('Cardano token symbol (INDY, SNEK, MIN, NIGHT)'),
    },
    async ({ symbol }) => {
      const { upper, token } = supportedToken(symbol);
      const tokenPools = await discoverTokenPools(token.policyId, token.assetName);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                symbol: upper,
                totalPools: tokenPools.length,
                pools: tokenPools,
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
