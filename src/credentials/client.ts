/**
 * OpenMM Credentials Client
 * 
 * Connects to the credentials server via Unix socket
 * to retrieve exchange credentials.
 */

import { createConnection, Socket } from 'net';
import { existsSync } from 'fs';
import type { CredentialsRequest, CredentialsResponse, ExchangeCredentials } from './types.js';
import { DEFAULT_SOCKET_PATH } from './types.js';

export class CredentialsClient {
  private socketPath: string;
  private requestId = 0;

  constructor(socketPath?: string) {
    this.socketPath = socketPath || process.env.OPENMM_CREDS_SOCKET || DEFAULT_SOCKET_PATH;
  }

  /**
   * Check if credentials server is available
   */
  isAvailable(): boolean {
    return existsSync(this.socketPath);
  }

  /**
   * Check server health
   */
  async health(): Promise<boolean> {
    try {
      const response = await this.sendRequest({ action: 'health' });
      return response.success;
    } catch {
      return false;
    }
  }

  /**
   * List available exchanges
   */
  async listExchanges(): Promise<string[]> {
    const response = await this.sendRequest({ action: 'list' });
    if (!response.success) {
      throw new Error(response.error || 'Failed to list exchanges');
    }
    return (response.data as { exchanges: string[] }).exchanges;
  }

  /**
   * Get credentials for an exchange
   */
  async getCredentials(exchange: string): Promise<ExchangeCredentials> {
    const response = await this.sendRequest({ action: 'get', exchange });
    if (!response.success) {
      throw new Error(response.error || `Failed to get credentials for ${exchange}`);
    }
    return response.data as ExchangeCredentials;
  }

  /**
   * Send request to credentials server
   */
  private sendRequest(request: Omit<CredentialsRequest, 'id'>): Promise<CredentialsResponse> {
    return new Promise((resolve, reject) => {
      const id = `req-${++this.requestId}`;
      const fullRequest: CredentialsRequest = { ...request, id };

      let socket: Socket;
      let buffer = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket?.destroy();
          reject(new Error('Request timeout'));
        }
      }, 5000);

      try {
        socket = createConnection(this.socketPath);
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`Cannot connect to credentials server: ${(err as Error).message}`));
        return;
      }

      socket.on('connect', () => {
        socket.write(JSON.stringify(fullRequest) + '\n');
      });

      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line) as CredentialsResponse;
              if (response.id === id && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                socket.destroy();
                resolve(response);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      });

      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Socket error: ${err.message}`));
        }
      });

      socket.on('close', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('Connection closed'));
        }
      });
    });
  }
}

/**
 * Create a credentials client
 */
export function createCredentialsClient(socketPath?: string): CredentialsClient {
  return new CredentialsClient(socketPath);
}
