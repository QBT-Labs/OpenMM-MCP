import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const EXCHANGES_DATA = {
  exchanges: [
    {
      id: 'mexc',
      name: 'MEXC',
      credentials: ['MEXC_API_KEY', 'MEXC_SECRET_KEY'],
      features: ['spot trading', 'market data', 'websocket streams'],
      minOrderValue: '1 USDT',
    },
    {
      id: 'bitget',
      name: 'Bitget',
      credentials: ['BITGET_API_KEY', 'BITGET_SECRET', 'BITGET_PASSPHRASE'],
      features: ['spot trading', 'market data', 'websocket streams'],
      minOrderValue: '1 USDT',
    },
    {
      id: 'gateio',
      name: 'Gate.io',
      credentials: ['GATEIO_API_KEY', 'GATEIO_SECRET'],
      features: ['spot trading', 'market data', 'websocket streams'],
      minOrderValue: '1 USDT',
    },
    {
      id: 'kraken',
      name: 'Kraken',
      credentials: ['KRAKEN_API_KEY', 'KRAKEN_SECRET'],
      features: ['spot trading', 'market data', 'websocket streams', 'fiat pairs'],
      minOrderValue: '5 EUR/USD',
    },
  ],
};

export function registerExchangeResources(server: McpServer): void {
  server.resource('exchanges-list', 'exchanges://list', async () => ({
    contents: [
      {
        uri: 'exchanges://list',
        mimeType: 'application/json',
        text: JSON.stringify(EXCHANGES_DATA, null, 2),
      },
    ],
  }));
}
