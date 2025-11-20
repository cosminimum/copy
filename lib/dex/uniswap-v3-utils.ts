/**
 * Uniswap V3 Utilities for POL → USDC.e Swap
 *
 * Handles quote fetching and transaction building for Uniswap V3
 */

import { ethers } from 'ethers';
import { FUNDING_CONFIG, FUNDING_CONTRACTS } from '@/lib/constants/funding';

// Uniswap V3 QuoterV2 ABI
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

// Uniswap V3 Router ABI
const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)',
];

// WMATIC ABI
const WMATIC_ABI = [
  'function deposit() payable',
  'function withdraw(uint256) external',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// ERC20 ABI (for USDC operations)
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

export interface UniswapV3Quote {
  inputAmount: bigint;
  expectedOutput: bigint;
  minimumOutput: bigint; // with slippage protection
  exchangeRate: string;
  priceImpact: string;
  fee: number;
  slippage: number;
}

/**
 * Get Uniswap V3 quote for WMATIC → USDC.e swap
 */
export async function getUniswapV3Quote(
  wmaticAmount: bigint,
  provider: ethers.Provider
): Promise<UniswapV3Quote> {
  const quoter = new ethers.Contract(
    FUNDING_CONTRACTS.UNISWAP_V3_QUOTER,
    QUOTER_ABI,
    provider
  );

  try {
    // Call QuoterV2 with struct parameter
    const quoteParams = {
      tokenIn: FUNDING_CONTRACTS.WMATIC,
      tokenOut: FUNDING_CONTRACTS.USDC_E,
      amountIn: wmaticAmount,
      fee: FUNDING_CONFIG.UNISWAP_V3_FEE_WMATIC_USDC,
      sqrtPriceLimitX96: 0, // 0 means no price limit
    };

    const result = await quoter.quoteExactInputSingle.staticCall(quoteParams);
    const expectedOutput = result[0] as bigint; // First return value is amountOut

    // Calculate minimum output with slippage protection
    const slippageBps = BigInt(FUNDING_CONFIG.SLIPPAGE_BPS);
    const minimumOutput = (expectedOutput * (10000n - slippageBps)) / 10000n;

    // Calculate exchange rate (WMATIC per USDC.e)
    const inputInEther = Number(ethers.formatEther(wmaticAmount));
    const outputInUsdc = Number(ethers.formatUnits(expectedOutput, 6)); // USDC.e has 6 decimals
    const exchangeRate = outputInUsdc > 0 ? (inputInEther / outputInUsdc).toFixed(6) : '0';

    // Price impact calculation (simplified)
    const priceImpact = '0.01'; // TODO: Calculate actual price impact

    return {
      inputAmount: wmaticAmount,
      expectedOutput,
      minimumOutput,
      exchangeRate,
      priceImpact,
      fee: FUNDING_CONFIG.UNISWAP_V3_FEE_WMATIC_USDC,
      slippage: FUNDING_CONFIG.SLIPPAGE_BPS / 100, // Convert BPS to percentage
    };
  } catch (error) {
    console.error('Error getting Uniswap V3 quote:', error);
    throw new Error('Failed to get swap quote from Uniswap V3');
  }
}

/**
 * Build transaction parameters for Uniswap V3 swap
 * WMATIC → USDC.e with recipient as Safe address
 */
export function buildUniswapV3SwapTx(
  wmaticAmount: bigint,
  minimumUsdcOut: bigint,
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
    tokenIn: FUNDING_CONTRACTS.WMATIC,
    tokenOut: FUNDING_CONTRACTS.USDC_E,
    fee: FUNDING_CONFIG.UNISWAP_V3_FEE_WMATIC_USDC,
    recipient: recipientAddress,
    deadline: deadline,
    amountIn: wmaticAmount,
    amountOutMinimum: minimumUsdcOut,
    sqrtPriceLimitX96: 0,
  };

  const data = router.encodeFunctionData('exactInputSingle', [swapParams]);

  return {
    to: FUNDING_CONTRACTS.UNISWAP_V3_ROUTER,
    data,
    value: 0n, // No native token value needed, we're swapping WMATIC
  };
}

/**
 * Build WMATIC deposit transaction (wrap POL to WMATIC)
 */
export function buildWmaticDepositTx(polAmount: bigint): {
  to: string;
  data: string;
  value: bigint;
} {
  const wmatic = new ethers.Interface(WMATIC_ABI);
  const data = wmatic.encodeFunctionData('deposit', []);

  return {
    to: FUNDING_CONTRACTS.WMATIC,
    data,
    value: polAmount,
  };
}

/**
 * Build WMATIC approve transaction
 */
export function buildWmaticApproveTx(spender: string, amount: bigint): {
  to: string;
  data: string;
  value: bigint;
} {
  const wmatic = new ethers.Interface(WMATIC_ABI);
  const data = wmatic.encodeFunctionData('approve', [spender, amount]);

  return {
    to: FUNDING_CONTRACTS.WMATIC,
    data,
    value: 0n,
  };
}

/**
 * Check WMATIC allowance
 */
export async function getWmaticAllowance(
  ownerAddress: string,
  spenderAddress: string,
  provider: ethers.Provider
): Promise<bigint> {
  const wmatic = new ethers.Contract(FUNDING_CONTRACTS.WMATIC, WMATIC_ABI, provider);
  const allowance = await wmatic.allowance(ownerAddress, spenderAddress);
  return allowance as bigint;
}

/**
 * Calculate 5% operator / 95% swap split
 */
export function calculateFundingSplit(totalPol: bigint): {
  operatorAmount: bigint;
  swapAmount: bigint;
} {
  const operatorAmount = (totalPol * BigInt(FUNDING_CONFIG.OPERATOR_SPLIT_BPS)) / 10000n;
  const swapAmount = (totalPol * BigInt(FUNDING_CONFIG.SAFE_SPLIT_BPS)) / 10000n;

  return {
    operatorAmount,
    swapAmount,
  };
}

/**
 * Format amounts for display
 */
export function formatFundingAmounts(quote: UniswapV3Quote) {
  return {
    inputWmatic: ethers.formatEther(quote.inputAmount),
    expectedUsdc: ethers.formatUnits(quote.expectedOutput, 6),
    minimumUsdc: ethers.formatUnits(quote.minimumOutput, 6),
    exchangeRate: quote.exchangeRate,
    slippage: `${quote.slippage}%`,
    priceImpact: quote.priceImpact,
  };
}

/**
 * Validate POL amount for funding
 */
export function validateFundingAmount(polAmount: string): {
  isValid: boolean;
  error?: string;
} {
  try {
    const amount = ethers.parseEther(polAmount);

    if (amount <= 0n) {
      return { isValid: false, error: 'Amount must be greater than 0' };
    }

    // Check minimum recommended
    const minAmount = ethers.parseEther(FUNDING_CONFIG.RECOMMENDED_MIN_POL);
    if (amount < minAmount) {
      return {
        isValid: false,
        error: `Minimum recommended amount is ${FUNDING_CONFIG.RECOMMENDED_MIN_POL} POL`,
      };
    }

    // Check maximum recommended
    const maxAmount = ethers.parseEther(FUNDING_CONFIG.RECOMMENDED_MAX_POL);
    if (amount > maxAmount) {
      return {
        isValid: false,
        error: `Maximum recommended amount is ${FUNDING_CONFIG.RECOMMENDED_MAX_POL} POL`,
      };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid amount format' };
  }
}

// ============================================================================
// USDC-Based Funding Functions
// ============================================================================

/**
 * Get Uniswap V3 quote for USDC → WMATIC swap (then unwrap to POL)
 */
export async function getUsdcToPolQuote(
  usdcAmount: bigint,
  provider: ethers.Provider
): Promise<UniswapV3Quote> {
  const quoter = new ethers.Contract(
    FUNDING_CONTRACTS.UNISWAP_V3_QUOTER,
    QUOTER_ABI,
    provider
  );

  try {
    const quoteParams = {
      tokenIn: FUNDING_CONTRACTS.USDC,
      tokenOut: FUNDING_CONTRACTS.WMATIC,
      amountIn: usdcAmount,
      fee: FUNDING_CONFIG.UNISWAP_V3_FEE_WMATIC_USDC,
      sqrtPriceLimitX96: 0,
    };

    const result = await quoter.quoteExactInputSingle.staticCall(quoteParams);
    const expectedOutput = result[0] as bigint;

    // Calculate minimum output with slippage protection
    const slippageBps = BigInt(FUNDING_CONFIG.SLIPPAGE_BPS);
    const minimumOutput = (expectedOutput * (10000n - slippageBps)) / 10000n;

    // Calculate exchange rate (USDC per POL/WMATIC)
    const inputInUsdc = Number(ethers.formatUnits(usdcAmount, 6));
    const outputInEther = Number(ethers.formatEther(expectedOutput));
    const exchangeRate = outputInEther > 0 ? (inputInUsdc / outputInEther).toFixed(6) : '0';

    return {
      inputAmount: usdcAmount,
      expectedOutput,
      minimumOutput,
      exchangeRate,
      priceImpact: '0.01', // TODO: Calculate actual price impact
      fee: FUNDING_CONFIG.UNISWAP_V3_FEE_WMATIC_USDC,
      slippage: FUNDING_CONFIG.SLIPPAGE_BPS / 100,
    };
  } catch (error) {
    console.error('Error getting USDC → POL quote:', error);
    throw new Error('Failed to get USDC → POL swap quote from Uniswap V3');
  }
}

// Legacy name for backward compatibility
export const getUsdcToWmaticQuote = getUsdcToPolQuote;

/**
 * Get Uniswap V3 quote for USDC → USDC.e swap
 */
export async function getUsdcToUsdcEQuote(
  usdcAmount: bigint,
  provider: ethers.Provider
): Promise<UniswapV3Quote> {
  const quoter = new ethers.Contract(
    FUNDING_CONTRACTS.UNISWAP_V3_QUOTER,
    QUOTER_ABI,
    provider
  );

  try {
    const quoteParams = {
      tokenIn: FUNDING_CONTRACTS.USDC,
      tokenOut: FUNDING_CONTRACTS.USDC_E,
      amountIn: usdcAmount,
      fee: FUNDING_CONFIG.UNISWAP_V3_FEE_USDC_USDCE,
      sqrtPriceLimitX96: 0,
    };

    const result = await quoter.quoteExactInputSingle.staticCall(quoteParams);
    const expectedOutput = result[0] as bigint;

    // Calculate minimum output with slippage protection
    const slippageBps = BigInt(FUNDING_CONFIG.SLIPPAGE_BPS);
    const minimumOutput = (expectedOutput * (10000n - slippageBps)) / 10000n;

    // Calculate exchange rate (should be ~1:1 for stablecoins)
    const inputInUsdc = Number(ethers.formatUnits(usdcAmount, 6));
    const outputInUsdcE = Number(ethers.formatUnits(expectedOutput, 6));
    const exchangeRate = outputInUsdcE > 0 ? (inputInUsdc / outputInUsdcE).toFixed(6) : '1';

    return {
      inputAmount: usdcAmount,
      expectedOutput,
      minimumOutput,
      exchangeRate,
      priceImpact: '0.001', // Very low for stablecoin swap
      fee: FUNDING_CONFIG.UNISWAP_V3_FEE_USDC_USDCE,
      slippage: FUNDING_CONFIG.SLIPPAGE_BPS / 100,
    };
  } catch (error) {
    console.error('Error getting USDC → USDC.e quote:', error);
    throw new Error('Failed to get USDC → USDC.e swap quote from Uniswap V3');
  }
}

/**
 * Build USDC approve transaction
 */
export function buildUsdcApproveTx(spender: string, amount: bigint): {
  to: string;
  data: string;
  value: bigint;
} {
  const usdc = new ethers.Interface(ERC20_ABI);
  const data = usdc.encodeFunctionData('approve', [spender, amount]);

  return {
    to: FUNDING_CONTRACTS.USDC,
    data,
    value: 0n,
  };
}

/**
 * Build transaction for USDC → WMATIC swap and unwrap to POL
 * This swaps USDC to WMATIC via Uniswap, then unwraps WMATIC to native POL
 */
export function buildUsdcToPolSwapTx(
  usdcAmount: bigint,
  minimumPolOut: bigint,
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
    fee: FUNDING_CONFIG.UNISWAP_V3_FEE_WMATIC_USDC,
    recipient: recipientAddress, // Receive WMATIC first, then unwrap separately
    deadline: deadline,
    amountIn: usdcAmount,
    amountOutMinimum: minimumPolOut,
    sqrtPriceLimitX96: 0,
  };

  const data = router.encodeFunctionData('exactInputSingle', [swapParams]);

  return {
    to: FUNDING_CONTRACTS.UNISWAP_V3_ROUTER,
    data,
    value: 0n,
  };
}

// Legacy name for backward compatibility
export const buildUsdcToWmaticSwapTx = buildUsdcToPolSwapTx;

/**
 * Build transaction to unwrap WMATIC to native POL
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
 * Build transaction for USDC → USDC.e swap
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
    fee: FUNDING_CONFIG.UNISWAP_V3_FEE_USDC_USDCE,
    recipient: recipientAddress,
    deadline: deadline,
    amountIn: usdcAmount,
    amountOutMinimum: minimumUsdcEOut,
    sqrtPriceLimitX96: 0,
  };

  const data = router.encodeFunctionData('exactInputSingle', [swapParams]);

  return {
    to: FUNDING_CONTRACTS.UNISWAP_V3_ROUTER,
    data,
    value: 0n,
  };
}

/**
 * Check USDC allowance
 */
export async function getUsdcAllowance(
  ownerAddress: string,
  spenderAddress: string,
  provider: ethers.Provider
): Promise<bigint> {
  const usdc = new ethers.Contract(FUNDING_CONTRACTS.USDC, ERC20_ABI, provider);
  const allowance = await usdc.allowance(ownerAddress, spenderAddress);
  return allowance as bigint;
}

/**
 * Get USDC balance
 */
export async function getUsdcBalance(
  address: string,
  provider: ethers.Provider
): Promise<bigint> {
  const usdc = new ethers.Contract(FUNDING_CONTRACTS.USDC, ERC20_ABI, provider);
  const balance = await usdc.balanceOf(address);
  return balance as bigint;
}

/**
 * Validate USDC amount for funding
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

/**
 * Calculate 5% operator / 95% safe split for USDC amounts
 */
export function calculateUsdcFundingSplit(totalUsdc: bigint): {
  operatorAmount: bigint;
  safeAmount: bigint;
} {
  const operatorAmount = (totalUsdc * BigInt(FUNDING_CONFIG.OPERATOR_SPLIT_BPS)) / 10000n;
  const safeAmount = (totalUsdc * BigInt(FUNDING_CONFIG.SAFE_SPLIT_BPS)) / 10000n;

  return {
    operatorAmount,
    safeAmount,
  };
}
