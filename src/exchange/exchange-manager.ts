import type { BaseExchangeConnector } from '@3rd-eye-labs/openmm';

const SUPPORTED_EXCHANGES = ['mexc', 'gateio', 'bitget', 'kraken'] as const;
export type SupportedExchange = (typeof SUPPORTED_EXCHANGES)[number];

export function validateExchange(exchange: string): SupportedExchange {
  const lower = exchange.toLowerCase();
  if (!(SUPPORTED_EXCHANGES as readonly string[]).includes(lower)) {
    throw new Error(
      `Unsupported exchange: ${exchange}. Supported: ${SUPPORTED_EXCHANGES.join(', ')}`
    );
  }
  return lower as SupportedExchange;
}

export interface ConnectorOptions {
  /**
   * Whether the connector must support authenticated operations.
   *
   * Defaults to `true`. Pass `false` for public market-data endpoints (ticker,
   * order book, recent trades, OHLCV), which need no API credentials — this is
   * what lets those tools work for users who have configured no exchange keys.
   */
  requireAuth?: boolean;
}

export async function getConnectorSafe(
  exchange: string,
  options: ConnectorOptions = {}
): Promise<BaseExchangeConnector> {
  const validExchange = validateExchange(exchange);
  const requireAuth = options.requireAuth !== false;
  const { ExchangeFactory } = await import('@3rd-eye-labs/openmm');

  try {
    return await ExchangeFactory.getExchange(validExchange as any, { requireAuth });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = requireAuth
      ? ` Configure API credentials for ${validExchange} (run "openmm-vault" or set the exchange env vars).`
      : '';
    throw new Error(`Failed to connect to ${validExchange}: ${message}.${hint}`);
  }
}

/**
 * Get a connector for public market data. Requires no API credentials.
 */
export async function getPublicConnector(exchange: string): Promise<BaseExchangeConnector> {
  return getConnectorSafe(exchange, { requireAuth: false });
}
