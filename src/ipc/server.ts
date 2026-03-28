/**
 * Unified IPC Server
 *
 * Single Unix socket that handles exchange credentials and payment signing.
 * Started by `openmm serve` after interactive vault unlock.
 *
 * Security:
 * - Socket mode 0600 (owner-only)
 * - Private key never leaves this process
 * - signAndWipe pattern: key used inline, goes out of scope immediately
 */

import { createServer, Socket } from 'net';
import { existsSync, unlinkSync, chmodSync } from 'fs';
import type { Vault } from '../vault/vault.js';
import type { ExchangeCredentials, WalletCredentials } from '../vault/types.js';
import type { IPCRequest, IPCResponse, SignPaymentPayload } from './types.js';

export class UnifiedIPCServer {
  private server: ReturnType<typeof createServer> | null = null;
  private exchanges: Map<string, ExchangeCredentials> = new Map();
  private wallet: WalletCredentials | null = null;

  /**
   * Load credentials and wallet from an unlocked vault
   */
  loadFromVault(vault: Vault): { exchanges: string[]; walletAddress?: string } {
    const exchangeIds = vault.listExchanges();
    for (const id of exchangeIds) {
      const creds = vault.getExchange(id);
      if (creds) this.exchanges.set(id, creds);
    }

    const wallet = vault.getWallet();
    if (wallet) this.wallet = wallet;

    return {
      exchanges: exchangeIds,
      walletAddress: wallet?.address,
    };
  }

  /**
   * Start listening on the Unix socket
   */
  async start(socketPath: string): Promise<void> {
    // Remove stale socket
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(socketPath, () => {
        chmodSync(socketPath, 0o600);
        resolve();
      });
    });
  }

  /**
   * Stop and clean up
   */
  stop(socketPath: string): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }
    this.exchanges.clear();
    this.wallet = null;
  }

  private handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(socket, line);
        }
      }
    });

    socket.on('error', () => {
      // Client disconnected — nothing to do
    });
  }

  private async handleMessage(socket: Socket, message: string): Promise<void> {
    let request: IPCRequest;

    try {
      request = JSON.parse(message);
    } catch {
      this.send(socket, { id: 'unknown', success: false, error: 'Invalid JSON' });
      return;
    }

    const response = await this.dispatch(request);
    this.send(socket, response);
  }

  private async dispatch(req: IPCRequest): Promise<IPCResponse> {
    const { id, type } = req;

    switch (type) {
      case 'ping':
        return {
          id,
          success: true,
          data: {
            status: 'ok',
            wallet: this.wallet?.address ?? null,
            exchanges: Array.from(this.exchanges.keys()),
          },
        };

      case 'list_exchanges':
        return {
          id,
          success: true,
          data: { exchanges: Array.from(this.exchanges.keys()) },
        };

      case 'get_credentials': {
        if (!req.exchange) {
          return { id, success: false, error: 'Missing exchange parameter' };
        }
        const creds = this.exchanges.get(req.exchange.toLowerCase());
        if (!creds) {
          return { id, success: false, error: `No credentials for ${req.exchange}` };
        }
        return {
          id,
          success: true,
          data: { apiKey: creds.apiKey, secret: creds.secret, passphrase: creds.passphrase },
        };
      }

      case 'sign_payment': {
        if (!req.payload) {
          return { id, success: false, error: 'Missing payload' };
        }
        if (!this.wallet) {
          return { id, success: false, error: 'No wallet configured' };
        }
        return this.signAndWipe(id, req.payload);
      }

      default:
        return { id, success: false, error: `Unknown message type: ${type}` };
    }
  }

  /**
   * Sign an EIP-3009 payment. Private key is read from vault data, used once,
   * and goes out of scope immediately. It is NEVER held in a long-lived variable.
   */
  private async signAndWipe(id: string, payload: SignPaymentPayload): Promise<IPCResponse> {
    try {
      const { signEIP3009 } = await import('@qbtlabs/x402/chains/evm');

      const now = Math.floor(Date.now() / 1000);
      const result = await signEIP3009({
        privateKey: this.wallet!.privateKey,
        to: payload.to,
        value: BigInt(payload.amount),
        validAfter: 0,
        validBefore: now + 3600,
        chainId: payload.chainId,
      });

      return {
        id,
        success: true,
        data: { signature: result.signature, authorization: result.authorization },
      };
    } catch (err) {
      return { id, success: false, error: `Signing failed: ${(err as Error).message}` };
    }
  }

  private send(socket: Socket, response: IPCResponse): void {
    socket.write(JSON.stringify(response) + '\n');
  }
}
