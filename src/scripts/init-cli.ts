#!/usr/bin/env node
/**
 * openmm-init — Create a new vault with wallet and exchange credentials.
 *
 * Usage:
 *   openmm-init
 *   openmm-init --import <privateKey>
 */

import { randomBytes } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { Vault } from '../vault/vault.js';
import type { ExchangeId, ExchangeCredentials, WalletCredentials } from '../vault/types.js';
import { prompt, confirm } from '../cli/prompt.js';

const SUPPORTED_EXCHANGES: ExchangeId[] = [
  'mexc',
  'gateio',
  'bitget',
  'kraken',
  'binance',
  'coinbase',
  'okx',
];

function generatePrivateKey(): string {
  return '0x' + randomBytes(32).toString('hex');
}

function deriveAddress(privateKey: string): string {
  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    return account.address;
  } catch {
    return '0x' + randomBytes(20).toString('hex');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const importIdx = args.indexOf('--import');
  const importKey = importIdx !== -1 ? args[importIdx + 1] : null;

  const vault = new Vault();

  if (vault.exists()) {
    console.error('❌ Vault already exists at', vault.getPath());
    console.error('   Use "openmm-vault destroy" to delete it first.');
    process.exit(1);
  }

  console.log('🔐 OpenMM Setup\n');

  const password = await prompt('Enter vault password (8+ chars): ', true);
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

  // Wallet setup
  let privateKey: string;
  if (importKey) {
    privateKey = importKey.startsWith('0x') ? importKey : `0x${importKey}`;
    console.log('\n📥 Importing wallet key...');
  } else {
    console.log('\n🔑 Generating new wallet...');
    privateKey = generatePrivateKey();
  }

  const address = deriveAddress(privateKey);
  const chain = (await prompt('Chain [base-sepolia]: ')) || 'base-sepolia';

  const wallet: WalletCredentials = { address, chain, privateKey };
  await vault.setWallet(wallet);
  console.log(`✅ Wallet: ${address} (${chain})`);

  // Exchange setup
  const addExchanges = await confirm('\nAdd exchange credentials?');
  if (addExchanges) {
    let addMore = true;
    while (addMore) {
      console.log(`\nSupported: ${SUPPORTED_EXCHANGES.join(', ')}`);
      const exchangeId = (await prompt('Exchange: ')).toLowerCase();

      if (!SUPPORTED_EXCHANGES.includes(exchangeId as ExchangeId)) {
        console.error(`❌ Unknown exchange: ${exchangeId}`);
        continue;
      }

      const apiKey = await prompt('API Key: ');
      const secret = await prompt('Secret: ', true);

      if (!apiKey.trim() || !secret.trim()) {
        console.error('❌ API Key and Secret are required');
        continue;
      }

      const credentials: ExchangeCredentials = { apiKey, secret };

      if (['bitget', 'coinbase', 'okx'].includes(exchangeId)) {
        const passphrase = await prompt('Passphrase: ', true);
        if (passphrase) credentials.passphrase = passphrase;
      }

      await vault.setExchange(exchangeId as ExchangeId, credentials);
      console.log(`✅ ${exchangeId} saved`);

      addMore = await confirm('Add another exchange?');
    }
  }

  vault.lock();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Add this to your claude.json:\n');
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          openmm: {
            type: 'stdio',
            command: 'node',
            args: ['dist/index.js'],
            env: {
              MCP_TRANSPORT: 'stdio',
              OPENMM_SOCKET: '/tmp/openmm.sock',
              PAYMENT_SERVER: 'https://mcp.openmm.io',
              X402_TESTNET: 'true',
            },
          },
        },
      },
      null,
      2
    )
  );
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log("\nRun 'openmm serve' to start");
}

main().catch((error: unknown) => {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
});
