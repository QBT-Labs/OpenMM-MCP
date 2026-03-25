/**
 * OpenMM Vault
 * 
 * Encrypted credential storage using AES-256-GCM with PBKDF2 key derivation.
 * Same security model as x402 vault for consistency across QBT Labs projects.
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';
import { homedir } from 'os';
import type {
  VaultData,
  VaultConfig,
  EncryptedVault,
  ExchangeId,
  ExchangeCredentials,
} from './types.js';
import {
  DEFAULT_VAULT_PATH,
  DEFAULT_ITERATIONS,
  VAULT_VERSION,
} from './types.js';

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

/**
 * Securely wipe a buffer
 */
export function wipeBuffer(buffer: Buffer): void {
  buffer.fill(0);
}

/**
 * OpenMM Vault - Encrypted credential storage
 */
export class Vault {
  private path: string;
  private iterations: number;
  private data: VaultData | null = null;
  private derivedKey: Buffer | null = null;

  constructor(config?: VaultConfig) {
    this.path = expandPath(config?.path || DEFAULT_VAULT_PATH);
    this.iterations = config?.iterations || DEFAULT_ITERATIONS;
  }

  /**
   * Check if vault exists
   */
  exists(): boolean {
    return existsSync(this.path);
  }

  /**
   * Get vault file path
   */
  getPath(): string {
    return this.path;
  }

  /**
   * Initialize a new vault
   */
  async init(password: string): Promise<void> {
    if (this.exists()) {
      throw new Error(`Vault already exists at ${this.path}`);
    }

    // Create empty vault data
    const now = new Date().toISOString();
    this.data = {
      version: VAULT_VERSION,
      createdAt: now,
      updatedAt: now,
      exchanges: {},
    };

    // Derive key and save
    await this.deriveKey(password);
    await this.save();
  }

  /**
   * Unlock an existing vault
   */
  async unlock(password: string): Promise<void> {
    if (!this.exists()) {
      throw new Error(`Vault not found at ${this.path}`);
    }

    const encrypted = JSON.parse(readFileSync(this.path, 'utf8')) as EncryptedVault;

    // Derive key from password
    const salt = Buffer.from(encrypted.salt, 'base64');
    this.derivedKey = pbkdf2Sync(
      password,
      salt,
      encrypted.iterations,
      32,
      'sha256'
    );

    // Decrypt
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', this.derivedKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted: Buffer;
    try {
      decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error('Invalid password or corrupted vault');
    }

    this.data = JSON.parse(decrypted.toString('utf8')) as VaultData;
    wipeBuffer(decrypted);
  }

  /**
   * Lock the vault (clear from memory)
   */
  lock(): void {
    if (this.derivedKey) {
      wipeBuffer(this.derivedKey);
      this.derivedKey = null;
    }
    this.data = null;
  }

  /**
   * Check if vault is unlocked
   */
  isUnlocked(): boolean {
    return this.data !== null && this.derivedKey !== null;
  }

  /**
   * Add or update exchange credentials
   */
  async setExchange(exchangeId: ExchangeId, credentials: ExchangeCredentials): Promise<void> {
    this.ensureUnlocked();
    
    this.data!.exchanges[exchangeId] = credentials;
    this.data!.updatedAt = new Date().toISOString();
    
    await this.save();
  }

  /**
   * Get exchange credentials
   */
  getExchange(exchangeId: ExchangeId): ExchangeCredentials | undefined {
    this.ensureUnlocked();
    return this.data!.exchanges[exchangeId];
  }

  /**
   * Remove exchange credentials
   */
  async removeExchange(exchangeId: ExchangeId): Promise<boolean> {
    this.ensureUnlocked();
    
    if (!this.data!.exchanges[exchangeId]) {
      return false;
    }
    
    delete this.data!.exchanges[exchangeId];
    this.data!.updatedAt = new Date().toISOString();
    
    await this.save();
    return true;
  }

  /**
   * List configured exchanges
   */
  listExchanges(): ExchangeId[] {
    this.ensureUnlocked();
    return Object.keys(this.data!.exchanges) as ExchangeId[];
  }

  /**
   * Get all exchange credentials (use carefully!)
   */
  getAllExchanges(): Partial<Record<ExchangeId, ExchangeCredentials>> {
    this.ensureUnlocked();
    return { ...this.data!.exchanges };
  }

  /**
   * Get vault info (without sensitive data)
   */
  getInfo(): { version: number; createdAt: string; updatedAt: string; exchanges: ExchangeId[] } {
    this.ensureUnlocked();
    return {
      version: this.data!.version,
      createdAt: this.data!.createdAt,
      updatedAt: this.data!.updatedAt,
      exchanges: this.listExchanges(),
    };
  }

  /**
   * Change vault password
   */
  async changePassword(newPassword: string): Promise<void> {
    this.ensureUnlocked();
    
    // Wipe old key
    if (this.derivedKey) {
      wipeBuffer(this.derivedKey);
    }
    
    // Derive new key and save
    await this.deriveKey(newPassword);
    await this.save();
  }

  /**
   * Delete the vault file
   */
  destroy(): void {
    this.lock();
    if (this.exists()) {
      unlinkSync(this.path);
    }
  }

  /**
   * Derive encryption key from password
   */
  private async deriveKey(password: string): Promise<void> {
    const salt = randomBytes(32);
    this.derivedKey = pbkdf2Sync(password, salt, this.iterations, 32, 'sha256');
    
    // Store salt for later (needed for decryption)
    (this as any)._salt = salt;
  }

  /**
   * Save vault to disk (encrypted)
   */
  private async save(): Promise<void> {
    this.ensureUnlocked();

    // Generate IV
    const iv = randomBytes(16);
    
    // Get or generate salt
    let salt: Buffer;
    if ((this as any)._salt) {
      salt = (this as any)._salt;
    } else {
      // Re-read existing salt from file
      const existing = JSON.parse(readFileSync(this.path, 'utf8')) as EncryptedVault;
      salt = Buffer.from(existing.salt, 'base64');
    }

    // Encrypt
    const cipher = createCipheriv('aes-256-gcm', this.derivedKey!, iv);
    const plaintext = Buffer.from(JSON.stringify(this.data), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Build encrypted vault
    const encrypted: EncryptedVault = {
      version: VAULT_VERSION,
      algorithm: 'aes-256-gcm',
      kdf: 'pbkdf2',
      iterations: this.iterations,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    // Ensure directory exists
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    // Write with secure permissions
    writeFileSync(this.path, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
    
    wipeBuffer(plaintext);
  }

  /**
   * Ensure vault is unlocked
   */
  private ensureUnlocked(): void {
    if (!this.isUnlocked()) {
      throw new Error('Vault is locked. Call unlock() first.');
    }
  }
}

/**
 * Create and return a vault instance
 */
export function createVault(config?: VaultConfig): Vault {
  return new Vault(config);
}
