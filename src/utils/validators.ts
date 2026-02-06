import { z } from 'zod';

export const ExchangeParam = z
  .string()
  .describe('Exchange to query. Supported: mexc, gateio, bitget, kraken');

export const SymbolParam = z.string().describe('Trading pair symbol (e.g., BTC/USDT, INDY/USDT)');

export const OptionalSymbolParam = z
  .string()
  .optional()
  .describe('Optional trading pair to filter by (e.g., BTC/USDT). Returns all if omitted.');

export function LimitParam(defaultValue: number, max: number) {
  return z
    .number()
    .min(1)
    .max(max)
    .default(defaultValue)
    .describe(`Number of results to return (default: ${defaultValue}, max: ${max})`);
}

export function validateSymbol(symbol: string): string {
  if (!symbol) {
    throw new Error('Symbol is required');
  }
  const upper = symbol.toUpperCase();
  if (!/^[A-Z]+\/[A-Z]+$/.test(upper) && !/^[A-Z]+[A-Z]+$/.test(upper)) {
    throw new Error(`Invalid symbol format: ${symbol}. Expected: BTC/USDT or BTCUSDT`);
  }
  return upper;
}
