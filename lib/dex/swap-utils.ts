/**
 * DEX Swap Utilities for QuickSwap Integration
 *
 * Handles token swap quotes and transaction building for QuickSwap V2 Router
 */

import { ethers } from 'ethers'
import {
  QUICKSWAP_ROUTER_V2,
  WMATIC_ADDRESS,
  USDC_E_ADDRESS,
  DEFAULT_SLIPPAGE_PERCENT,
  DEFAULT_DEADLINE_MINUTES,
} from '@/lib/constants/dex'

// QuickSwap V2 Router ABI (Uniswap V2 Router interface)
const QUICKSWAP_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function WETH() external pure returns (address)',
]

// ERC20 ABI for token operations
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

/**
 * Get swap quote for POL → USDC.e
 */
export async function getPolToUsdcQuote(
  polAmountInWei: bigint,
  provider: ethers.Provider
): Promise<{
  inputAmount: bigint
  expectedOutput: bigint
  minimumOutput: bigint
  exchangeRate: string
  path: string[]
  slippage: number
}> {
  const router = new ethers.Contract(QUICKSWAP_ROUTER_V2, QUICKSWAP_ROUTER_ABI, provider)

  // Path: POL → WMATIC → USDC.e
  const path = [WMATIC_ADDRESS, USDC_E_ADDRESS]

  // Get expected output amounts
  const amounts = await router.getAmountsOut(polAmountInWei, path)
  const expectedOutput = amounts[1] as bigint

  // Calculate minimum output with slippage tolerance
  const slippageBps = BigInt(Math.floor(DEFAULT_SLIPPAGE_PERCENT * 100)) // Convert to basis points
  const minimumOutput = (expectedOutput * (10000n - slippageBps)) / 10000n

  // Calculate exchange rate (POL per USDC.e)
  const inputInEther = Number(ethers.formatEther(polAmountInWei))
  const outputInUsdc = Number(ethers.formatUnits(expectedOutput, 6)) // USDC.e has 6 decimals
  const exchangeRate = (inputInEther / outputInUsdc).toFixed(6)

  return {
    inputAmount: polAmountInWei,
    expectedOutput,
    minimumOutput,
    exchangeRate,
    path,
    slippage: DEFAULT_SLIPPAGE_PERCENT,
  }
}

/**
 * Build swap transaction data for POL → USDC.e
 */
export function buildSwapTransaction(
  recipientAddress: string,
  minimumOutputAmount: bigint,
  deadline?: number
): {
  to: string
  value: bigint
  data: string
  gasLimit: bigint
} {
  const router = new ethers.Interface(QUICKSWAP_ROUTER_ABI)

  // Calculate deadline (default 20 minutes from now)
  const deadlineTimestamp =
    deadline || Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MINUTES * 60

  // Path: WMATIC → USDC.e
  const path = [WMATIC_ADDRESS, USDC_E_ADDRESS]

  // Encode function call: swapExactETHForTokens
  const data = router.encodeFunctionData('swapExactETHForTokens', [
    minimumOutputAmount,
    path,
    recipientAddress,
    deadlineTimestamp,
  ])

  return {
    to: QUICKSWAP_ROUTER_V2,
    value: 0n, // Value will be set when calling (the POL amount)
    data,
    gasLimit: 300000n,
  }
}

/**
 * Calculate the 95% amount to swap and 5% amount to keep
 */
export function calculateSwapSplit(totalPolAmount: bigint): {
  amountToSwap: bigint
  amountToKeep: bigint
} {
  const amountToSwap = (totalPolAmount * 95n) / 100n
  const amountToKeep = totalPolAmount - amountToSwap

  return {
    amountToSwap,
    amountToKeep,
  }
}

/**
 * Get USDC.e balance for an address
 */
export async function getUsdcBalance(
  address: string,
  provider: ethers.Provider
): Promise<bigint> {
  const usdcContract = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, provider)
  const balance = await usdcContract.balanceOf(address)
  return balance as bigint
}

/**
 * Format amounts for display
 */
export function formatSwapAmounts(quote: Awaited<ReturnType<typeof getPolToUsdcQuote>>) {
  return {
    inputPol: ethers.formatEther(quote.inputAmount),
    expectedUsdc: ethers.formatUnits(quote.expectedOutput, 6),
    minimumUsdc: ethers.formatUnits(quote.minimumOutput, 6),
    exchangeRate: quote.exchangeRate,
    slippage: `${quote.slippage}%`,
  }
}

/**
 * Validate swap parameters
 */
export function validateSwapAmount(polAmount: string): {
  isValid: boolean
  error?: string
} {
  try {
    const amount = ethers.parseEther(polAmount)

    if (amount <= 0n) {
      return { isValid: false, error: 'Amount must be greater than 0' }
    }

    // Check minimum (1 POL)
    const minAmount = ethers.parseEther('1')
    if (amount < minAmount) {
      return { isValid: false, error: 'Minimum amount is 1 POL' }
    }

    return { isValid: true }
  } catch (error) {
    return { isValid: false, error: 'Invalid amount format' }
  }
}
