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
        url: 'https://openmm-mcp.qbtlabs.io/mcp',
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
      // Copy Worker env bindings into process.env so the openmm SDK
      // (which reads process.env at import time) can find them.
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string') {
          process.env[key] = value;
        }
      }

      // The openmm SDK calls process.exit(1) on validation errors.
      // In Workers this is fatal, so convert it to a thrown error.
      process.exit = ((code?: number) => {
        throw new Error(`process.exit(${code}) called`);
      }) as never;

      const { createServer } = await import('./server.js');
      const { WebStandardStreamableHTTPServerTransport } =
        await import('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js');

      const server = createServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      return transport.handleRequest(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
