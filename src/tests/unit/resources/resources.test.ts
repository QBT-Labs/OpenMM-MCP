import { createServer } from '../../../index';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

jest.mock('@3rd-eye-labs/openmm', () => ({
  ExchangeFactory: {
    isSupported: jest.fn().mockReturnValue(true),
    getSupportedExchanges: jest.fn().mockReturnValue(['mexc', 'gateio', 'bitget', 'kraken']),
    getExchange: jest.fn(),
  },
}));

interface TextResourceContent {
  uri: string;
  text: string;
  mimeType?: string;
}

function textContent(contents: unknown[], index = 0): TextResourceContent {
  return contents[index] as TextResourceContent;
}

describe('MCP Resources', () => {
  let client: Client;

  beforeAll(async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('exchanges://list', () => {
    it('should return list of supported exchanges', async () => {
      const result = await client.readResource({ uri: 'exchanges://list' });

      expect(result.contents).toHaveLength(1);
      expect(textContent(result.contents).mimeType).toBe('application/json');

      const data = JSON.parse(textContent(result.contents).text);
      expect(data.exchanges).toHaveLength(4);
      expect(data.exchanges.map((e: any) => e.id)).toEqual([
        'mexc',
        'bitget',
        'gateio',
        'kraken',
      ]);
    });

    it('should include credential requirements for each exchange', async () => {
      const result = await client.readResource({ uri: 'exchanges://list' });
      const data = JSON.parse(textContent(result.contents).text);

      const bitget = data.exchanges.find((e: any) => e.id === 'bitget');
      expect(bitget.credentials).toContain('BITGET_PASSPHRASE');
      expect(bitget.credentials).toHaveLength(3);

      const kraken = data.exchanges.find((e: any) => e.id === 'kraken');
      expect(kraken.credentials).toHaveLength(2);
    });
  });

  describe('strategies://grid', () => {
    it('should return grid strategy documentation', async () => {
      const result = await client.readResource({ uri: 'strategies://grid' });

      expect(result.contents).toHaveLength(1);
      expect(textContent(result.contents).mimeType).toBe('text/markdown');
      expect(textContent(result.contents).text).toContain('Grid Trading Strategy');
      expect(textContent(result.contents).text).toContain('Spacing Models');
      expect(textContent(result.contents).text).toContain('Risk Management');
    });
  });

  describe('strategies://grid/profiles', () => {
    it('should return grid profile examples', async () => {
      const result = await client.readResource({ uri: 'strategies://grid/profiles' });

      expect(result.contents).toHaveLength(1);
      expect(textContent(result.contents).mimeType).toBe('application/json');

      const data = JSON.parse(textContent(result.contents).text);
      expect(data.profiles).toHaveLength(3);
      expect(data.profiles.map((p: any) => p.name)).toEqual([
        'conservative',
        'moderate',
        'aggressive',
      ]);
    });

    it('should have valid profile configurations', async () => {
      const result = await client.readResource({ uri: 'strategies://grid/profiles' });
      const data = JSON.parse(textContent(result.contents).text);

      for (const profile of data.profiles) {
        expect(profile.levels).toBeGreaterThan(0);
        expect(profile.baseSpacing).toBeGreaterThan(0);
        expect(profile.baseSize).toBeGreaterThan(0);
        expect(profile.spacingModel).toBeDefined();
        expect(profile.sizeModel).toBeDefined();
      }
    });
  });
});