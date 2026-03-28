#!/usr/bin/env node
/**
 * openmm serve
 *
 * Unlocks the vault interactively, then starts the unified IPC socket
 * at /tmp/openmm.sock (or OPENMM_SOCKET). MCP servers connect here
 * for credentials and payment signing.
 *
 * Usage:
 *   openmm serve
 */

import { createInterface } from 'readline';
import { Writable } from 'stream';
import { Vault } from '../vault/vault.js';
import { UnifiedIPCServer } from '../ipc/server.js';
import { DEFAULT_SOCKET_PATH } from '../ipc/types.js';

function questionHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const mutedOut = new Writable({
      write: (_chunk, _encoding, callback) => callback(),
    });

    process.stdout.write(prompt);

    const rl = createInterface({
      input: process.stdin,
      output: mutedOut,
      terminal: true,
    });

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);

    let password = '';

    const onData = (char: Buffer) => {
      const c = char.toString();

      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
        stdin.setRawMode?.(wasRaw ?? false);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      } else if (c === '\u007F' || c === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (c.charCodeAt(0) >= 32) {
        password += c;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const socketPath = process.env.OPENMM_SOCKET || DEFAULT_SOCKET_PATH;

  console.log('🔐 OpenMM Unified Server\n');

  const vault = new Vault();

  if (!vault.exists()) {
    console.error('❌ No vault found at', vault.getPath());
    console.error('   Create one with: openmm-vault init');
    process.exit(1);
  }

  const password = await questionHidden('Vault password: ');
  if (!password) {
    console.error('❌ Password required');
    process.exit(1);
  }

  try {
    await vault.unlock(password);
  } catch (error) {
    console.error('❌ Failed to unlock vault:', (error as Error).message);
    process.exit(1);
  }

  console.log('✅ Vault decrypted');

  const server = new UnifiedIPCServer();
  const info = server.loadFromVault(vault);
  vault.lock();

  if (info.walletAddress) {
    console.log(`✅ Wallet: ${info.walletAddress}`);
  }
  if (info.exchanges.length > 0) {
    console.log(`✅ Exchanges: ${info.exchanges.join(', ')}`);
  } else {
    console.error('⚠️  No exchanges configured');
  }

  await server.start(socketPath);
  console.log(`✅ Unified socket listening on ${socketPath}  (mode 0600)`);
  console.log('\nPress Ctrl+C to stop\n');

  const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    server.stop(socketPath);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  setInterval(() => {}, 60_000);
}

main().catch((error: unknown) => {
  console.error('Error:', (error as Error).message);
  process.exit(1);
});
