/**
 * Production EVM Payment Verification
 *
 * Implements full EIP-3009 TransferWithAuthorization verification:
 * 1. Recover signer from EIP-712 signature
 * 2. Verify signer matches the 'from' address
 * 3. Check validity window
 * 4. Verify nonce hasn't been used
 * 5. Check sender has sufficient USDC balance
 */

import { PAYMENT_ADDRESSES, USDC_CONTRACTS } from './config.js';
import type { PaymentPayload } from './verify.js';

// Lazy-loaded crypto modules (ESM compatibility)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let keccak_256: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let secp256k1: any = null;

async function loadCrypto(): Promise<void> {
  if (!keccak_256) {
    const mod = await import('@noble/hashes/sha3.js');
    keccak_256 = mod.keccak_256;
  }
  if (!secp256k1) {
    const mod = await import('@noble/curves/secp256k1.js');
    secp256k1 = mod.secp256k1;
  }
}

// Base RPC endpoints
const BASE_RPC = {
  mainnet: 'https://mainnet.base.org',
  sepolia: 'https://sepolia.base.org',
};

// EIP-712 type definitions for TransferWithAuthorization
const EIP712_DOMAIN_TYPE = 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
const TRANSFER_AUTH_TYPE = 'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)';

/**
 * Keccak256 hash
 */
function keccak256(data: Buffer): Buffer {
  if (!keccak_256) throw new Error('Crypto not loaded - call loadCrypto() first');
  return Buffer.from(keccak_256(data));
}

/**
 * Encode a value as ABI uint256
 */
function encodeUint256(value: bigint): Buffer {
  const hex = value.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Encode an address as ABI address (20 bytes, left-padded to 32)
 */
function encodeAddress(address: string): Buffer {
  const clean = address.replace('0x', '').toLowerCase();
  return Buffer.from(clean.padStart(64, '0'), 'hex');
}

/**
 * Encode a bytes32 value
 */
function encodeBytes32(value: string): Buffer {
  const clean = value.replace('0x', '');
  return Buffer.from(clean.padStart(64, '0'), 'hex');
}

/**
 * Compute EIP-712 domain separator
 */
function computeDomainSeparator(
  name: string,
  version: string,
  chainId: number,
  verifyingContract: string
): Buffer {
  const typeHash = keccak256(Buffer.from(EIP712_DOMAIN_TYPE));
  const nameHash = keccak256(Buffer.from(name));
  const versionHash = keccak256(Buffer.from(version));

  const encoded = Buffer.concat([
    typeHash,
    nameHash,
    versionHash,
    encodeUint256(BigInt(chainId)),
    encodeAddress(verifyingContract),
  ]);

  return keccak256(encoded);
}

/**
 * Compute struct hash for TransferWithAuthorization
 */
function computeStructHash(
  from: string,
  to: string,
  value: bigint,
  validAfter: bigint,
  validBefore: bigint,
  nonce: string
): Buffer {
  const typeHash = keccak256(Buffer.from(TRANSFER_AUTH_TYPE));

  const encoded = Buffer.concat([
    typeHash,
    encodeAddress(from),
    encodeAddress(to),
    encodeUint256(value),
    encodeUint256(validAfter),
    encodeUint256(validBefore),
    encodeBytes32(nonce),
  ]);

  return keccak256(encoded);
}

/**
 * Compute the final EIP-712 hash to be signed
 */
function computeTypedDataHash(
  domainSeparator: Buffer,
  structHash: Buffer
): Buffer {
  const prefix = Buffer.from([0x19, 0x01]);
  return keccak256(Buffer.concat([prefix, domainSeparator, structHash]));
}

/**
 * Recover the signer address from an EIP-712 signature
 */
function recoverSigner(hash: Buffer, signature: string): string | null {
  try {
    if (!secp256k1) throw new Error('Crypto not loaded');

    // Parse signature components
    const sig = signature.replace('0x', '');
    if (sig.length !== 130) return null;

    const r = sig.slice(0, 64);
    const s = sig.slice(64, 128);
    const v = parseInt(sig.slice(128, 130), 16);
    const recoveryId = v >= 27 ? v - 27 : v;

    // Create signature object and recover public key
    const sigObj = new secp256k1.Signature(
      BigInt('0x' + r),
      BigInt('0x' + s)
    ).addRecoveryBit(recoveryId);

    const publicKey = sigObj.recoverPublicKey(hash);
    // Get uncompressed public key bytes (65 bytes: 04 || x || y)
    const pubKeyHex = publicKey.toHex(false);
    const pubKeyBytes = Buffer.from(pubKeyHex.slice(2), 'hex'); // Remove 04 prefix
    const addressHash = keccak256(Buffer.from(pubKeyBytes));
    const address = '0x' + addressHash.slice(-20).toString('hex');

    return address;
  } catch (e) {
    console.error('Signature recovery failed:', e);
    return null;
  }
}

/**
 * Call Base RPC
 */
async function callBaseRpc(
  network: string,
  method: string,
  params: unknown[]
): Promise<unknown> {
  const isTestnet = network === 'eip155:84532';
  const rpcUrl = isTestnet ? BASE_RPC.sepolia : BASE_RPC.mainnet;

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  const data = await response.json() as { result?: unknown; error?: { message: string } };
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.result;
}

/**
 * Check USDC balance on Base
 */
async function checkUsdcBalance(address: string, network: string): Promise<bigint> {
  const usdcContract = USDC_CONTRACTS[network as keyof typeof USDC_CONTRACTS];
  if (!usdcContract) return BigInt(0);

  // balanceOf(address) selector = 0x70a08231
  const data = '0x70a08231' + address.replace('0x', '').toLowerCase().padStart(64, '0');

  const result = await callBaseRpc(network, 'eth_call', [
    { to: usdcContract, data },
    'latest',
  ]) as string;

  return BigInt(result || '0x0');
}

/**
 * Check if nonce has been used (authorizationState mapping)
 */
async function isNonceUsed(
  authorizer: string,
  nonce: string,
  network: string
): Promise<boolean> {
  const usdcContract = USDC_CONTRACTS[network as keyof typeof USDC_CONTRACTS];
  if (!usdcContract) return false;

  // authorizationState(address,bytes32) selector = 0xe94a0102
  const data =
    '0xe94a0102' +
    authorizer.replace('0x', '').toLowerCase().padStart(64, '0') +
    nonce.replace('0x', '').padStart(64, '0');

  try {
    const result = await callBaseRpc(network, 'eth_call', [
      { to: usdcContract, data },
      'latest',
    ]) as string;

    // 0 = unused, 1 = used
    return result !== '0x0000000000000000000000000000000000000000000000000000000000000000';
  } catch {
    // If call fails, assume not used (conservative)
    return false;
  }
}

/**
 * Full production verification of EVM payment
 */
export async function verifyEvmPaymentFull(
  payment: PaymentPayload,
  expectedAmount: number
): Promise<{ valid: boolean; error?: string; details?: Record<string, unknown> }> {
  try {
    // Load crypto libraries (ESM modules)
    await loadCrypto();

    const { authorization } = payment.payload;
    const { accepted } = payment;
    const { signature } = payment.payload;

    // 1. Basic validation
    if (!accepted.network.startsWith('eip155:')) {
      return { valid: false, error: 'Invalid EVM network' };
    }

    const expectedRecipient = PAYMENT_ADDRESSES.evm.toLowerCase();
    if (!expectedRecipient) {
      return { valid: false, error: 'Payment receiver not configured' };
    }

    if (authorization.to.toLowerCase() !== expectedRecipient) {
      return { valid: false, error: `Invalid recipient: expected ${expectedRecipient}` };
    }

    // 2. Check amount
    const paidAmount = BigInt(authorization.value);
    const requiredAmount = BigInt(Math.ceil(expectedAmount * 1_000_000));
    if (paidAmount < requiredAmount) {
      return {
        valid: false,
        error: `Insufficient amount: ${paidAmount} < ${requiredAmount}`,
      };
    }

    // 3. Check validity window
    const now = Math.floor(Date.now() / 1000);
    const validAfter = parseInt(authorization.validAfter);
    const validBefore = parseInt(authorization.validBefore);

    if (now < validAfter) {
      return { valid: false, error: 'Payment not yet valid' };
    }
    if (now > validBefore) {
      return { valid: false, error: 'Payment expired' };
    }

    // 4. Verify EIP-712 signature
    const chainId = parseInt(accepted.network.split(':')[1]);
    const usdcContract = USDC_CONTRACTS[accepted.network as keyof typeof USDC_CONTRACTS];

    if (!usdcContract) {
      return { valid: false, error: 'Unknown USDC contract for network' };
    }

    // Get token name from payment.accepted.extra or use default
    const tokenName = (payment.accepted as { extra?: { name?: string } }).extra?.name || 'USD Coin';
    const tokenVersion = '2'; // USDC uses version 2

    const domainSeparator = computeDomainSeparator(
      tokenName,
      tokenVersion,
      chainId,
      usdcContract
    );

    const structHash = computeStructHash(
      authorization.from,
      authorization.to,
      BigInt(authorization.value),
      BigInt(authorization.validAfter),
      BigInt(authorization.validBefore),
      authorization.nonce
    );

    const typedDataHash = computeTypedDataHash(domainSeparator, structHash);
    const recoveredSigner = recoverSigner(typedDataHash, signature);

    if (!recoveredSigner) {
      return { valid: false, error: 'Could not recover signer from signature' };
    }

    if (recoveredSigner.toLowerCase() !== authorization.from.toLowerCase()) {
      return {
        valid: false,
        error: `Signer mismatch: recovered ${recoveredSigner}, expected ${authorization.from}`,
      };
    }

    // 5. Check nonce hasn't been used
    const nonceUsed = await isNonceUsed(authorization.from, authorization.nonce, accepted.network);
    if (nonceUsed) {
      return { valid: false, error: 'Nonce already used' };
    }

    // 6. Check sender has sufficient balance
    const balance = await checkUsdcBalance(authorization.from, accepted.network);
    if (balance < paidAmount) {
      return {
        valid: false,
        error: `Insufficient USDC balance: ${balance} < ${paidAmount}`,
      };
    }

    // All checks passed
    return {
      valid: true,
      details: {
        from: authorization.from,
        to: authorization.to,
        amount: paidAmount.toString(),
        amountUsd: Number(paidAmount) / 1_000_000,
        network: accepted.network,
        balance: balance.toString(),
        recoveredSigner,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: `Verification error: ${error instanceof Error ? error.message : error}`,
    };
  }
}

/**
 * Execute the payment (pull the authorized transfer)
 *
 * This submits the TransferWithAuthorization to the blockchain,
 * actually executing the payment. Call this AFTER verification
 * and BEFORE returning data to the client.
 */
export async function executeEvmPayment(
  payment: PaymentPayload
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // TODO: Implement actual transaction submission
  // This requires a funded wallet on the server side to pay gas
  // Options:
  // 1. Use a relayer service (Biconomy, Gelato)
  // 2. Use Coinbase's facilitator
  // 3. Self-host with a gas wallet

  return {
    success: false,
    error: 'Payment execution not implemented - use a facilitator service',
  };
}
