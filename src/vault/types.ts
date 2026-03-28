/**
 * OpenMM Vault Types
 *
 * Universal encrypted credential storage for MCP servers.
 * Keeps sensitive data (API keys, secrets, wallet keys) out of environment variables.
 */

/**
 * Exchange credentials stored in the vault
 */
export interface ExchangeCredentials {
  apiKey: string;
  secret: string;
  passphrase?: string;  // Required for some exchanges (e.g., Bitget)
  subaccount?: string;  // Optional subaccount identifier
}

/**
 * Supported exchanges
 */
export type ExchangeId = 'mexc' | 'gateio' | 'bitget' | 'kraken' | 'binance' | 'coinbase' | 'okx';

/**
 * Wallet credentials for x402 payment signing
 */
export interface WalletCredentials {
  address: string;       // EVM address (0x...)
  chain: string;         // e.g. 'base', 'base-sepolia'
  privateKey: string;    // Hex-encoded private key (encrypted at rest)
}

export interface SpendingPolicy {
  maxPerTx?: string;
  maxPerDay?: string;
  allowedChains?: string[];
  allowedRecipients?: string[];
  blockedRecipients?: string[];
}

export interface VaultData {
  version: number;
  name?: string;
  createdAt: string;
  updatedAt: string;
  wallet?: WalletCredentials;
  exchanges: Partial<Record<ExchangeId, ExchangeCredentials>>;
  policy?: SpendingPolicy;
}

/**
 * Encrypted vault file format
 */
export interface EncryptedVault {
  version: number;
  algorithm: 'aes-256-gcm';
  kdf: 'pbkdf2';
  iterations: number;
  salt: string;      // Base64
  iv: string;        // Base64
  authTag: string;   // Base64
  ciphertext: string; // Base64
}

/**
 * Vault configuration
 */
export interface VaultConfig {
  /** Path to vault file. Default: ~/.openmm/vault.enc */
  path?: string;
  /** PBKDF2 iterations. Default: 100000 */
  iterations?: number;
}

/**
 * Default paths
 */
export const DEFAULT_VAULT_PATH = '~/.openmm/vault.enc';
export const DEFAULT_ITERATIONS = 100000;
export const VAULT_VERSION = 2;
