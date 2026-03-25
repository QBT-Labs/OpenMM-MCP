/**
 * Credentials Server Types
 */

export interface CredentialsRequest {
  id: string;
  action: 'health' | 'list' | 'get';
  exchange?: string;
}

export interface CredentialsResponse {
  id: string;
  success: boolean;
  error?: string;
  data?: unknown;
}

export interface ExchangeCredentials {
  apiKey: string;
  secret: string;
  passphrase?: string;
}

export const DEFAULT_SOCKET_PATH = '/tmp/openmm-creds.sock';
