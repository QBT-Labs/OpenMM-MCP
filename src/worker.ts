// All heavy imports are deferred to inside the fetch handler to avoid
// global-scope I/O, which Cloudflare Workers disallow.

interface Env {
  [key: string]: string | undefined;
}

interface JWTPayload {
  tool: string;
  exchange: string;
  payment_tx: string;
  issued_at: number;
  expires_at: number;
}

/**
 * Generate a signed JWT for tool access.
 * In production, use AWS KMS or similar HSM for signing.
 */
async function generateJWT(payload: JWTPayload, env: Env): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const secret = env.JWT_SECRET || 'development-secret-change-in-production';
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '');
  
  const data = `${encodedHeader}.${encodedPayload}`;
  
  // Use Web Crypto API for HMAC-SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '');
  
  return `${data}.${encodedSignature}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/.well-known/mcp/server-card.json' && request.method === 'GET') {
      const card = {
        name: 'openmm-mcp-agent',
        version: '1.0.4',
        description:
          'MCP server for OpenMM — exposes market data, account, trading, and strategy tools to AI agents',
        url: 'https://mcp.openmm.io/mcp',
        transport: { type: 'streamable-http' },
        capabilities: {
          tools: [
            { name: 'get_ticker' },
            { name: 'get_orderbook' },
            { name: 'get_trades' },
            { name: 'get_balance' },
            { name: 'list_orders' },
            { name: 'create_order' },
            { name: 'cancel_order' },
            { name: 'cancel_all_orders' },
            { name: 'start_grid_strategy' },
            { name: 'stop_strategy' },
            { name: 'get_strategy_status' },
            { name: 'get_cardano_price' },
            { name: 'discover_pools' },
          ],
        },
      };
      return new Response(JSON.stringify(card), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Split payment verification endpoint
    if (url.pathname === '/verify-payment' && request.method === 'POST') {
      const { configure, setToolPrices, getToolPrice } = await import('@qbtlabs/x402');
      const { parsePaymentHeader } = await import('@qbtlabs/x402');
      const { verifyWithFacilitator, settleWithFacilitator, buildFacilitatorRequirements } = await import('@qbtlabs/x402');
      const { TOOL_PRICING } = await import('./payment/index.js');

      // Configure x402
      if (env.X402_EVM_ADDRESS) {
        configure({
          evm: { address: env.X402_EVM_ADDRESS },
          testnet: env.X402_TESTNET === 'true',
        });
        setToolPrices(TOOL_PRICING as any);
      }

      const body = await request.json() as { tool?: string; exchange?: string };
      const tool = body.tool || 'unknown';
      const exchange = body.exchange || '';

      const paymentHeader = request.headers.get('X-PAYMENT');

      // No payment → return 402 with requirements
      if (!paymentHeader) {
        const pricing = getToolPrice(tool);
        const requirements = buildFacilitatorRequirements(tool);
        
        return new Response(
          JSON.stringify({
            error: 'Payment Required',
            price: pricing.price,
            ...requirements,
          }),
          {
            status: 402,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Parse payment
      const payment = parsePaymentHeader(paymentHeader);
      if (!payment) {
        return new Response(
          JSON.stringify({ error: 'Invalid payment header format' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Verify via facilitator
      const verification = await verifyWithFacilitator(payment, tool);
      if (!verification.valid) {
        return new Response(
          JSON.stringify({ error: 'Payment verification failed', reason: verification.error }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Settle payment
      const settlement = await settleWithFacilitator(payment, tool);
      if (!settlement.success) {
        return new Response(
          JSON.stringify({ error: 'Payment settlement failed', reason: settlement.error }),
          { status: 402, headers: { 'Content-Type': 'application/json' } },
        );
      }
      
      const txHash = settlement.txHash || 'pending';

      // Issue JWT (simplified - in production use proper JWT signing)
      const jwt = await generateJWT({
        tool,
        exchange,
        payment_tx: txHash,
        issued_at: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 300,
      }, env);

      return new Response(
        JSON.stringify({ jwt, txHash }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.pathname === '/mcp') {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string') {
          process.env[key] = value;
        }
      }

      process.exit = ((code?: number) => {
        throw new Error(`process.exit(${code}) called`);
      }) as never;

      const { configure, setToolPrices } = await import('@qbtlabs/x402');
      const { withX402Server } = await import('@qbtlabs/x402/transport');
      const { TOOL_PRICING } = await import('./payment/index.js');
      const { createServer } = await import('./server.js');
      const { WebStandardStreamableHTTPServerTransport } =
        await import('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js');

      // Configure x402 payment protocol
      if (env.X402_EVM_ADDRESS) {
        configure({
          evm: { address: env.X402_EVM_ADDRESS },
          testnet: env.X402_TESTNET === 'true',
        });
        setToolPrices(TOOL_PRICING as any);
      }

      const server = await createServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);

      // Wrap the transport handler with x402 payment middleware
      const paymentGatedHandler = withX402Server({
        handler: (req: Request) => transport.handleRequest(req),
      });

      return paymentGatedHandler(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
