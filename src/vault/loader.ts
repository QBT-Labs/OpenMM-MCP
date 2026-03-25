/**
 * Vault Loader
 * 
 * Loads exchange credentials from vault and sets them as env vars
 * for compatibility with the OpenMM SDK (which expects env vars).
 * 
 * This runs at MCP server startup BEFORE exchange connections are made.
 */

import { Vault } from './vault.js';
import type { ExchangeId } from './types.js';

// Map of exchange IDs to env var names
const ENV_VAR_MAP: Record<ExchangeId, { key: string; secret: string; passphrase?: string }> = {
  mexc: { key: 'MEXC_API_KEY', secret: 'MEXC_SECRET' },
  gateio: { key: 'GATEIO_API_KEY', secret: 'GATEIO_SECRET' },
  bitget: { key: 'BITGET_API_KEY', secret: 'BITGET_SECRET', passphrase: 'BITGET_PASSPHRASE' },
  kraken: { key: 'KRAKEN_API_KEY', secret: 'KRAKEN_SECRET' },
  binance: { key: 'BINANCE_API_KEY', secret: 'BINANCE_SECRET' },
  coinbase: { key: 'COINBASE_API_KEY', secret: 'COINBASE_SECRET', passphrase: 'COINBASE_PASSPHRASE' },
  okx: { key: 'OKX_API_KEY', secret: 'OKX_SECRET', passphrase: 'OKX_PASSPHRASE' },
};

/**
 * Load credentials from vault and set as environment variables.
 * 
 * @param password - Vault password (from env or prompt)
 * @returns List of exchanges loaded
 */
export async function loadVaultCredentials(password?: string): Promise<string[]> {
  const vault = new Vault();
  
  if (!vault.exists()) {
    console.log('⚠️  No OpenMM vault found at', vault.getPath());
    console.log('   Create one with: openmm-vault init && openmm-vault add <exchange>');
    return [];
  }
  
  // Get password from env if not provided
  const vaultPassword = password || process.env.OPENMM_VAULT_PASSWORD;
  if (!vaultPassword) {
    console.log('⚠️  No vault password provided');
    console.log('   Set OPENMM_VAULT_PASSWORD env var or start signer interactively');
    return [];
  }
  
  try {
    await vault.unlock(vaultPassword);
  } catch (error) {
    console.error('❌ Failed to unlock vault:', (error as Error).message);
    return [];
  }
  
  const loaded: string[] = [];
  const exchanges = vault.listExchanges();
  
  for (const exchangeId of exchanges) {
    const creds = vault.getExchange(exchangeId);
    if (!creds) continue;
    
    const envVars = ENV_VAR_MAP[exchangeId];
    if (!envVars) continue;
    
    // Set env vars
    process.env[envVars.key] = creds.apiKey;
    process.env[envVars.secret] = creds.secret;
    
    if (envVars.passphrase && creds.passphrase) {
      process.env[envVars.passphrase] = creds.passphrase;
    }
    
    loaded.push(exchangeId);
  }
  
  vault.lock(); // Clear from memory
  
  if (loaded.length > 0) {
    console.log(`🔐 Loaded credentials from vault: ${loaded.join(', ')}`);
  }
  
  return loaded;
}

/**
 * Check if vault credentials are available (without unlocking)
 */
export function isVaultAvailable(): boolean {
  const vault = new Vault();
  return vault.exists();
}
