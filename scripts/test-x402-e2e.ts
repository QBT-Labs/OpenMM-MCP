/**
 * x402 End-to-End Test
 *
 * Spawns the MCP server as a child process, connects as an x402-compatible
 * MCP client, calls get_ticker with automatic payment, and prints the result
 * including the settlement transaction hash.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { wrapMCPClientWithPayment, x402Client } from '@x402/mcp';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

async function main() {
  const privateKey = process.env.X402_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    console.error('X402_PRIVATE_KEY not set');
    process.exit(1);
  }

  // 1. Create EVM signer from private key
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  }).extend(publicActions);

  // toClientEvmSigner reads signer.address which is undefined on viem wallet clients
  // The address lives on signer.account.address, so we patch it
  (walletClient as any).address = account.address;
  const signer = toClientEvmSigner(walletClient);

  console.log(`\n🔑 Payer wallet: ${account.address}`);
  console.log(`💰 Network: Base Sepolia (eip155:84532)\n`);

  // 2. Spawn the MCP server
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: {
      ...process.env,
      X402_EVM_ADDRESS: process.env.X402_EVM_ADDRESS!,
      X402_TESTNET: 'true',
    },
  });

  const client = new Client({ name: 'x402-test-client', version: '1.0.0' });
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');

  // 3. Wrap client with x402 payment support
  const paymentClient = new x402Client();
  registerExactEvmScheme(paymentClient, {
    signer,
    networks: ['eip155:84532'],
  });

  const paidClient = wrapMCPClientWithPayment(client, paymentClient);

  // 4. Call a paid tool — payment is handled automatically
  console.log('📡 Calling get_ticker (BTC/USDT on kraken)...\n');

  try {
    const result = await paidClient.callTool(
      'get_ticker',
      { exchange: 'kraken', symbol: 'BTC/USDT' },
    );

    console.log('📊 Result:');
    if (result.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text') {
          const parsed = JSON.parse(item.text);
          console.log(JSON.stringify(parsed, null, 2));
        }
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    // Check for payment response in _meta
    if (result._meta?.['x402/payment-response']) {
      console.log('\n💳 Payment Response:');
      console.log(JSON.stringify(result._meta['x402/payment-response'], null, 2));
    }
  } catch (err: any) {
    console.error('❌ Error:', err.message || err);
    if (err.data) console.error('Data:', JSON.stringify(err.data, null, 2));
  }

  await client.close();
  console.log('\n✅ Done');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
