import {
  ExchangeFactory,
  SupportedExchange,
  BaseExchangeConnector,
} from '@3rd-eye-labs/openmm';

export { ExchangeFactory, SupportedExchange };

export function validateExchange(exchange: string): SupportedExchange {
  if (!ExchangeFactory.isSupported(exchange)) {
    const supported = ExchangeFactory.getSupportedExchanges().join(', ');
    throw new Error(`Unsupported exchange: ${exchange}. Supported: ${supported}`);
  }
  return exchange as SupportedExchange;
}

export async function getConnectorSafe(exchange: string): Promise<BaseExchangeConnector> {
  const validExchange = validateExchange(exchange);
  try {
    return await ExchangeFactory.getExchange(validExchange);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to ${validExchange}: ${message}`);
  }
}