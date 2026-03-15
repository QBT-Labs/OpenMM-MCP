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

  const server = createServer();
  const port = parseInt(process.env.PORT || '3000', 10);
  const evmAddress = process.env.X402_EVM_ADDRESS;

  if (isX402Enabled() && evmAddress) {
    // Use Civic's payment-aware transport — handles 402, verification, settlement at HTTP level
    const { makePaymentAwareServerTransport } = await import('@civic/x402-mcp');
    const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator';

    // Per-session transport map for multi-client support
    const sessions = new Map<string, { transport: ReturnType<typeof makePaymentAwareServerTransport>; server: McpServer }>();

    const httpServer = createHttpServer(async (req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', x402: true }));
        return;
      }

      if (req.url === '/mcp') {
        let body: any;
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          body = JSON.parse(Buffer.concat(chunks).toString());
        }

        // Check if this is a new initialize request (needs new session)
        const isInit = body && !Array.isArray(body) && body.method === 'initialize';
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (isInit || !sessionId) {
          // New session: create fresh server + transport
          const newSessionId = crypto.randomUUID();
          const transport = makePaymentAwareServerTransport(evmAddress, TOOL_PRICING, {
            facilitator: { url: facilitatorUrl as `${string}://${string}` },
            sessionIdGenerator: () => newSessionId,
          });
          const newServer = createServer();
          await newServer.connect(transport);

          // Store session BEFORE handling request so subsequent requests can find it
          sessions.set(newSessionId, { transport, server: newServer });

          if (body) {
            await transport.handleRequest(req, res, body);
          } else {
            await transport.handleRequest(req, res);
          }
        } else {
          // Existing session
          const session = sessions.get(sessionId);
          if (session) {
            if (body) {
              await session.transport.handleRequest(req, res, body);
            } else {
              await session.transport.handleRequest(req, res);
            }
          } else {
            res.writeHead(400);
            res.end('Unknown session');
          }
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    httpServer.listen(port, () => {
      process.stderr.write(`OpenMM MCP HTTP server (x402 enabled) listening on port ${port}\n`);
      process.stderr.write(`[x402] EVM: ${evmAddress}\n`);
      process.stderr.write(`[x402] Facilitator: ${facilitatorUrl}\n`);
      process.stderr.write(`[x402] Paid tools: ${Object.keys(TOOL_PRICING).length}\n`);
    });
  } else {
    // Standard HTTP transport without payment
    const { StreamableHTTPServerTransport } =
      await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const { randomUUID } = await import('node:crypto');

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
