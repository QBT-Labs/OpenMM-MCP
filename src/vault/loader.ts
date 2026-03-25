/**
 * Vault/Credentials Loader
 * 
 * Loads exchange credentials and sets them as env vars.
 * 
 * Priority:
 * 1. Credentials Server (via IPC socket) - SECURE, recommended
 * 2. Vault with password env var - Less secure, for backward compatibility
 * 3. Direct env vars - Legacy mode
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
 * Load credentials from credentials server (most secure)
 */
async function loadFromCredentialsServer(): Promise<string[] | null> {
  try {
    const { CredentialsClient } = await import('../credentials/client.js');
    const client = new CredentialsClient();
    
    if (!client.isAvailable()) {
      return null;
    }
    
    const healthy = await client.health();
    if (!healthy) {
      console.log('⚠️  Credentials server not responding');
      return null;
    }
    
    const exchanges = await client.listExchanges();
    const loaded: string[] = [];
    
    for (const exchangeId of exchanges) {
      const envVars = ENV_VAR_MAP[exchangeId as ExchangeId];
      if (!envVars) continue;
      
      try {
        const creds = await client.getCredentials(exchangeId);
        
        process.env[envVars.key] = creds.apiKey;
        process.env[envVars.secret] = creds.secret;
        
        if (envVars.passphrase && creds.passphrase) {
          process.env[envVars.passphrase] = creds.passphrase;
        }
        
        loaded.push(exchangeId);
      } catch {
        console.log(`⚠️  Failed to get credentials for ${exchangeId}`);
      }
    }
    
    if (loaded.length > 0) {
      console.log(`🔐 Loaded credentials from server: ${loaded.join(', ')}`);
    }
    
    return loaded;
  } catch {
    return null;
  }
}

/**
 * Load credentials from vault (requires password in env)
 */
async function loadFromVault(): Promise<string[]> {
  const vault = new Vault();
  
  if (!vault.exists()) {
    return [];
  }
  
  const vaultPassword = process.env.OPENMM_VAULT_PASSWORD;
  if (!vaultPassword) {
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
    
    process.env[envVars.key] = creds.apiKey;
    process.env[envVars.secret] = creds.secret;
    
    if (envVars.passphrase && creds.passphrase) {
      process.env[envVars.passphrase] = creds.passphrase;
    }
    
    loaded.push(exchangeId);
  }
  
  vault.lock();
  
  if (loaded.length > 0) {
    console.log(`🔐 Loaded credentials from vault: ${loaded.join(', ')}`);
  }
  
  return loaded;
}

/**
 * Load exchange credentials.
 * Tries credentials server first, then vault, then falls back to env vars.
 */
export async function loadVaultCredentials(): Promise<string[]> {
  // Try credentials server first (most secure)
  const fromServer = await loadFromCredentialsServer();
  if (fromServer !== null) {
    return fromServer;
  }
  
  // Fall back to vault with password env var
  const fromVault = await loadFromVault();
  if (fromVault.length > 0) {
    return fromVault;
  }
  
  // Check if legacy env vars are set
  const legacyExchanges: string[] = [];
  for (const [exchangeId, envVars] of Object.entries(ENV_VAR_MAP)) {
    if (process.env[envVars.key] && process.env[envVars.secret]) {
      legacyExchanges.push(exchangeId);
    }
  }
  
  if (legacyExchanges.length > 0) {
    console.log(`📋 Using legacy env vars for: ${legacyExchanges.join(', ')}`);
  }
  
  return legacyExchanges;
}

/**
 * Check if credentials are available (any source)
 */
export function isVaultAvailable(): boolean {
  const vault = new Vault();
  return vault.exists();
}

/**
 * Check if credentials server is available
 */
export async function isCredentialsServerAvailable(): Promise<boolean> {
  try {
    const { CredentialsClient } = await import('../credentials/client.js');
    const client = new CredentialsClient();
    return client.isAvailable() && await client.health();
  } catch {
    return false;
  }
}
