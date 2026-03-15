/**
 * x402 Auto-Payment Module
 * 
 * Handles automatic payment signing and settlement for MCP tools.
 * The server holds the private key and pays on behalf of the user.
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';

const USDC_CONTRACTS: Record<number, `0x${string}`> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

const USDC_ABI = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function balanceOf(address account) view returns (uint256)',
]);

const TOOL_PRICING: Record<string, number> = {
  // Free
  list_exchanges: 0,
  // Read ($0.001)
  get_ticker: 0.001,
  get_orderbook: 0.001,
  get_trades: 0.001,
  get_ohlcv: 0.001,
  get_balance: 0.001,
  list_orders: 0.001,
  get_cardano_price: 0.001,
  discover_pools: 0.001,
  // Analysis ($0.005)
  get_portfolio: 0.005,
  compare_prices: 0.005,
  // Write ($0.01)
  create_order: 0.01,
  cancel_order: 0.01,
  cancel_all_orders: 0.01,
  start_grid_strategy: 0.01,
  stop_strategy: 0.01,
  get_strategy_status: 0.001,
};

interface PaymentResult {
  success: boolean;
  txHash?: string;
  amount?: number;
  error?: string;
}

let walletClient: any = null;
let publicClient: any = null;
let payerAddress: string | null = null;
let receiverAddress: string | null = null;
let chainId: number = 84532;
let isEnabled = false;

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

function splitSignature(sig: string): { v: number; r: `0x${string}`; s: `0x${string}` } {
  const s_ = sig.startsWith('0x') ? sig.slice(2) : sig;
  return {
    r: ('0x' + s_.slice(0, 64)) as `0x${string}`,
    s: ('0x' + s_.slice(64, 128)) as `0x${string}`,
    v: parseInt(s_.slice(128, 130), 16),
  };
}

/**
 * Initialize auto-payment with wallet
 */
export function initAutoPay(): void {
  const privateKey = process.env.X402_PRIVATE_KEY as `0x${string}` | undefined;
  receiverAddress = process.env.X402_EVM_ADDRESS || null;
  const testnet = process.env.X402_TESTNET === 'true';
  
  if (!privateKey || !receiverAddress) {
    console.error('[x402-autopay] Disabled - X402_PRIVATE_KEY or X402_EVM_ADDRESS not set');
    return;
  }

  chainId = testnet ? 84532 : 8453;
  const chain = testnet ? baseSepolia : base;
  
  const account = privateKeyToAccount(privateKey);
  payerAddress = account.address;
  
  walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });
  
  publicClient = createPublicClient({
    chain,
    transport: http(),
  });
  
  isEnabled = true;
  
  console.error('[x402-autopay] Enabled');
  console.error(`[x402-autopay] Payer: ${payerAddress}`);
  console.error(`[x402-autopay] Receiver: ${receiverAddress}`);
  console.error(`[x402-autopay] Chain: ${testnet ? 'Base Sepolia' : 'Base Mainnet'}`);
}

/**
 * Check if auto-pay is enabled
 */
export function isAutoPayEnabled(): boolean {
  return isEnabled;
}

/**
 * Get price for a tool
 */
export function getToolPrice(toolName: string): number {
  return TOOL_PRICING[toolName] ?? 0;
}

/**
 * Execute payment for a tool
 */
export async function executePayment(toolName: string): Promise<PaymentResult> {
  const price = getToolPrice(toolName);
  
  if (price === 0) {
    return { success: true, amount: 0 };
  }
  
  if (!isEnabled || !walletClient || !publicClient || !payerAddress || !receiverAddress) {
    return { success: false, error: 'Auto-pay not configured' };
  }

  const usdcContract = USDC_CONTRACTS[chainId];
  if (!usdcContract) {
    return { success: false, error: `Unsupported chain: ${chainId}` };
  }

  const value = BigInt(Math.ceil(price * 1_000_000));
  const validAfter = BigInt(0);
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);
  const nonce = randomNonce();
  
  // Domain name differs between testnet and mainnet
  const domainName = chainId === 84532 ? 'USDC' : 'USD Coin';

  try {
    console.error(`[x402-autopay] Signing payment: $${price} for ${toolName}`);
    
    // Sign EIP-3009 authorization
    const signature = await walletClient.signTypedData({
      account: walletClient.account!,
      domain: {
        name: domainName,
        version: '2',
        chainId: BigInt(chainId),
        verifyingContract: usdcContract,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: payerAddress as `0x${string}`,
        to: receiverAddress as `0x${string}`,
        value,
        validAfter,
        validBefore,
        nonce,
      },
    });

    const { v, r, s } = splitSignature(signature);

    console.error(`[x402-autopay] Executing on-chain transfer...`);
    
    // Execute the transfer
    const txHash = await walletClient.writeContract({
      chain: chainId === 84532 ? baseSepolia : base,
      account: walletClient.account!,
      address: usdcContract,
      abi: USDC_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        payerAddress as `0x${string}`,
        receiverAddress as `0x${string}`,
        value,
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s,
      ],
    });

    console.error(`[x402-autopay] TX submitted: ${txHash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    
    if (receipt.status === 'success') {
      console.error(`[x402-autopay] Confirmed in block ${receipt.blockNumber}`);
      return {
        success: true,
        txHash,
        amount: price,
      };
    } else {
      return { success: false, error: 'Transaction failed' };
    }
  } catch (err: any) {
    console.error(`[x402-autopay] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Wrapper to add payment to tool result
 */
export function wrapWithPayment<T extends object>(
  result: T,
  payment: PaymentResult
): T & { _payment?: { txHash: string; amount: number; explorer: string } } {
  if (payment.success && payment.txHash && payment.amount && payment.amount > 0) {
    return {
      ...result,
      _payment: {
        txHash: payment.txHash,
        amount: payment.amount,
        explorer: `https://${chainId === 84532 ? 'sepolia.' : ''}basescan.org/tx/${payment.txHash}`,
      },
    };
  }
  return result as T & { _payment?: { txHash: string; amount: number; explorer: string } };
}
