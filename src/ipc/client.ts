import { createConnection, Socket } from 'net';
import { existsSync } from 'fs';
import type { IPCRequest, IPCResponse, SignPaymentPayload } from './types.js';
import { DEFAULT_SOCKET_PATH } from './types.js';

export class UnifiedIPCClient {
  private socketPath: string;
  private socket: Socket | null = null;
  private requestCounter = 0;
  private pendingRequests: Map<string, {
    resolve: (value: IPCResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(socketPath?: string) {
    this.socketPath = socketPath || process.env.OPENMM_SOCKET || DEFAULT_SOCKET_PATH;
  }

  isAvailable(): boolean {
    return existsSync(this.socketPath);
  }

  async connect(): Promise<void> {
    if (this.socket) return;

    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath);

      let buffer = '';

      this.socket.on('connect', () => resolve());

      this.socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response: IPCResponse = JSON.parse(line);
            const pending = this.pendingRequests.get(response.id);
            if (pending) {
              this.pendingRequests.delete(response.id);
              pending.resolve(response);
            }
          } catch {}
        }
      });

      this.socket.on('error', (err) => reject(err));

      this.socket.on('close', () => {
        this.socket = null;
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  private async request(req: Omit<IPCRequest, 'id'>): Promise<IPCResponse> {
    if (!this.socket) await this.connect();

    return new Promise((resolve, reject) => {
      const id = `req-${++this.requestCounter}`;
      const full: IPCRequest = { id, ...req };

      this.pendingRequests.set(id, { resolve, reject });

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 5000);

      this.socket!.write(JSON.stringify(full) + '\n');
    });
  }

  async ping(): Promise<{ wallet: string | null; exchanges: string[] }> {
    const res = await this.request({ type: 'ping' });
    if (!res.success) throw new Error(res.error || 'Ping failed');
    return res.data as { wallet: string | null; exchanges: string[] };
  }

  async listExchanges(): Promise<string[]> {
    const res = await this.request({ type: 'list_exchanges' });
    if (!res.success) throw new Error(res.error || 'Failed to list exchanges');
    return (res.data as { exchanges: string[] }).exchanges;
  }

  async getCredentials(exchange: string): Promise<{ apiKey: string; secret: string; passphrase?: string } | null> {
    const res = await this.request({ type: 'get_credentials', exchange });
    if (!res.success) return null;
    return res.data as { apiKey: string; secret: string; passphrase?: string };
  }

  async signPayment(payload: SignPaymentPayload): Promise<{
    signature: string;
    authorization: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string };
  }> {
    const res = await this.request({ type: 'sign_payment', payload });
    if (!res.success) throw new Error(res.error || 'Signing failed');
    return res.data as {
      signature: string;
      authorization: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string };
    };
  }
}
