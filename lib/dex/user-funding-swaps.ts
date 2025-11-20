/**
 * User-Side Funding Swap Utilities
 *
 * Handles ALL swaps in the user's wallet for the funding flow:
 * - 5% USDC → POL (send to operator for gas)
 * - 95% USDC → USDC.e (send to Safe for trading)
 *
 * The operator does NO swaps - it just receives POL for gas fees.
 */

import { ethers } from 'ethers';
import { FUNDING_CONTRACTS, FUNDING_CONFIG } from '@/lib/constants/funding';

// QuickSwap V3 Quoter ABI
const QUOTER_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'limitSqrtPrice', type: 'uint160' },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'fee', type: 'uint16' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// QuickSwap V3 Router ABI
const ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'limitSqrtPrice', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
];

// WMATIC ABI
const WMATIC_ABI = [
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

// ERC20 ABI
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

export interface UserFundingQuotes {
  operatorPol: {
    usdcAmount: bigint;
    expectedPol: bigint;
    minimumPol: bigint;
    exchangeRate: string;
  };
  safeUsdcE: {
    usdcAmount: bigint;
    expectedUsdcE: bigint;
    minimumUsdcE: bigint;
    exchangeRate: string;
  };
}

export interface UserFundingTransaction {
  type: 'approve' | 'swap_to_pol' | 'unwrap_pol' | 'transfer_pol' | 'swap_to_usdce' | 'transfer_usdce';
  to: string;
  data: string;
  value: string;
  description: string;
  gasLimit: string;
}

/**
 * Calculate 5%/95% split of USDC
 */
export function calculateUserFundingSplit(totalUsdc: bigint): {
  operatorAmount: bigint;
  safeAmount: bigint;
} {
  const operatorAmount = (totalUsdc * BigInt(FUNDING_CONFIG.OPERATOR_SPLIT_BPS)) / 10000n;
  const safeAmount = (totalUsdc * BigInt(FUNDING_CONFIG.SAFE_SPLIT_BPS)) / 10000n;

  return { operatorAmount, safeAmount };
}

/**
 * Get quotes for both swaps: USDC→POL and USDC→USDC.e
 */
export async function getUserFundingQuotes(
  totalUsdcAmount: bigint,
  provider: ethers.Provider
): Promise<UserFundingQuotes> {
  const { operatorAmount, safeAmount } = calculateUserFundingSplit(totalUsdcAmount);

  const quoter = new ethers.Contract(
    FUNDING_CONTRACTS.QUICKSWAP_V3_QUOTER,
    QUOTER_ABI,
    provider
  );

  // Quote 1: USDC → WMATIC (for operator POL)
  const polResult = await quoter.quoteExactInputSingle.staticCall(
    FUNDING_CONTRACTS.USDC,
    FUNDING_CONTRACTS.WMATIC,
    operatorAmount,
    0
  );
  const expectedPol = polResult[0] as bigint;
  const slippageBps = BigInt(FUNDING_CONFIG.SLIPPAGE_BPS);
  const minimumPol = (expectedPol * (10000n - slippageBps)) / 10000n;

  const polInputUsdc = Number(ethers.formatUnits(operatorAmount, 6));
  const polOutputMatic = Number(ethers.formatEther(expectedPol));
  const polRate = polOutputMatic > 0 ? (polInputUsdc / polOutputMatic).toFixed(6) : '0';

  // Quote 2: USDC → USDC.e (for Safe trading capital)
  const usdcEResult = await quoter.quoteExactInputSingle.staticCall(
    FUNDING_CONTRACTS.USDC,
    FUNDING_CONTRACTS.USDC_E,
    safeAmount,
    0
  );
  const expectedUsdcE = usdcEResult[0] as bigint;
  const minimumUsdcE = (expectedUsdcE * (10000n - slippageBps)) / 10000n;

  const usdcEInputUsdc = Number(ethers.formatUnits(safeAmount, 6));
  const usdcEOutput = Number(ethers.formatUnits(expectedUsdcE, 6));
  const usdcERate = usdcEOutput > 0 ? (usdcEInputUsdc / usdcEOutput).toFixed(6) : '0';

  return {
    operatorPol: {
      usdcAmount: operatorAmount,
      expectedPol,
      minimumPol,
      exchangeRate: `1 POL = $${polRate}`,
    },
    safeUsdcE: {
      usdcAmount: safeAmount,
      expectedUsdcE,
      minimumUsdcE,
      exchangeRate: `1 USDC.e = $${usdcERate}`,
    },
  };
}

/**
 * Build USDC approval transaction
 */
export function buildUsdcApprovalTx(amount: bigint): {
  to: string;
  data: string;
  value: string;
} {
  const usdc = new ethers.Interface(ERC20_ABI);
  const data = usdc.encodeFunctionData('approve', [
    FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER,
    amount,
  ]);

  return {
    to: FUNDING_CONTRACTS.USDC,
    data,
    value: '0',
  };
}

/**
 * Build USDC → WMATIC swap transaction
 */
export function buildUsdcToWmaticTx(
  usdcAmount: bigint,
  minimumWmaticOut: bigint,
  userAddress: string,
  deadlineMinutes: number = 10
): {
  to: string;
  data: string;
  value: string;
} {
  const router = new ethers.Interface(ROUTER_ABI);
  const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;

  const swapParams = {
    tokenIn: FUNDING_CONTRACTS.USDC,
    tokenOut: FUNDING_CONTRACTS.WMATIC,
    recipient: userAddress,
    deadline: deadline,
    amountIn: usdcAmount,
    amountOutMinimum: minimumWmaticOut,
    limitSqrtPrice: 0,
  };

  const data = router.encodeFunctionData('exactInputSingle', [swapParams]);

  return {
    to: FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER,
    data,
    value: '0',
  };
}

/**
 * Build WMATIC unwrap transaction
 */
export function buildWmaticUnwrapTx(wmaticAmount: bigint): {
  to: string;
  data: string;
  value: string;
} {
  const wmatic = new ethers.Interface(WMATIC_ABI);
  const data = wmatic.encodeFunctionData('withdraw', [wmaticAmount]);

  return {
    to: FUNDING_CONTRACTS.WMATIC,
    data,
    value: '0',
  };
}

/**
 * Build POL transfer transaction
 */
export function buildPolTransferTx(
  operatorAddress: string,
  polAmount: bigint
): {
  to: string;
  data: string;
  value: string;
} {
  return {
    to: operatorAddress,
    data: '0x',
    value: polAmount.toString(),
  };
}

/**
 * Build USDC → USDC.e swap transaction
 */
export function buildUsdcToUsdcETx(
  usdcAmount: bigint,
  minimumUsdcEOut: bigint,
  userAddress: string,
  deadlineMinutes: number = 10
): {
  to: string;
  data: string;
  value: string;
} {
  const router = new ethers.Interface(ROUTER_ABI);
  const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;

  const swapParams = {
    tokenIn: FUNDING_CONTRACTS.USDC,
    tokenOut: FUNDING_CONTRACTS.USDC_E,
    recipient: userAddress,
    deadline: deadline,
    amountIn: usdcAmount,
    amountOutMinimum: minimumUsdcEOut,
    limitSqrtPrice: 0,
  };

  const data = router.encodeFunctionData('exactInputSingle', [swapParams]);

  return {
    to: FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER,
    data,
    value: '0',
  };
}

/**
 * Build USDC.e transfer transaction
 */
export function buildUsdcETransferTx(
  safeAddress: string,
  usdcEAmount: bigint
): {
  to: string;
  data: string;
  value: string;
} {
  const usdcE = new ethers.Interface(ERC20_ABI);
  const data = usdcE.encodeFunctionData('transfer', [safeAddress, usdcEAmount]);

  return {
    to: FUNDING_CONTRACTS.USDC_E,
    data,
    value: '0',
  };
}

/**
 * Check if user has enough USDC
 */
export async function checkUserUsdcBalance(
  userAddress: string,
  requiredAmount: bigint,
  provider: ethers.Provider
): Promise<{
  hasEnough: boolean;
  balance: bigint;
  required: bigint;
}> {
  const usdc = new ethers.Contract(FUNDING_CONTRACTS.USDC, ERC20_ABI, provider);
  const balance = (await usdc.balanceOf(userAddress)) as bigint;

  return {
    hasEnough: balance >= requiredAmount,
    balance,
    required: requiredAmount,
  };
}

/**
 * Check USDC allowance
 */
export async function checkUsdcAllowance(
  userAddress: string,
  requiredAmount: bigint,
  provider: ethers.Provider
): Promise<{
  needsApproval: boolean;
  allowance: bigint;
  required: bigint;
}> {
  const usdc = new ethers.Contract(FUNDING_CONTRACTS.USDC, ERC20_ABI, provider);
  const allowance = (await usdc.allowance(
    userAddress,
    FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER
  )) as bigint;

  return {
    needsApproval: allowance < requiredAmount,
    allowance,
    required: requiredAmount,
  };
}

/**
 * Get WMATIC balance for user (after swap, before unwrap)
 */
export async function getWmaticBalance(
  userAddress: string,
  provider: ethers.Provider
): Promise<bigint> {
  const wmatic = new ethers.Contract(FUNDING_CONTRACTS.WMATIC, WMATIC_ABI, provider);
  return (await wmatic.balanceOf(userAddress)) as bigint;
}
