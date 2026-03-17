import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';
import { TOOL_PRICING, isX402Enabled } from './x402-setup.js';

const SERVER_NAME = 'openmm-mcp-agent';
const SERVER_VERSION = '0.1.0';

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}

// Smithery uses this to scan tools/resources without real credentials.
export function createSandboxServer(): McpServer {
  return createServer();
}

async function startHttpServer(): Promise<void> {
  const { createServer: createHttpServer } = await import('node:http');
  const { StreamableHTTPServerTransport } =
    await import('@modelcontextprotocol/sdk/server/streamableHttp.js');

  const server = createServer();
  const port = parseInt(process.env.PORT || '3000', 10);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);

  if (isX402Enabled()) {
    // Configure @qbtlabs/x402 payment protocol
    const { configure, setToolPrices } = await import('@qbtlabs/x402');
    const { withX402Server } = await import('@qbtlabs/x402/transport');

    configure({
      evm: { address: process.env.X402_EVM_ADDRESS! },
      testnet: process.env.X402_TESTNET === 'true',
    });
    setToolPrices(TOOL_PRICING);

    // Create the payment-gated handler.
    // withX402Server intercepts tool calls, returns 402 for paid tools,
    // verifies X-PAYMENT headers, and settles via the facilitator.
    // It passes non-paid and already-paid requests through to the transport.
    const paymentGatedHandler = withX402Server({
      handler: async (req: Request) => {
        const body = await req.text();
        const parsedBody = body ? JSON.parse(body) : undefined;

        const { PassThrough } = await import('node:stream');
        const { ServerResponse, IncomingMessage } = await import('node:http');
        const fakeSocket = new PassThrough();
        const fakeReq = new IncomingMessage(fakeSocket as any);
        fakeReq.method = req.method;
        fakeReq.url = '/mcp';
        fakeReq.headers = Object.fromEntries(req.headers.entries());
        const fakeRes = new ServerResponse(fakeReq);

        const responseChunks: Buffer[] = [];
        fakeRes.write = ((chunk: any) => {
          responseChunks.push(Buffer.from(chunk));
          return true;
        }) as any;
        let resolveEnd: () => void;
        const endPromise = new Promise<void>((r) => {
          resolveEnd = r;
        });
        const originalEnd = fakeRes.end.bind(fakeRes);
        fakeRes.end = ((...args: any[]) => {
          if (args[0]) responseChunks.push(Buffer.from(args[0]));
          resolveEnd();
          return originalEnd();
        }) as any;

        await transport.handleRequest(fakeReq, fakeRes, parsedBody);
        await endPromise;

        return new Response(Buffer.concat(responseChunks), {
          status: fakeRes.statusCode,
          headers: fakeRes.getHeaders() as Record<string, string>,
        });
      },
    });

    const httpServer = createHttpServer(async (req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', x402: true }));
        return;
      }

      if (req.url === '/mcp') {
        // Convert Node.js IncomingMessage to Web Request for withX402Server
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks);

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers[key] = value;
        }

        const webRequest = new Request(`http://localhost:${port}${req.url}`, {
          method: req.method,
          headers,
          body: req.method !== 'GET' ? body : undefined,
        });

        const webResponse = await paymentGatedHandler(webRequest);

        const resHeaders: Record<string, string> = {};
        webResponse.headers.forEach((v, k) => {
          resHeaders[k] = v;
        });
        res.writeHead(webResponse.status, resHeaders);
        const responseBody = await webResponse.arrayBuffer();
        res.end(Buffer.from(responseBody));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    httpServer.listen(port, () => {
      process.stderr.write(`OpenMM MCP HTTP server (x402 enabled) listening on port ${port}\n`);
      process.stderr.write(`[x402] EVM: ${process.env.X402_EVM_ADDRESS}\n`);
      process.stderr.write(`[x402] Testnet: ${process.env.X402_TESTNET ?? 'false'}\n`);
      process.stderr.write(`[x402] Paid tools: ${Object.keys(TOOL_PRICING).length}\n`);
    });
  } else {
    // Standard HTTP transport without payment
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

    httpServer.listen(port, () => {
      process.stderr.write(`OpenMM MCP HTTP server listening on port ${port}\n`);
    });
  }
}

async function main(): Promise<void> {
  if (process.env.MCP_TRANSPORT === 'http') {
    await startHttpServer();
  } else {
    // Stdio transport — tools always free (no HTTP layer for payment)
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`OpenMM MCP Agent error: ${error}\n`);
  process.exit(1);
});
