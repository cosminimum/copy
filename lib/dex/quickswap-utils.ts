/**
 * QuickSwap V3 (Algebra DEX) Utilities
 *
 * Provides functions for swapping tokens on QuickSwap V3 (Polygon)
 * QuickSwap V3 uses Algebra protocol, which is similar to Uniswap V3
 */

import { ethers } from 'ethers';
import { FUNDING_CONTRACTS, FUNDING_CONFIG } from '@/lib/constants/funding';

// QuickSwap V3 Quoter ABI (Algebra v1.0 - uses simple parameters, not struct)
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
      { name: 'fee', type: 'uint16' }, // Algebra returns dynamic fee
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// QuickSwap V3 Router ABI (Algebra-based)
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

// WMATIC ABI for unwrapping
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

export interface QuickSwapQuote {
  inputAmount: bigint;
  expectedOutput: bigint;
  minimumOutput: bigint;
  exchangeRate: string;
  priceImpact: string;
  fee: number;
  slippage: number;
}

/**
 * Get quote for USDC → WMATIC swap on QuickSwap V3
 */
export async function getUsdcToWmaticQuote(
  usdcAmount: bigint,
  provider: ethers.Provider
): Promise<QuickSwapQuote> {
  const quoter = new ethers.Contract(
    FUNDING_CONTRACTS.QUICKSWAP_V3_QUOTER,
    QUOTER_ABI,
    provider
  );

  // Algebra uses individual parameters, NOT a struct
  const result = await quoter.quoteExactInputSingle.staticCall(
    FUNDING_CONTRACTS.USDC,     // tokenIn
    FUNDING_CONTRACTS.WMATIC,   // tokenOut
    usdcAmount,                 // amountIn
    0                           // limitSqrtPrice (0 = no limit)
  );

  const expectedOutput = result[0] as bigint;  // amountOut
  const dynamicFee = Number(result[1]);         // fee (uint16) - Algebra's dynamic fee

  // Calculate minimum output with slippage protection
  const slippageBps = BigInt(FUNDING_CONFIG.SLIPPAGE_BPS);
  const minimumOutput = (expectedOutput * (10000n - slippageBps)) / 10000n;

  // Calculate exchange rate
  const inputInUsdc = Number(ethers.formatUnits(usdcAmount, 6));
  const outputInMatic = Number(ethers.formatEther(expectedOutput));
  const exchangeRate = outputInMatic > 0 ? (inputInUsdc / outputInMatic).toFixed(6) : '0';

  return {
    inputAmount: usdcAmount,
    expectedOutput,
    minimumOutput,
    exchangeRate: `1 POL = $${exchangeRate}`,
    priceImpact: '< 0.01%',
    fee: dynamicFee, // Use dynamic fee from Algebra
    slippage: FUNDING_CONFIG.SLIPPAGE_BPS / 100,
  };
}

/**
 * Get quote for USDC → USDC.e swap on QuickSwap V3
 */
export async function getUsdcToUsdcEQuote(
  usdcAmount: bigint,
  provider: ethers.Provider
): Promise<QuickSwapQuote> {
  const quoter = new ethers.Contract(
    FUNDING_CONTRACTS.QUICKSWAP_V3_QUOTER,
    QUOTER_ABI,
    provider
  );

  // Algebra uses individual parameters, NOT a struct
  const result = await quoter.quoteExactInputSingle.staticCall(
    FUNDING_CONTRACTS.USDC,     // tokenIn
    FUNDING_CONTRACTS.USDC_E,   // tokenOut
    usdcAmount,                 // amountIn
    0                           // limitSqrtPrice (0 = no limit)
  );

  const expectedOutput = result[0] as bigint;  // amountOut
  const dynamicFee = Number(result[1]);         // fee (uint16) - Algebra's dynamic fee

  // Calculate minimum output with slippage protection
  const slippageBps = BigInt(FUNDING_CONFIG.SLIPPAGE_BPS);
  const minimumOutput = (expectedOutput * (10000n - slippageBps)) / 10000n;

  // Calculate exchange rate
  const inputInUsdc = Number(ethers.formatUnits(usdcAmount, 6));
  const outputInUsdcE = Number(ethers.formatUnits(expectedOutput, 6));
  const exchangeRate = outputInUsdcE > 0 ? (inputInUsdc / outputInUsdcE).toFixed(6) : '0';

  return {
    inputAmount: usdcAmount,
    expectedOutput,
    minimumOutput,
    exchangeRate: `1 USDC.e = $${exchangeRate}`,
    priceImpact: '< 0.01%',
    fee: dynamicFee, // Use dynamic fee from Algebra
    slippage: FUNDING_CONFIG.SLIPPAGE_BPS / 100,
  };
}

/**
 * Build USDC approval transaction for QuickSwap router
 */
export function buildUsdcApproveTx(amount: bigint): {
  to: string;
  data: string;
  value: bigint;
} {
  const erc20 = new ethers.Interface([
    'function approve(address spender, uint256 amount) returns (bool)',
  ]);

  const data = erc20.encodeFunctionData('approve', [
    FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER,
    amount,
  ]);

  return {
    to: FUNDING_CONTRACTS.USDC,
    data,
    value: 0n,
  };
}

/**
 * Build USDC → WMATIC swap transaction on QuickSwap V3
 */
export function buildUsdcToWmaticSwapTx(
  usdcAmount: bigint,
  minimumWmaticOut: bigint,
  recipientAddress: string,
  deadlineMinutes: number = 10
): {
  to: string;
  data: string;
  value: bigint;
} {
  const router = new ethers.Interface(ROUTER_ABI);
  const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;

  const swapParams = {
    tokenIn: FUNDING_CONTRACTS.USDC,
    tokenOut: FUNDING_CONTRACTS.WMATIC,
    recipient: recipientAddress,
    deadline: deadline,
    amountIn: usdcAmount,
    amountOutMinimum: minimumWmaticOut,
    limitSqrtPrice: 0,
  };

  const data = router.encodeFunctionData('exactInputSingle', [swapParams]);

  return {
    to: FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER,
    data,
    value: 0n,
  };
}

/**
 * Build USDC → USDC.e swap transaction on QuickSwap V3
 */
export function buildUsdcToUsdcESwapTx(
  usdcAmount: bigint,
  minimumUsdcEOut: bigint,
  recipientAddress: string,
  deadlineMinutes: number = 10
): {
  to: string;
  data: string;
  value: bigint;
} {
  const router = new ethers.Interface(ROUTER_ABI);
  const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;

  const swapParams = {
    tokenIn: FUNDING_CONTRACTS.USDC,
    tokenOut: FUNDING_CONTRACTS.USDC_E,
    recipient: recipientAddress,
    deadline: deadline,
    amountIn: usdcAmount,
    amountOutMinimum: minimumUsdcEOut,
    limitSqrtPrice: 0,
  };

  const data = router.encodeFunctionData('exactInputSingle', [swapParams]);

  return {
    to: FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER,
    data,
    value: 0n,
  };
}

/**
 * Build WMATIC unwrap transaction to get native POL
 */
export function buildUnwrapWmaticTx(wmaticAmount: bigint): {
  to: string;
  data: string;
  value: bigint;
} {
  const wmatic = new ethers.Interface(WMATIC_ABI);
  const data = wmatic.encodeFunctionData('withdraw', [wmaticAmount]);

  return {
    to: FUNDING_CONTRACTS.WMATIC,
    data,
    value: 0n,
  };
}

/**
 * Calculate split of USDC between operator (5%) and Safe (95%)
 */
export function calculateUsdcFundingSplit(totalUsdc: bigint): {
  operatorAmount: bigint;
  safeAmount: bigint;
} {
  const operatorAmount = (totalUsdc * BigInt(FUNDING_CONFIG.OPERATOR_SPLIT_BPS)) / 10000n;
  const safeAmount = (totalUsdc * BigInt(FUNDING_CONFIG.SAFE_SPLIT_BPS)) / 10000n;

  return { operatorAmount, safeAmount };
}

/**
 * Get USDC allowance for QuickSwap router
 */
export async function getUsdcAllowance(
  ownerAddress: string,
  spenderAddress: string,
  provider: ethers.Provider
): Promise<bigint> {
  const usdc = new ethers.Contract(
    FUNDING_CONTRACTS.USDC,
    ['function allowance(address owner, address spender) view returns (uint256)'],
    provider
  );

  return (await usdc.allowance(ownerAddress, spenderAddress)) as bigint;
}

/**
 * Get USDC balance
 */
export async function getUsdcBalance(
  address: string,
  provider: ethers.Provider
): Promise<bigint> {
  const usdc = new ethers.Contract(
    FUNDING_CONTRACTS.USDC,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  return (await usdc.balanceOf(address)) as bigint;
}

/**
 * Validate USDC funding amount
 */
export function validateUsdcFundingAmount(usdcAmount: string): {
  isValid: boolean;
  error?: string;
} {
  try {
    const amount = ethers.parseUnits(usdcAmount, 6); // USDC has 6 decimals

    if (amount <= 0n) {
      return { isValid: false, error: 'Amount must be greater than 0' };
    }

    // Check minimum recommended
    const minAmount = ethers.parseUnits(FUNDING_CONFIG.RECOMMENDED_MIN_USDC, 6);
    if (amount < minAmount) {
      return {
        isValid: false,
        error: `Minimum recommended amount is $${FUNDING_CONFIG.RECOMMENDED_MIN_USDC}`,
      };
    }

    // Check maximum recommended
    const maxAmount = ethers.parseUnits(FUNDING_CONFIG.RECOMMENDED_MAX_USDC, 6);
    if (amount > maxAmount) {
      return {
        isValid: false,
        error: `Maximum recommended amount is $${FUNDING_CONFIG.RECOMMENDED_MAX_USDC}`,
      };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid amount format' };
  }
}
