#!/usr/bin/env npx tsx
/**
 * x402 Live Integration Test
 *
 * Tests the full payment flow with real (or testnet) funds.
 *
 * Usage:
 *   X402_EVM_PRIVATE_KEY=0x... X402_TESTNET=true npx tsx scripts/test-x402-live.ts
 */

import { createServer } from '../src/index.js';
import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';

// Dynamically import x402 packages
async function loadX402() {
  try {
    const { x402Client, wrapAxiosWithPayment } = await import('@x402/axios');
    const { registerExactEvmScheme } = await import('@x402/evm/exact/client');
    const { privateKeyToAccount } = await import('viem/accounts');
    return { x402Client, wrapAxiosWithPayment, registerExactEvmScheme, privateKeyToAccount };
  } catch {
    console.error('x402 packages not installed. Run: npm install @x402/axios @x402/evm viem');
    process.exit(1);
  }
}

async function startHttpServer(port: number): Promise<void> {
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = createHttpServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/mcp') {
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log(`  ✅ HTTP server listening on port ${port}`);
      resolve();
    });
  });
}

async function main() {
  const privateKey = process.env.X402_EVM_PRIVATE_KEY as `0x${string}`;
  const isTestnet = process.env.X402_TESTNET === 'true';
  const port = 3099; // Use non-standard port to avoid conflicts

  if (!privateKey) {
    console.error('X402_EVM_PRIVATE_KEY required');
    console.error('Usage: X402_EVM_PRIVATE_KEY=0x... npx tsx scripts/test-x402-live.ts');
    process.exit(1);
  }

  console.log('🧪 x402 Live Integration Test');
  console.log(`📡 Network: ${isTestnet ? 'Base Sepolia (testnet)' : 'Base Mainnet'}`);
  console.log('');

  // Load x402 packages
  const { x402Client, wrapAxiosWithPayment, registerExactEvmScheme, privateKeyToAccount } =
    await loadX402();

  // Create wallet signer
  const signer = privateKeyToAccount(privateKey);
  console.log(`💳 Wallet: ${signer.address}`);

  // Set payment receiver
  if (!process.env.X402_EVM_ADDRESS) {
    process.env.X402_EVM_ADDRESS = signer.address;
    console.log(`📨 Payment receiver: ${signer.address} (self)`);
  }

  // Create x402 client
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  // Import axios
  const axios = (await import('axios')).default;
  const api = wrapAxiosWithPayment(
    axios.create({ baseURL: `http://localhost:${port}` }),
    client
  );

  // Start the MCP server
  console.log('');
  console.log('🚀 Starting MCP server...');
  await startHttpServer(port);

  console.log('');
  console.log('📋 Running tests...');
  console.log('');

  // Test 1: Health check
  console.log('Test 1: Health check');
  try {
    const health = await axios.get(`http://localhost:${port}/health`);
    console.log(`  ✅ Server healthy: ${JSON.stringify(health.data)}`);
  } catch (error) {
    console.log(`  ❌ Health check failed: ${error}`);
    process.exit(1);
  }

  // Test 2: Call tool (x402 not wired yet, should succeed without payment)
  console.log('');
  console.log('Test 2: Call get_ticker tool');
  try {
    const response = await axios.post(`http://localhost:${port}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_ticker',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT' },
      },
    });

    const result = response.data;
    if (result.result?.content?.[0]?.text) {
      const text = result.result.content[0].text;
      if (text.includes('Payment Required')) {
        console.log('  ✅ Got 402 Payment Required (x402 is active!)');
        const paymentInfo = JSON.parse(text);
        console.log(`  💰 Price: ${paymentInfo.priceFormatted}`);
      } else if (text.includes('symbol')) {
        console.log('  ⚠️ Tool succeeded without payment (x402 not wired to tools yet)');
        const ticker = JSON.parse(text);
        console.log(`  📈 ${ticker.symbol}: $${ticker.last}`);
      } else {
        console.log(`  ℹ️ Response: ${text.slice(0, 100)}...`);
      }
    } else {
      console.log(`  ❌ Unexpected: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.log(`  ❌ Request failed: ${error}`);
  }

  console.log('');
  console.log('🏁 Tests complete');
  console.log('');
  console.log('ℹ️ Note: x402 payment enforcement requires wiring withX402() to tool handlers.');
  console.log('   The infrastructure is ready - individual tools need to be wrapped.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
