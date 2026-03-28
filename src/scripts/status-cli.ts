#!/usr/bin/env node
/**
 * openmm-status — Show vault and socket status without requiring a password.
 *
 * Usage:
 *   openmm-status
 */

import { existsSync } from 'fs';
import { Vault } from '../vault/vault.js';
import { DEFAULT_SOCKET_PATH } from '../ipc/types.js';

async function main(): Promise<void> {
  const vault = new Vault();
  const socketPath = process.env.OPENMM_SOCKET || DEFAULT_SOCKET_PATH;

  console.log('OpenMM Status\n');

  // Vault
  if (vault.exists()) {
    console.log(`  Vault:    ✅ ${vault.getPath()}`);
  } else {
    console.log(`  Vault:    ❌ Not found (run: openmm-init)`);
    console.log(`  Socket:   ❌ Not running`);
    return;
  }

  // Socket — try ping for live status
  if (existsSync(socketPath)) {
    try {
      const { UnifiedIPCClient } = await import('../ipc/client.js');
      const client = new UnifiedIPCClient(socketPath);
      await client.connect();
      const status = await client.ping();
      client.disconnect();

      console.log(`  Socket:   ✅ Running (${socketPath})`);
      console.log(`  Wallet:   ${status.wallet || '(none)'}`);
      console.log(`  Exchanges: ${status.exchanges.length > 0 ? status.exchanges.join(', ') : '(none)'}`);
    } catch {
      console.log(`  Socket:   ⚠️  Stale socket at ${socketPath}`);
    }
  } else {
    console.log(`  Socket:   ❌ Not running (run: openmm serve)`);
  }
}

main().catch((error: unknown) => {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
});
