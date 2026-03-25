#!/usr/bin/env node
/**
 * OpenMM Credentials Server CLI
 * 
 * Start the credentials server that serves exchange credentials via IPC.
 * 
 * Usage:
 *   openmm-creds start       Start the credentials server
 *   openmm-creds status      Check if server is running
 */

import { createInterface } from 'readline';
import { CredentialsServer } from './server.js';
import { CredentialsClient } from './client.js';
import { Vault } from '../vault/vault.js';
import { DEFAULT_SOCKET_PATH } from './types.js';

/**
 * Prompt for password (hidden input)
 */
async function promptPassword(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('TTY required for password input');
  }

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
}

/**
 * Start the credentials server
 */
async function cmdStart(): Promise<void> {
  console.log('🔐 OpenMM Credentials Server\n');

  // Check vault exists
  const vault = new Vault();
  if (!vault.exists()) {
    console.error('❌ No vault found. Run "openmm-vault init" first.');
    process.exit(1);
  }

  // Get password
  const password = await promptPassword('Vault password: ');

  // Unlock vault
  try {
    await vault.unlock(password);
  } catch (error) {
    console.error('❌ Failed to unlock vault:', (error as Error).message);
    process.exit(1);
  }

  // Create and start server
  const server = new CredentialsServer();
  const loaded = await server.loadFromVault(vault);

  if (loaded.length === 0) {
    console.log('⚠️  No exchanges configured in vault');
    console.log('   Add with: openmm-vault add mexc');
    vault.lock();
    process.exit(1);
  }

  console.log(`📋 Loaded ${loaded.length} exchange(s): ${loaded.join(', ')}`);

  // Lock vault (credentials are now in server memory)
  vault.lock();

  // Start server
  await server.start();
  console.log('\n✅ Credentials server running');
  console.log('   MCP servers can now connect to get exchange credentials');
  console.log('   Press Ctrl+C to stop\n');

  // Handle shutdown
  const shutdown = () => {
    console.log('\n🛑 Stopping credentials server...');
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep running
  await new Promise(() => {});
}

/**
 * Check server status
 */
async function cmdStatus(): Promise<void> {
  const client = new CredentialsClient();

  if (!client.isAvailable()) {
    console.log('❌ Credentials server not running');
    console.log(`   Socket not found: ${DEFAULT_SOCKET_PATH}`);
    process.exit(1);
  }

  const healthy = await client.health();
  if (!healthy) {
    console.log('❌ Credentials server not responding');
    process.exit(1);
  }

  const exchanges = await client.listExchanges();
  console.log('✅ Credentials server running');
  console.log(`   Socket: ${DEFAULT_SOCKET_PATH}`);
  console.log(`   Exchanges: ${exchanges.join(', ') || '(none)'}`);
}

/**
 * Show usage
 */
function showUsage(): void {
  console.log(`
OpenMM Credentials Server

Usage:
  openmm-creds start     Start the credentials server
  openmm-creds status    Check if server is running

The credentials server:
  • Holds exchange API keys in memory
  • Serves credentials via Unix socket IPC
  • Password entered interactively (never stored in files)
  • MCP servers connect to get credentials

Workflow:
  1. Run "openmm-creds start" in a terminal
  2. Enter your vault password
  3. Start Claude Code - MCP will connect automatically
`);
}

/**
 * Main
 */
async function main(): Promise<void> {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'start':
        await cmdStart();
        break;
      case 'status':
        await cmdStatus();
        break;
      default:
        showUsage();
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

main();
