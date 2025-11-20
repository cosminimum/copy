/**
 * User Wallet USDC to POL Swap Utilities
 *
 * Handles swapping USDC to POL in the user's wallet before funding the operator.
 * This ensures the operator has gas fees to execute the main funding flow.
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

// WMATIC ABI for unwrapping
const WMATIC_ABI = [
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
];

// ERC20 ABI
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];

export interface UserSwapQuote {
  usdcAmount: bigint;
  expectedPolOutput: bigint;
  minimumPolOutput: bigint;
  exchangeRate: string;
  estimatedGasCost: bigint;
  totalCost: bigint;
}

/**
 * Calculate how much USDC needs to be swapped to get required POL for gas
 */
export async function calculateRequiredUsdcForGas(
  estimatedGasCostPol: bigint,
  provider: ethers.Provider
): Promise<UserSwapQuote> {
  const quoter = new ethers.Contract(
    FUNDING_CONTRACTS.QUICKSWAP_V3_QUOTER,
    QUOTER_ABI,
    provider
  );

  // We need to find how much USDC to swap to get estimatedGasCostPol
  // Add 20% buffer for slippage and price changes
  const targetPolAmount = (estimatedGasCostPol * 120n) / 100n;

  // Binary search to find the right USDC amount
  // Start with rough estimate: $0.50 per POL = 2 POL per USDC
  let usdcAmount = (targetPolAmount * ethers.parseUnits('0.5', 6)) / ethers.parseEther('1');

  // Get quote for this amount
  const result = await quoter.quoteExactInputSingle.staticCall(
    FUNDING_CONTRACTS.USDC,
    FUNDING_CONTRACTS.WMATIC,
    usdcAmount,
    0
  );

  const expectedOutput = result[0] as bigint;

  // Calculate minimum output with slippage
  const slippageBps = BigInt(FUNDING_CONFIG.SLIPPAGE_BPS);
  const minimumOutput = (expectedOutput * (10000n - slippageBps)) / 10000n;

  // Calculate exchange rate
  const inputInUsdc = Number(ethers.formatUnits(usdcAmount, 6));
  const outputInPol = Number(ethers.formatEther(expectedOutput));
  const exchangeRate = outputInPol > 0 ? (inputInUsdc / outputInPol).toFixed(6) : '0';

  return {
    usdcAmount,
    expectedPolOutput: expectedOutput,
    minimumPolOutput: minimumOutput,
    exchangeRate: `1 POL = $${exchangeRate}`,
    estimatedGasCost: estimatedGasCostPol,
    totalCost: usdcAmount,
  };
}

/**
 * Get USDC to WMATIC quote for user wallet swap
 */
export async function getUsdcToPolQuote(
  usdcAmount: bigint,
  provider: ethers.Provider
): Promise<{
  expectedOutput: bigint;
  minimumOutput: bigint;
  exchangeRate: string;
}> {
  const quoter = new ethers.Contract(
    FUNDING_CONTRACTS.QUICKSWAP_V3_QUOTER,
    QUOTER_ABI,
    provider
  );

  const result = await quoter.quoteExactInputSingle.staticCall(
    FUNDING_CONTRACTS.USDC,
    FUNDING_CONTRACTS.WMATIC,
    usdcAmount,
    0
  );

  const expectedOutput = result[0] as bigint;
  const slippageBps = BigInt(FUNDING_CONFIG.SLIPPAGE_BPS);
  const minimumOutput = (expectedOutput * (10000n - slippageBps)) / 10000n;

  const inputInUsdc = Number(ethers.formatUnits(usdcAmount, 6));
  const outputInPol = Number(ethers.formatEther(expectedOutput));
  const exchangeRate = outputInPol > 0 ? (inputInUsdc / outputInPol).toFixed(6) : '0';

  return {
    expectedOutput,
    minimumOutput,
    exchangeRate: `1 POL = $${exchangeRate}`,
  };
}

/**
 * Build approval transaction for USDC
 */
export function buildUserUsdcApproval(amount: bigint): {
  to: string;
  data: string;
} {
  const usdc = new ethers.Interface(ERC20_ABI);
  const data = usdc.encodeFunctionData('approve', [
    FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER,
    amount,
  ]);

  return {
    to: FUNDING_CONTRACTS.USDC,
    data,
  };
}

/**
 * Build USDC to WMATIC swap transaction for user wallet
 */
export function buildUserUsdcToWmaticSwap(
  usdcAmount: bigint,
  minimumWmaticOut: bigint,
  userAddress: string,
  deadlineMinutes: number = 10
): {
  to: string;
  data: string;
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
  };
}

/**
 * Build WMATIC unwrap transaction
 */
export function buildUserWmaticUnwrap(wmaticAmount: bigint): {
  to: string;
  data: string;
} {
  const wmatic = new ethers.Interface(WMATIC_ABI);
  const data = wmatic.encodeFunctionData('withdraw', [wmaticAmount]);

  return {
    to: FUNDING_CONTRACTS.WMATIC,
    data,
  };
}

/**
 * Check if user has enough USDC for the swap
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
 * Check USDC allowance for QuickSwap router
 */
export async function checkUserUsdcAllowance(
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
