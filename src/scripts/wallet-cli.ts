#!/usr/bin/env node
/**
 * openmm wallet info|export|set
 *
 * Usage:
 *   openmm-wallet info
 *   openmm-wallet export
 *   openmm-wallet set
 */

import { Vault } from '../vault/vault.js';
import type { WalletCredentials } from '../vault/types.js';
import { prompt, confirm, unlockVault, requireVault } from '../cli/prompt.js';

async function info(vault: Vault): Promise<void> {
  requireVault(vault);
  await unlockVault(vault);

  const wallet = vault.getWallet();
  if (!wallet) {
    console.log('No wallet configured. Run: openmm-wallet set');
  } else {
    console.log(`  Address: ${wallet.address}`);
    console.log(`  Chain:   ${wallet.chain}`);
  }

  vault.lock();
}

async function exportKey(vault: Vault): Promise<void> {
  requireVault(vault);

  console.log('\n⚠️  This will display your private key in plaintext.\n');
  const ack = await prompt('Type "I understand" to continue: ');
  if (ack !== 'I understand') {
    console.log('Aborted.');
    return;
  }

  await unlockVault(vault);

  const wallet = vault.getWallet();
  if (!wallet) {
    console.log('No wallet configured.');
  } else {
    console.log(`\n  Address:     ${wallet.address}`);
    console.log(`  Chain:       ${wallet.chain}`);
    console.log(`  Private Key: ${wallet.privateKey}\n`);
  }

  vault.lock();
}

async function set(vault: Vault): Promise<void> {
  requireVault(vault);
  await unlockVault(vault);

  const existing = vault.getWallet();
  if (existing) {
    const replace = await confirm(`⚠️  Wallet already set (${existing.address}). Replace?`);
    if (!replace) { vault.lock(); return; }
  }

  const privateKey = await prompt('Private key (hex, 0x...): ', true);
  if (!privateKey.trim()) {
    console.error('❌ Private key is required');
    vault.lock();
    process.exit(1);
  }

  const address = await prompt('EVM address (0x...): ');
  if (!address.trim() || !address.startsWith('0x')) {
    console.error('❌ Valid 0x address is required');
    vault.lock();
    process.exit(1);
  }

  const chain = await prompt('Chain [base]: ') || 'base';

  const wallet: WalletCredentials = { address, chain, privateKey };
  await vault.setWallet(wallet);
  console.log(`✅ Wallet saved (${address})`);
  vault.lock();
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  const vault = new Vault();

  switch (command) {
    case 'info':
      await info(vault);
      break;
    case 'export':
      await exportKey(vault);
      break;
    case 'set':
      await set(vault);
      break;
    default:
      console.log('Usage:');
      console.log('  openmm-wallet info     Show wallet address and chain');
      console.log('  openmm-wallet export   Display private key (dangerous)');
      console.log('  openmm-wallet set      Set wallet credentials');
      process.exit(command ? 1 : 0);
  }
}

main().catch((error: unknown) => {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
});
