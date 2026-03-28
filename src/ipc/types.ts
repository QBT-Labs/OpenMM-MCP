/**
 * Unified IPC Protocol Types
 *
 * Single socket at /tmp/openmm.sock handles both credential lookup
 * and payment signing. Dispatched by message `type` field.
 */

export interface IPCRequest {
  id: string;
  type: 'ping' | 'get_credentials' | 'list_exchanges' | 'sign_payment';
  exchange?: string;
  payload?: SignPaymentPayload;
}

export interface SignPaymentPayload {
  to: string;
  amount: string;
  chainId: number;
}

export interface IPCResponse {
  id: string;
  success: boolean;
  error?: string;
  data?: unknown;
}

export const DEFAULT_SOCKET_PATH = '/tmp/openmm.sock';
