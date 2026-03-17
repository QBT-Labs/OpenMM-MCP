// All heavy imports are deferred to inside the fetch handler to avoid
// global-scope I/O, which Cloudflare Workers disallow.

interface Env {
  [key: string]: string | undefined;
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
