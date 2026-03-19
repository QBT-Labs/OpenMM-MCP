import { createServer } from '../../index';

jest.mock('@3rd-eye-labs/openmm', () => ({
  ExchangeFactory: {
    isSupported: jest.fn().mockReturnValue(true),
    getSupportedExchanges: jest.fn().mockReturnValue(['mexc', 'gateio', 'bitget', 'kraken']),
    getExchange: jest.fn(),
    clearAllConnectors: jest.fn(),
  },
}));

describe('MCP Server', () => {
  it('should create a server instance', async () => {
    const server = await createServer();
    expect(server).toBeDefined();
  });
});
