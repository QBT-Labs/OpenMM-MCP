/**
 * Vault Loader
 *
 * Loads exchange credentials from the unified IPC socket and sets them as
 * env vars for compatibility with the OpenMM SDK (which expects env vars).
 *
 * Wallet credentials are NOT loaded into env vars — the MCP process signs
 * payments by calling UnifiedIPCClient.signPayment(), so the private key
 * never enters this process.
 */

import { existsSync } from 'fs';
import type { ExchangeId } from './types.js';
import { DEFAULT_SOCKET_PATH } from '../ipc/types.js';

const ENV_VAR_MAP: Record<ExchangeId, { key: string; secret: string; passphrase?: string }> = {
  mexc: { key: 'MEXC_API_KEY', secret: 'MEXC_SECRET' },
  gateio: { key: 'GATEIO_API_KEY', secret: 'GATEIO_SECRET' },
  bitget: { key: 'BITGET_API_KEY', secret: 'BITGET_SECRET', passphrase: 'BITGET_PASSPHRASE' },
  kraken: { key: 'KRAKEN_API_KEY', secret: 'KRAKEN_SECRET' },
  binance: { key: 'BINANCE_API_KEY', secret: 'BINANCE_SECRET' },
  coinbase: { key: 'COINBASE_API_KEY', secret: 'COINBASE_SECRET', passphrase: 'COINBASE_PASSPHRASE' },
  okx: { key: 'OKX_API_KEY', secret: 'OKX_SECRET', passphrase: 'OKX_PASSPHRASE' },
};

function setExchangeEnvVars(exchangeId: string, creds: { apiKey: string; secret: string; passphrase?: string }): boolean {
  const envVars = ENV_VAR_MAP[exchangeId as ExchangeId];
  if (!envVars) return false;

  process.env[envVars.key] = creds.apiKey;
  process.env[envVars.secret] = creds.secret;

  if (envVars.passphrase && creds.passphrase) {
    process.env[envVars.passphrase] = creds.passphrase;
  }

  return true;
}

async function loadFromSocket(): Promise<string[]> {
  const { UnifiedIPCClient } = await import('../ipc/client.js');
  const client = new UnifiedIPCClient();

  if (!client.isAvailable()) {
    return [];
  }

  try {
    await client.connect();

    const exchanges = await client.listExchanges();
    const loaded: string[] = [];

    for (const exchangeId of exchanges) {
      const creds = await client.getCredentials(exchangeId);
      if (!creds) continue;
      if (setExchangeEnvVars(exchangeId, creds)) {
        loaded.push(exchangeId);
      }
    }

    client.disconnect();

    if (loaded.length > 0) {
      console.error(`🔐 Loaded credentials from socket: ${loaded.join(', ')}`);
    }

    return loaded;
  } catch (error) {
    console.error('⚠️  Socket connection failed:', (error as Error).message);
    return [];
  }
}

export async function loadVaultCredentials(): Promise<string[]> {
  const loaded = await loadFromSocket();
  if (loaded.length > 0) {
    return loaded;
  }

  console.error('⚠️  No credentials loaded');
  console.error('   Run: openmm serve');

  return [];
}

export function isVaultAvailable(): boolean {
  const socketPath = process.env.OPENMM_SOCKET || DEFAULT_SOCKET_PATH;
  return existsSync(socketPath);
}
