import { parseMcpRequest, recordMcpCall, type AnalyticsEngineDataset } from '../../analytics';

describe('parseMcpRequest', () => {
  it('extracts the tool name from a tools/call body', () => {
    const info = parseMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_ticker', arguments: { symbol: 'BTC/USDT' } },
      })
    );

    expect(info).toEqual({ method: 'tools/call', tool: 'get_ticker', client: 'unknown' });
  });

  it('extracts the client name from an initialize body', () => {
    const info = parseMcpRequest(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'claude-code', version: '2.1.0' } },
      })
    );

    expect(info).toEqual({ method: 'initialize', tool: '', client: 'claude-code' });
  });

  it('attributes a batch to its first entry', () => {
    const info = parseMcpRequest(
      JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_balance' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_ticker' } },
      ])
    );

    expect(info.tool).toBe('get_balance');
  });

  it.each([
    ['not json at all', 'unknown'],
    ['null', 'unknown'],
    ['{}', 'unknown'],
    ['[]', 'unknown'],
  ])('falls back safely for %s', (body, expected) => {
    expect(parseMcpRequest(body).method).toBe(expected);
  });
});

describe('recordMcpCall', () => {
  const record = {
    method: 'tools/call',
    tool: 'get_ticker',
    client: 'claude-code',
    status: 'ok' as const,
    httpStatus: 200,
    latencyMs: 42,
  };

  it('writes one data point in the documented column order', () => {
    const writeDataPoint = jest.fn();
    recordMcpCall({ writeDataPoint } as AnalyticsEngineDataset, record);

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint).toHaveBeenCalledWith({
      // Analytics Engine drops the point if more than one index is supplied.
      indexes: ['get_ticker'],
      blobs: ['tools/call', 'get_ticker', 'claude-code', 'ok'],
      doubles: [42, 200],
    });
  });

  it('indexes by method when there is no tool', () => {
    const writeDataPoint = jest.fn();
    recordMcpCall({ writeDataPoint } as AnalyticsEngineDataset, {
      ...record,
      method: 'initialize',
      tool: '',
    });

    expect(writeDataPoint.mock.calls[0][0].indexes).toEqual(['initialize']);
  });

  it('does nothing without a binding, so local runs need no config', () => {
    expect(() => recordMcpCall(undefined, record)).not.toThrow();
  });

  it('swallows a failing write rather than breaking the request', () => {
    const writeDataPoint = jest.fn(() => {
      throw new Error('analytics unavailable');
    });

    expect(() =>
      recordMcpCall({ writeDataPoint } as AnalyticsEngineDataset, record)
    ).not.toThrow();
  });
});
