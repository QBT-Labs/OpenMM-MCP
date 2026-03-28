#!/usr/bin/env node
/**
 * OpenMM Vault CLI
 *
 * Manage encrypted exchange and wallet credentials.
 *
 * Usage:
 *   openmm-vault init                Create a new vault (optionally add wallet)
 *   openmm-vault info                Show vault info
 *   openmm-vault add <exchange>      Add exchange credentials
 *   openmm-vault set-wallet          Set wallet private key
 *   openmm-vault remove-wallet       Remove wallet credentials
 *   openmm-vault list                List configured credentials
 *   openmm-vault remove <exchange>   Remove exchange credentials
 *   openmm-vault export              Export credentials (careful!)
 *   openmm-vault change-password     Change vault password
 *   openmm-vault destroy             Delete the vault
 */

import { createInterface } from 'readline';
import { Vault, createVault } from './vault.js';
import type { ExchangeId, ExchangeCredentials, WalletCredentials } from './types.js';

const SUPPORTED_EXCHANGES: ExchangeId[] = [
  'mexc', 'gateio', 'bitget', 'kraken', 'binance', 'coinbase', 'okx'
];

/**
 * Prompt for input (with optional hidden mode for passwords)
 */
async function prompt(question: string, hidden = false): Promise<string> {
  if (hidden && process.stdin.isTTY) {
    const { Writable } = await import('stream');
    const rl = createInterface({
      input: process.stdin,
      output: new Writable({
        write: (_chunk, _encoding, callback) => callback()
      }),
      terminal: true,
    });

    process.stdout.write(question);
    
    return new Promise((resolve) => {
      let password = '';
      
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      const onData = (char: string) => {
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004':
            process.stdin.setRawMode?.(false);
            process.stdin.removeListener('data', onData);
            process.stdin.pause();
            process.stdout.write('\n');
            rl.close();
            resolve(password);
            break;
          case '\u0003':
            process.stdout.write('\n');
            process.exit(0);
            break;
          case '\u007F':
          case '\b':
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            if (char.charCodeAt(0) >= 32) {
              password += char;
              process.stdout.write('*');
            }
            break;
        }
      };
      
      process.stdin.on('data', onData);
    });
  } else {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }
}

/**
 * Confirm action
 */
async function confirm(message: string): Promise<boolean> {
  const answer = await prompt(`${message} (y/N): `);
  return answer.toLowerCase() === 'y';
}

/**
 * Command: init
 */
async function cmdInit(vault: Vault): Promise<void> {
  if (vault.exists()) {
    console.error('❌ Vault already exists at', vault.getPath());
    console.error('   Use "openmm-vault destroy" to delete it first.');
    process.exit(1);
  }

  console.log('🔐 Creating new OpenMM vault...\n');
  
  const password = await prompt('Enter password: ', true);
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters');
    process.exit(1);
  }
  
  const confirmPw = await prompt('Confirm password: ', true);
  if (password !== confirmPw) {
    console.error('❌ Passwords do not match');
    process.exit(1);
  }

  await vault.init(password);
  console.log('\n✅ Vault created at', vault.getPath());

  // Offer to add wallet during init
  const addWallet = await confirm('\nAdd wallet now?');
  if (addWallet) {
    // Vault is already unlocked from init
    console.log('\n📝 Enter wallet credentials:\n');

    const privateKey = await prompt('Private key (hex, 0x...): ', true);
    if (!privateKey.trim()) {
      console.error('❌ Private key is required — skipping wallet');
    } else {
      const address = await prompt('EVM address (0x...): ');
      if (!address.trim() || !address.startsWith('0x')) {
        console.error('❌ Valid 0x address is required — skipping wallet');
      } else {
        const chain = await prompt('Chain [base]: ') || 'base';
        const wallet: WalletCredentials = { address, chain, privateKey };
        await vault.setWallet(wallet);
        console.log(`\n✅ Wallet saved (${address})`);
      }
    }
  }

  vault.lock();
  console.log('\n💡 Next: Add exchange credentials with "openmm-vault add mexc"');
}

/**
 * Command: info
 */
async function cmdInfo(vault: Vault): Promise<void> {
  if (!vault.exists()) {
    console.error('❌ No vault found. Run "openmm-vault init" first.');
    process.exit(1);
  }

  const password = await prompt('Password: ', true);
  await vault.unlock(password);

  const info = vault.getInfo();
  console.log('\n📦 OpenMM Vault');
  console.log('   Path:', vault.getPath());
  console.log('   Version:', info.version);
  if (info.name) console.log('   Name:', info.name);
  console.log('   Created:', info.createdAt);
  console.log('   Updated:', info.updatedAt);
  console.log('   Wallet:', info.hasWallet ? info.walletAddress : '(none)');
  console.log('   Exchanges:', info.exchanges.length ? info.exchanges.join(', ') : '(none)');

  vault.lock();
}

/**
 * Command: add
 */
async function cmdAdd(vault: Vault, exchangeId: string): Promise<void> {
  if (!SUPPORTED_EXCHANGES.includes(exchangeId as ExchangeId)) {
    console.error(`❌ Unknown exchange: ${exchangeId}`);
    console.error('   Supported:', SUPPORTED_EXCHANGES.join(', '));
    process.exit(1);
  }

  if (!vault.exists()) {
    console.error('❌ No vault found. Run "openmm-vault init" first.');
    process.exit(1);
  }

  const password = await prompt('Vault password: ', true);
  await vault.unlock(password);

  const existing = vault.getExchange(exchangeId as ExchangeId);
  if (existing) {
    const update = await confirm(`\n⚠️  ${exchangeId} already configured. Update?`);
    if (!update) {
      vault.lock();
      return;
    }
  }

  console.log(`\n📝 Enter ${exchangeId.toUpperCase()} credentials:\n`);
  
  const apiKey = await prompt('API Key: ');
  const secret = await prompt('Secret: ', true);

  if (!apiKey.trim()) {
    console.error('❌ API Key is required');
    vault.lock();
    process.exit(1);
  }
  if (!secret.trim()) {
    console.error('❌ Secret is required');
    vault.lock();
    process.exit(1);
  }

  const credentials: ExchangeCredentials = { apiKey, secret };

  // Some exchanges need passphrase
  if (['bitget', 'coinbase', 'okx'].includes(exchangeId)) {
    const passphrase = await prompt('Passphrase: ', true);
    if (passphrase) {
      credentials.passphrase = passphrase;
    }
  }

  await vault.setExchange(exchangeId as ExchangeId, credentials);
  console.log(`\n✅ ${exchangeId.toUpperCase()} credentials saved`);
  
  vault.lock();
}

/**
 * Command: list
 */
async function cmdList(vault: Vault): Promise<void> {
  if (!vault.exists()) {
    console.error('❌ No vault found. Run "openmm-vault init" first.');
    process.exit(1);
  }

  const password = await prompt('Password: ', true);
  await vault.unlock(password);

  const exchanges = vault.listExchanges();
  const wallet = vault.getWallet();

  console.log('\n📋 Configured Credentials:\n');

  // Wallet
  if (wallet) {
    console.log(`   🔑 wallet     ${wallet.address} (${wallet.chain})`);
  }

  // Exchanges
  if (exchanges.length === 0 && !wallet) {
    console.log('   (none)');
    console.log('\n💡 Add with: openmm-vault add <exchange>');
    console.log('   Set wallet: openmm-vault set-wallet');
  } else {
    for (const id of exchanges) {
      const creds = vault.getExchange(id);
      const keyPreview = creds?.apiKey.slice(0, 8) + '...';
      console.log(`   • ${id.padEnd(10)} ${keyPreview}`);
    }
  }

  vault.lock();
}

/**
 * Command: remove
 */
async function cmdRemove(vault: Vault, exchangeId: string): Promise<void> {
  if (!vault.exists()) {
    console.error('❌ No vault found.');
    process.exit(1);
  }

  const password = await prompt('Password: ', true);
  await vault.unlock(password);

  const confirmed = await confirm(`\n⚠️  Remove ${exchangeId} credentials?`);
  if (!confirmed) {
    vault.lock();
    return;
  }

  const removed = await vault.removeExchange(exchangeId as ExchangeId);
  
  if (removed) {
    console.log(`\n✅ ${exchangeId} removed`);
  } else {
    console.log(`\n⚠️  ${exchangeId} not found in vault`);
  }
  
  vault.lock();
}

/**
 * Command: export (dangerous!)
 */
async function cmdExport(vault: Vault): Promise<void> {
  if (!vault.exists()) {
    console.error('❌ No vault found.');
    process.exit(1);
  }

  console.log('\n⚠️  WARNING: This will display all credentials in plaintext!\n');
  const confirmed = await confirm('Are you sure?');
  if (!confirmed) return;

  const password = await prompt('Password: ', true);
  await vault.unlock(password);

  const exchanges = vault.getAllExchanges();
  const wallet = vault.getWallet();

  console.log('\n--- BEGIN CREDENTIALS ---');
  console.log(JSON.stringify({ wallet: wallet || null, exchanges }, null, 2));
  console.log('--- END CREDENTIALS ---\n');
  
  vault.lock();
}

/**
 * Command: change-password
 */
async function cmdChangePassword(vault: Vault): Promise<void> {
  if (!vault.exists()) {
    console.error('❌ No vault found.');
    process.exit(1);
  }

  const currentPassword = await prompt('Current password: ', true);
  await vault.unlock(currentPassword);

  const newPassword = await prompt('New password: ', true);
  if (newPassword.length < 8) {
    console.error('❌ Password must be at least 8 characters');
    vault.lock();
    process.exit(1);
  }
  
  const confirmPassword = await prompt('Confirm new password: ', true);
  if (newPassword !== confirmPassword) {
    console.error('❌ Passwords do not match');
    vault.lock();
    process.exit(1);
  }

  await vault.changePassword(newPassword);
  console.log('\n✅ Password changed');
  
  vault.lock();
}

/**
 * Command: destroy
 */
async function cmdDestroy(vault: Vault): Promise<void> {
  if (!vault.exists()) {
    console.log('ℹ️  No vault found at', vault.getPath());
    return;
  }

  console.log('\n⚠️  WARNING: This will permanently delete your vault!');
  console.log('   All stored credentials will be lost.\n');
  
  const confirmed = await confirm('Type "destroy" to confirm');
  if (!confirmed) return;

  const doubleConfirm = await prompt('Type "destroy" to confirm: ');
  if (doubleConfirm !== 'destroy') {
    console.log('Aborted.');
    return;
  }

  vault.destroy();
  console.log('\n✅ Vault deleted');
}

/**
 * Command: set-wallet
 */
async function cmdSetWallet(vault: Vault): Promise<void> {
  if (!vault.exists()) {
    console.error('❌ No vault found. Run "openmm-vault init" first.');
    process.exit(1);
  }

  const password = await prompt('Vault password: ', true);
  await vault.unlock(password);

  const existing = vault.getWallet();
  if (existing) {
    const update = await confirm(`\n⚠️  Wallet already configured (${existing.address}). Replace?`);
    if (!update) {
      vault.lock();
      return;
    }
  }

  console.log('\n📝 Enter wallet credentials:\n');

  const privateKey = await prompt('Private key (hex): ', true);
  if (!privateKey) {
    console.error('❌ Private key is required');
    vault.lock();
    process.exit(1);
  }

  const address = await prompt('EVM address (0x...): ');
  if (!address.startsWith('0x')) {
    console.error('❌ Address must start with 0x');
    vault.lock();
    process.exit(1);
  }

  const chain = await prompt('Chain [base]: ') || 'base';

  const wallet: WalletCredentials = { address, chain, privateKey };
  await vault.setWallet(wallet);
  console.log(`\n✅ Wallet saved (${address})`);

  vault.lock();
}

/**
 * Command: remove-wallet
 */
async function cmdRemoveWallet(vault: Vault): Promise<void> {
  if (!vault.exists()) {
    console.error('❌ No vault found.');
    process.exit(1);
  }

  const password = await prompt('Password: ', true);
  await vault.unlock(password);

  const confirmed = await confirm('\n⚠️  Remove wallet credentials?');
  if (!confirmed) {
    vault.lock();
    return;
  }

  const removed = await vault.removeWallet();
  if (removed) {
    console.log('\n✅ Wallet removed');
  } else {
    console.log('\n⚠️  No wallet found in vault');
  }

  vault.lock();
}

/**
 * Show usage
 */
function showUsage(): void {
  console.log(`
OpenMM Vault - Encrypted Exchange & Wallet Credentials

Usage:
  openmm-vault init                Create a new vault (optionally add wallet)
  openmm-vault info                Show vault info
  openmm-vault add <exchange>      Add exchange credentials
  openmm-vault set-wallet          Set wallet private key
  openmm-vault remove-wallet       Remove wallet credentials
  openmm-vault list                List configured credentials
  openmm-vault remove <exchange>   Remove exchange credentials
  openmm-vault export              Export credentials (careful!)
  openmm-vault change-password     Change vault password
  openmm-vault destroy             Delete the vault

Supported Exchanges:
  ${SUPPORTED_EXCHANGES.join(', ')}

Examples:
  openmm-vault init
  openmm-vault add mexc
  openmm-vault set-wallet
  openmm-vault list
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  const vault = createVault();

  try {
    switch (command) {
      case 'init':
        await cmdInit(vault);
        break;
      case 'info':
        await cmdInfo(vault);
        break;
      case 'add':
        if (!args[1]) {
          console.error('Usage: openmm-vault add <exchange>');
          process.exit(1);
        }
        await cmdAdd(vault, args[1]);
        break;
      case 'set-wallet':
        await cmdSetWallet(vault);
        break;
      case 'remove-wallet':
        await cmdRemoveWallet(vault);
        break;
      case 'list':
        await cmdList(vault);
        break;
      case 'remove':
        if (!args[1]) {
          console.error('Usage: openmm-vault remove <exchange>');
          process.exit(1);
        }
        await cmdRemove(vault, args[1]);
        break;
      case 'export':
        await cmdExport(vault);
        break;
      case 'change-password':
        await cmdChangePassword(vault);
        break;
      case 'destroy':
        await cmdDestroy(vault);
        break;
      case 'help':
      case '--help':
      case '-h':
        showUsage();
        break;
      default:
        showUsage();
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

main();
