import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';

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
  const { randomUUID } = await import('node:crypto');
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const port = parseInt(process.env.PORT || '3000', 10);
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

async function main(): Promise<void> {
  if (process.env.MCP_TRANSPORT === 'http') {
    await startHttpServer();
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`OpenMM MCP Agent error: ${error}\n`);
  process.exit(1);
});
