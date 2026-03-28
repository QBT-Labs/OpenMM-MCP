#!/usr/bin/env node
/**
 * openmm exchange list|add|remove — thin wrappers over vault exchange methods.
 *
 * Usage:
 *   openmm-exchange list
 *   openmm-exchange add <exchange>
 *   openmm-exchange remove <exchange>
 */

import { Vault } from '../vault/vault.js';
import type { ExchangeId, ExchangeCredentials } from '../vault/types.js';
import { prompt, confirm, unlockVault, requireVault } from '../cli/prompt.js';

const SUPPORTED_EXCHANGES: ExchangeId[] = [
  'mexc', 'gateio', 'bitget', 'kraken', 'binance', 'coinbase', 'okx',
];

async function list(vault: Vault): Promise<void> {
  requireVault(vault);
  await unlockVault(vault);

  const exchanges = vault.listExchanges();
  if (exchanges.length === 0) {
    console.log('(none)');
  } else {
    for (const id of exchanges) {
      const creds = vault.getExchange(id);
      console.log(`  ${id.padEnd(10)} ${creds?.apiKey.slice(0, 8)}...`);
    }
  }

  vault.lock();
}

async function add(vault: Vault, exchangeId: string): Promise<void> {
  if (!SUPPORTED_EXCHANGES.includes(exchangeId as ExchangeId)) {
    console.error(`❌ Unknown exchange: ${exchangeId}`);
    console.error('   Supported:', SUPPORTED_EXCHANGES.join(', '));
    process.exit(1);
  }

  requireVault(vault);
  await unlockVault(vault);

  const existing = vault.getExchange(exchangeId as ExchangeId);
  if (existing) {
    const update = await confirm(`⚠️  ${exchangeId} already configured. Update?`);
    if (!update) { vault.lock(); return; }
  }

  const apiKey = await prompt('API Key: ');
  const secret = await prompt('Secret: ', true);

  if (!apiKey.trim() || !secret.trim()) {
    console.error('❌ API Key and Secret are required');
    vault.lock();
    process.exit(1);
  }

  const credentials: ExchangeCredentials = { apiKey, secret };

  if (['bitget', 'coinbase', 'okx'].includes(exchangeId)) {
    const passphrase = await prompt('Passphrase: ', true);
    if (passphrase) credentials.passphrase = passphrase;
  }

  await vault.setExchange(exchangeId as ExchangeId, credentials);
  console.log(`✅ ${exchangeId} saved`);
  vault.lock();
}

async function remove(vault: Vault, exchangeId: string): Promise<void> {
  requireVault(vault);
  await unlockVault(vault);

  const confirmed = await confirm(`⚠️  Remove ${exchangeId}?`);
  if (!confirmed) { vault.lock(); return; }

  const removed = await vault.removeExchange(exchangeId as ExchangeId);
  console.log(removed ? `✅ ${exchangeId} removed` : `⚠️  ${exchangeId} not found`);
  vault.lock();
}

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);
  const vault = new Vault();

  switch (command) {
    case 'list':
      await list(vault);
      break;
    case 'add':
      if (!arg) { console.error('Usage: openmm-exchange add <exchange>'); process.exit(1); }
      await add(vault, arg.toLowerCase());
      break;
    case 'remove':
      if (!arg) { console.error('Usage: openmm-exchange remove <exchange>'); process.exit(1); }
      await remove(vault, arg.toLowerCase());
      break;
    default:
      console.log('Usage:');
      console.log('  openmm-exchange list');
      console.log('  openmm-exchange add <exchange>');
      console.log('  openmm-exchange remove <exchange>');
      console.log(`\nSupported: ${SUPPORTED_EXCHANGES.join(', ')}`);
      process.exit(command ? 1 : 0);
  }
}

main().catch((error: unknown) => {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
});
