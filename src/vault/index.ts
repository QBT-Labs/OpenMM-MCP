/**
 * OpenMM Vault Module
 * 
 * Encrypted credential storage for MCP servers.
 */

export { Vault, createVault, wipeBuffer } from './vault.js';
export { loadVaultCredentials, isVaultAvailable } from './loader.js';
export type {
  VaultData,
  VaultConfig,
  EncryptedVault,
  ExchangeId,
  ExchangeCredentials,
} from './types.js';
export {
  DEFAULT_VAULT_PATH,
  DEFAULT_ITERATIONS,
  VAULT_VERSION,
} from './types.js';
