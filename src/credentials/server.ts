/**
 * OpenMM Credentials Server
 * 
 * Isolated process that holds exchange credentials.
 * MCP server connects via Unix socket to get credentials.
 * 
 * Security:
 * - Credentials never leave this process (only returned on request)
 * - Password entered interactively (never in config files)
 * - Socket permissions restrict access
 */

import { createServer, Socket } from 'net';
import { existsSync, unlinkSync, chmodSync } from 'fs';
import { Vault } from '../vault/vault.js';
import type { ExchangeId, ExchangeCredentials as VaultCredentials } from '../vault/types.js';
import type { CredentialsRequest, CredentialsResponse, ExchangeCredentials } from './types.js';
import { DEFAULT_SOCKET_PATH } from './types.js';

export class CredentialsServer {
  private socketPath: string;
  private credentials: Map<string, VaultCredentials> = new Map();
  private server: ReturnType<typeof createServer> | null = null;

  constructor(socketPath?: string) {
    this.socketPath = socketPath || DEFAULT_SOCKET_PATH;
  }

  /**
   * Load credentials from vault
   */
  async loadFromVault(vault: Vault): Promise<string[]> {
    const exchanges = vault.listExchanges();
    
    for (const exchangeId of exchanges) {
      const creds = vault.getExchange(exchangeId);
      if (creds) {
        this.credentials.set(exchangeId, creds);
      }
    }
    
    return exchanges;
  }

  /**
   * Start the credentials server
   */
  async start(): Promise<void> {
    // Clean up existing socket
    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        console.error('❌ Server error:', err.message);
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        // Restrict socket permissions (owner only)
        chmodSync(this.socketPath, 0o600);
        console.log(`✅ Credentials server listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }
    // Clear credentials from memory
    this.credentials.clear();
  }

  /**
   * Handle a client connection
   */
  private handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete JSON messages (newline-delimited)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(socket, line);
        }
      }
    });

    socket.on('error', (err) => {
      console.error('Socket error:', err.message);
    });
  }

  /**
   * Handle a single message
   */
  private handleMessage(socket: Socket, message: string): void {
    let request: CredentialsRequest;
    
    try {
      request = JSON.parse(message);
    } catch {
      this.sendResponse(socket, {
        id: 'unknown',
        success: false,
        error: 'Invalid JSON',
      });
      return;
    }

    const response = this.processRequest(request);
    this.sendResponse(socket, response);
  }

  /**
   * Process a credentials request
   */
  private processRequest(request: CredentialsRequest): CredentialsResponse {
    const { id, action, exchange } = request;

    switch (action) {
      case 'health':
        return {
          id,
          success: true,
          data: { status: 'ok', exchanges: this.credentials.size },
        };

      case 'list':
        return {
          id,
          success: true,
          data: { exchanges: Array.from(this.credentials.keys()) },
        };

      case 'get':
        if (!exchange) {
          return { id, success: false, error: 'Missing exchange parameter' };
        }
        
        const creds = this.credentials.get(exchange.toLowerCase());
        if (!creds) {
          return { id, success: false, error: `No credentials for ${exchange}` };
        }
        
        return {
          id,
          success: true,
          data: {
            apiKey: creds.apiKey,
            secret: creds.secret,
            passphrase: creds.passphrase,
          } as ExchangeCredentials,
        };

      default:
        return { id, success: false, error: `Unknown action: ${action}` };
    }
  }

  /**
   * Send response to client
   */
  private sendResponse(socket: Socket, response: CredentialsResponse): void {
    socket.write(JSON.stringify(response) + '\n');
  }
}
