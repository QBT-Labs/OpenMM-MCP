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

export async function getConnectorSafe(exchange: string): Promise<BaseExchangeConnector> {
  const validExchange = validateExchange(exchange);
  const { ExchangeFactory } = await import('@3rd-eye-labs/openmm');

  try {
    return await ExchangeFactory.getExchange(validExchange as any);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to ${validExchange}: ${message}`);
  }
}
