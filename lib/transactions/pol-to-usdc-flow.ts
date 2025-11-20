/**
 * Multi-Step Transaction Handler for POL → USDC.e Flow
 *
 * Orchestrates the complete flow:
 * 1. Transfer POL from user wallet → operator wallet
 * 2. Swap 95% POL → USDC.e via QuickSwap (from operator)
 * 3. Transfer USDC.e from operator → Safe wallet
 */

import { ethers } from 'ethers'
import {
  getPolToUsdcQuote,
  buildSwapTransaction,
  calculateSwapSplit,
  getUsdcBalance,
} from '@/lib/dex/swap-utils'
import { USDC_E_ADDRESS } from '@/lib/constants/dex'

export type TransactionStep =
  | 'idle'
  | 'transferring_pol'
  | 'swapping_to_usdc'
  | 'transferring_usdc'
  | 'completed'
  | 'failed'

export interface FlowStatus {
  currentStep: TransactionStep
  completedSteps: TransactionStep[]
  error?: string
  txHashes: {
    polTransfer?: string
    swap?: string
    usdcTransfer?: string
  }
  amounts: {
    totalPol: string
    polToSwap: string
    polToKeep: string
    expectedUsdc: string
    actualUsdc?: string
  }
}

export interface FlowResult {
  success: boolean
  status: FlowStatus
  finalUsdcBalance: bigint
}

/**
 * Execute the complete POL → USDC.e flow
 */
export async function executePolToUsdcFlow(
  polAmount: string, // in ETH units (e.g., "10")
  userAddress: string,
  operatorAddress: string,
  safeAddress: string,
  userSigner: ethers.Signer,
  operatorWallet: ethers.Wallet,
  onStatusUpdate?: (status: FlowStatus) => void
): Promise<FlowResult> {
  const provider = userSigner.provider
  if (!provider) {
    throw new Error('Provider not found')
  }

  const polAmountWei = ethers.parseEther(polAmount)
  const { amountToSwap, amountToKeep } = calculateSwapSplit(polAmountWei)

  const status: FlowStatus = {
    currentStep: 'idle',
    completedSteps: [],
    txHashes: {},
    amounts: {
      totalPol: polAmount,
      polToSwap: ethers.formatEther(amountToSwap),
      polToKeep: ethers.formatEther(amountToKeep),
      expectedUsdc: '0',
    },
  }

  try {
    // ===== STEP 1: Transfer POL from user → operator =====
    status.currentStep = 'transferring_pol'
    onStatusUpdate?.(status)

    const polTransferTx = await userSigner.sendTransaction({
      to: operatorAddress,
      value: polAmountWei,
    })

    status.txHashes.polTransfer = polTransferTx.hash
    onStatusUpdate?.(status)

    await polTransferTx.wait()
    status.completedSteps.push('transferring_pol')
    onStatusUpdate?.(status)

    // ===== STEP 2: Swap 95% POL → USDC.e via QuickSwap =====
    status.currentStep = 'swapping_to_usdc'
    onStatusUpdate?.(status)

    // Get swap quote
    const quote = await getPolToUsdcQuote(amountToSwap, provider)
    status.amounts.expectedUsdc = ethers.formatUnits(quote.expectedOutput, 6)
    onStatusUpdate?.(status)

    // Build swap transaction
    const swapTx = buildSwapTransaction(operatorAddress, quote.minimumOutput)

    // Execute swap from operator wallet
    const swapTransaction = await operatorWallet.sendTransaction({
      to: swapTx.to,
      value: amountToSwap,
      data: swapTx.data,
      gasLimit: swapTx.gasLimit,
    })

    status.txHashes.swap = swapTransaction.hash
    onStatusUpdate?.(status)

    await swapTransaction.wait()
    status.completedSteps.push('swapping_to_usdc')
    onStatusUpdate?.(status)

    // Check actual USDC received
    const usdcBalance = await getUsdcBalance(operatorAddress, provider)
    status.amounts.actualUsdc = ethers.formatUnits(usdcBalance, 6)
    onStatusUpdate?.(status)

    // ===== STEP 3: Transfer USDC.e from operator → Safe =====
    status.currentStep = 'transferring_usdc'
    onStatusUpdate?.(status)

    // Build ERC20 transfer transaction
    const usdcContract = new ethers.Contract(
      USDC_E_ADDRESS,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      operatorWallet
    )

    const usdcTransferTx = await usdcContract.transfer(safeAddress, usdcBalance)
    status.txHashes.usdcTransfer = usdcTransferTx.hash
    onStatusUpdate?.(status)

    await usdcTransferTx.wait()
    status.completedSteps.push('transferring_usdc')
    onStatusUpdate?.(status)

    // ===== FLOW COMPLETED =====
    status.currentStep = 'completed'
    onStatusUpdate?.(status)

    return {
      success: true,
      status,
      finalUsdcBalance: usdcBalance,
    }
  } catch (error) {
    status.currentStep = 'failed'
    status.error = error instanceof Error ? error.message : 'Unknown error occurred'
    onStatusUpdate?.(status)

    return {
      success: false,
      status,
      finalUsdcBalance: 0n,
    }
  }
}

/**
 * Estimate total gas cost for the complete flow
 */
export async function estimateFlowGasCost(
  polAmount: string,
  provider: ethers.Provider
): Promise<{
  totalGasCostWei: bigint
  totalGasCostPol: string
  breakdown: {
    polTransfer: bigint
    swap: bigint
    usdcTransfer: bigint
  }
}> {
  const gasPrice = (await provider.getFeeData()).gasPrice || 30000000000n // 30 gwei fallback

  // Estimate gas for each step
  const polTransferGas = 21000n // Standard ETH transfer
  const swapGas = 300000n // DEX swap
  const usdcTransferGas = 65000n // ERC20 transfer

  const breakdown = {
    polTransfer: polTransferGas * gasPrice,
    swap: swapGas * gasPrice,
    usdcTransfer: usdcTransferGas * gasPrice,
  }

  const totalGasCostWei = breakdown.polTransfer + breakdown.swap + breakdown.usdcTransfer

  return {
    totalGasCostWei,
    totalGasCostPol: ethers.formatEther(totalGasCostWei),
    breakdown,
  }
}

/**
 * Validate that user has sufficient balance for the flow
 */
export async function validateFlowRequirements(
  polAmount: string,
  userAddress: string,
  provider: ethers.Provider
): Promise<{
  isValid: boolean
  errors: string[]
}> {
  const errors: string[] = []

  try {
    const polAmountWei = ethers.parseEther(polAmount)
    const userBalance = await provider.getBalance(userAddress)

    // Estimate gas costs
    const gasCost = await estimateFlowGasCost(polAmount, provider)

    // Check if user has enough POL for amount + gas
    const totalRequired = polAmountWei + gasCost.totalGasCostWei
    if (userBalance < totalRequired) {
      errors.push(
        `Insufficient POL balance. Need ${ethers.formatEther(totalRequired)} POL (${polAmount} POL + ${gasCost.totalGasCostPol} POL gas), but have ${ethers.formatEther(userBalance)} POL`
      )
    }

    // Check minimum amount (1 POL)
    const minAmount = ethers.parseEther('1')
    if (polAmountWei < minAmount) {
      errors.push('Minimum amount is 1 POL')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  } catch (error) {
    errors.push('Failed to validate requirements: ' + (error instanceof Error ? error.message : 'Unknown error'))
    return {
      isValid: false,
      errors,
    }
  }
}
