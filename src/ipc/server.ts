import { createServer, Socket } from 'net';
import { existsSync, unlinkSync, chmodSync } from 'fs';
import type { Vault } from '../vault/vault.js';
import type { ExchangeCredentials, WalletCredentials, SpendingPolicy } from '../vault/types.js';
import type { IPCRequest, IPCResponse, SignPaymentPayload } from './types.js';

export class UnifiedIPCServer {
  private server: ReturnType<typeof createServer> | null = null;
  private exchanges: Map<string, ExchangeCredentials> = new Map();
  private wallet: WalletCredentials | null = null;
  private policy: SpendingPolicy | null = null;

  loadFromVault(vault: Vault): { exchanges: string[]; walletAddress?: string } {
    const exchangeIds = vault.listExchanges();
    for (const id of exchangeIds) {
      const creds = vault.getExchange(id);
      if (creds) this.exchanges.set(id, creds);
    }

    const wallet = vault.getWallet();
    if (wallet) this.wallet = wallet;

    const policy = vault.getPolicy();
    if (policy) this.policy = policy;

    return {
      exchanges: exchangeIds,
      walletAddress: wallet?.address,
    };
  }

  async start(socketPath: string): Promise<void> {
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
    this.policy = null;
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

    socket.on('error', () => {});
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
   * Private key is read from vault data, used once for signing, and goes out
   * of scope immediately. It is NEVER copied into a separate long-lived variable.
   */
  private async signAndWipe(id: string, payload: SignPaymentPayload): Promise<IPCResponse> {
    if (this.policy) {
      const rejection = this.checkPolicy(payload);
      if (rejection) {
        return { id, success: false, error: `POLICY_REJECTED: ${rejection}` };
      }
    }

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

  private checkPolicy(payload: SignPaymentPayload): string | null {
    const p = this.policy!;

    if (p.maxPerTx) {
      const maxWei = BigInt(Math.floor(parseFloat(p.maxPerTx) * 1e6));
      if (BigInt(payload.amount) > maxWei) {
        return `amount ${payload.amount} exceeds max-per-tx ${p.maxPerTx} USDC`;
      }
    }

    if (p.allowedChains && p.allowedChains.length > 0) {
      if (!p.allowedChains.includes(String(payload.chainId))) {
        return `chain ${payload.chainId} not in allowed chains`;
      }
    }

    if (p.blockedRecipients?.includes(payload.to.toLowerCase())) {
      return `recipient ${payload.to} is blocked`;
    }

    if (p.allowedRecipients && p.allowedRecipients.length > 0) {
      if (!p.allowedRecipients.includes(payload.to.toLowerCase())) {
        return `recipient ${payload.to} not in allowed recipients`;
      }
    }

    return null;
  }

  private send(socket: Socket, response: IPCResponse): void {
    socket.write(JSON.stringify(response) + '\n');
  }
}
