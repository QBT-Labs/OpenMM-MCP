/**
 * x402 Payment Verification
 *
 * Verifies payment signatures for Base (EVM) and Solana networks.
 *
 * Two modes:
 * - Basic: Quick validation (dev/testing)
 * - Full: Cryptographic signature verification + on-chain checks (production)
 *
 * Set X402_VERIFY_MODE=full for production.
 */

import { PAYMENT_ADDRESSES, USDC_CONTRACTS } from './config.js';
import { verifyEvmPaymentFull } from './verify-evm.js';

export interface PaymentPayload {
  x402Version: number;
  payload: {
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    signature: string;
  };
  accepted: {
    network: string;
    asset: string;
    amount: string;
    payTo?: string;
  };
  resource?: {
    url: string;
  };
}

/**
 * Parse the Payment-Signature header
 */
export function parsePaymentSignature(header: string): PaymentPayload | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaymentPayload;
  } catch {
    return null;
  }
}

/**
 * Verify EVM payment on Base
 * Uses EIP-3009 TransferWithAuthorization verification
 *
 * Modes:
 * - basic (default): Quick validation for dev/testing
 * - full: Cryptographic signature + on-chain verification for production
 *
 * Set X402_VERIFY_MODE=full for production.
 */
export async function verifyEvmPayment(
  payment: PaymentPayload,
  expectedAmount: number
): Promise<{ valid: boolean; error?: string; details?: Record<string, unknown> }> {
  const verifyMode = process.env.X402_VERIFY_MODE || 'basic';

  // Use full verification in production
  if (verifyMode === 'full') {
    return verifyEvmPaymentFull(payment, expectedAmount);
  }

  // Basic validation for development/testing
  try {
    const { authorization } = payment.payload;
    const { accepted } = payment;

    // Check network
    if (!accepted.network.startsWith('eip155:')) {
      return { valid: false, error: 'Invalid EVM network' };
    }

    // Check recipient
    const expectedRecipient = PAYMENT_ADDRESSES.evm.toLowerCase();
    if (!expectedRecipient) {
      return { valid: false, error: 'Payment receiver not configured' };
    }
    if (authorization.to.toLowerCase() !== expectedRecipient) {
      return { valid: false, error: 'Invalid payment recipient' };
    }

    // Check amount (in micro-units)
    const paidAmount = BigInt(authorization.value);
    const requiredAmount = BigInt(Math.ceil(expectedAmount * 1_000_000));
    if (paidAmount < requiredAmount) {
      return { valid: false, error: `Insufficient payment: ${paidAmount} < ${requiredAmount}` };
    }

    // Check validity window
    const now = Math.floor(Date.now() / 1000);
    const validAfter = parseInt(authorization.validAfter);
    const validBefore = parseInt(authorization.validBefore);

    if (now < validAfter) {
      return { valid: false, error: 'Payment not yet valid' };
    }
    if (now > validBefore) {
      return { valid: false, error: 'Payment expired' };
    }

    // Check asset (USDC)
    const expectedAsset = USDC_CONTRACTS[accepted.network as keyof typeof USDC_CONTRACTS];
    if (expectedAsset && accepted.asset.toLowerCase() !== expectedAsset.toLowerCase()) {
      return { valid: false, error: 'Invalid payment asset' };
    }

    // Basic mode: Trust the signature format
    // WARNING: Not cryptographically secure - use X402_VERIFY_MODE=full for production
    if (verifyMode === 'basic') {
      console.warn('x402: Using basic verification mode - set X402_VERIFY_MODE=full for production');
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Verification error: ${error}` };
  }
}

/**
 * Verify Solana payment
 */
export async function verifySolanaPayment(
  payment: PaymentPayload,
  expectedAmount: number
): Promise<{ valid: boolean; error?: string }> {
  try {
    const { accepted } = payment;

    // Check network
    if (!accepted.network.startsWith('solana:')) {
      return { valid: false, error: 'Invalid Solana network' };
    }

    // Check amount
    const paidAmount = BigInt(accepted.amount);
    const requiredAmount = BigInt(Math.ceil(expectedAmount * 1_000_000));
    if (paidAmount < requiredAmount) {
      return { valid: false, error: `Insufficient payment: ${paidAmount} < ${requiredAmount}` };
    }

    // TODO: Verify Solana transaction signature
    // This would involve checking the transaction on-chain

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Verification error: ${error}` };
  }
}

/**
 * Verify payment based on network
 */
export async function verifyPayment(
  paymentHeader: string,
  expectedAmount: number
): Promise<{ valid: boolean; error?: string }> {
  const payment = parsePaymentSignature(paymentHeader);

  if (!payment) {
    return { valid: false, error: 'Invalid payment signature format' };
  }

  const { network } = payment.accepted;

  if (network.startsWith('eip155:')) {
    return verifyEvmPayment(payment, expectedAmount);
  }

  if (network.startsWith('solana:')) {
    return verifySolanaPayment(payment, expectedAmount);
  }

  return { valid: false, error: `Unsupported network: ${network}` };
}
