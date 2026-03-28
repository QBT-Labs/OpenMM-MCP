#!/usr/bin/env node
/**
 * openmm policy show|set|reset — manage spending policy inside the vault.
 *
 * Usage:
 *   openmm-policy show
 *   openmm-policy set max-per-tx <amount>
 *   openmm-policy set max-per-day <amount>
 *   openmm-policy set allowed-chains <chain1,chain2>
 *   openmm-policy reset
 */

import { Vault } from '../vault/vault.js';
import type { SpendingPolicy } from '../vault/types.js';
import { confirm, unlockVault, requireVault } from '../cli/prompt.js';

async function show(vault: Vault): Promise<void> {
  requireVault(vault);
  await unlockVault(vault);

  const policy = vault.getPolicy();
  if (!policy) {
    console.log('No spending policy configured.');
  } else {
    if (policy.maxPerTx) console.log(`  Max per tx:          ${policy.maxPerTx} USDC`);
    if (policy.maxPerDay) console.log(`  Max per day:         ${policy.maxPerDay} USDC`);
    if (policy.allowedChains?.length) console.log(`  Allowed chains:      ${policy.allowedChains.join(', ')}`);
    if (policy.allowedRecipients?.length) console.log(`  Allowed recipients:  ${policy.allowedRecipients.join(', ')}`);
    if (policy.blockedRecipients?.length) console.log(`  Blocked recipients:  ${policy.blockedRecipients.join(', ')}`);
  }

  vault.lock();
}

async function set(vault: Vault, field: string, value: string): Promise<void> {
  requireVault(vault);
  await unlockVault(vault);

  const policy: SpendingPolicy = vault.getPolicy() || {};

  switch (field) {
    case 'max-per-tx':
      policy.maxPerTx = value;
      break;
    case 'max-per-day':
      policy.maxPerDay = value;
      break;
    case 'allowed-chains':
      policy.allowedChains = value.split(',').map((s) => s.trim());
      break;
    case 'allowed-recipients':
      policy.allowedRecipients = value.split(',').map((s) => s.trim().toLowerCase());
      break;
    case 'blocked-recipients':
      policy.blockedRecipients = value.split(',').map((s) => s.trim().toLowerCase());
      break;
    default:
      console.error(`❌ Unknown policy field: ${field}`);
      console.error('   Fields: max-per-tx, max-per-day, allowed-chains, allowed-recipients, blocked-recipients');
      vault.lock();
      process.exit(1);
  }

  await vault.setPolicy(policy);
  console.log(`✅ Policy updated: ${field} = ${value}`);
  vault.lock();
}

async function reset(vault: Vault): Promise<void> {
  requireVault(vault);

  const confirmed = await confirm('⚠️  Clear all spending policy limits?');
  if (!confirmed) return;

  await unlockVault(vault);
  await vault.resetPolicy();
  console.log('✅ Policy cleared');
  vault.lock();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, field, value] = args;
  const vault = new Vault();

  switch (command) {
    case 'show':
      await show(vault);
      break;
    case 'set':
      if (!field || !value) {
        console.error('Usage: openmm-policy set <field> <value>');
        process.exit(1);
      }
      await set(vault, field, value);
      break;
    case 'reset':
      await reset(vault);
      break;
    default:
      console.log('Usage:');
      console.log('  openmm-policy show');
      console.log('  openmm-policy set max-per-tx <amount>');
      console.log('  openmm-policy set max-per-day <amount>');
      console.log('  openmm-policy set allowed-chains <chain1,chain2>');
      console.log('  openmm-policy reset');
      process.exit(command ? 1 : 0);
  }
}

main().catch((error: unknown) => {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
});
