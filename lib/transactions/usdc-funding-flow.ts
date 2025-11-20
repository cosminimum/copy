/**
 * Server-Side Transaction Handler for USDC Funding Flow (QuickSwap V3)
 *
 * Simplified flow after user sends USDC to operator:
 * 1. (User sends USDC to operator - client-side, completed before this runs)
 * 2. Approve USDC for QuickSwap router
 * 3. Swap 5% USDC → WMATIC → unwrap to POL (operator gas)
 * 4. Swap 95% USDC → USDC.e → send directly to Safe (trading capital)
 */

import { ethers } from 'ethers';
import {
  getUsdcToWmaticQuote,
  getUsdcToUsdcEQuote,
  buildUsdcApproveTx,
  buildUsdcToWmaticSwapTx,
  buildUsdcToUsdcESwapTx,
  buildUnwrapWmaticTx,
  calculateUsdcFundingSplit,
  getUsdcAllowance,
  getUsdcBalance,
} from '@/lib/dex/quickswap-utils';
import { FUNDING_CONTRACTS } from '@/lib/constants/funding';

export type UsdcFundingStep =
  | 'idle'
  | 'verifying_usdc_received'
  | 'approving_usdc'
  | 'swapping_to_pol'
  | 'swapping_to_usdce'
  | 'completed'
  | 'failed';

export interface UsdcFlowStatus {
  currentStep: UsdcFundingStep;
  completedSteps: UsdcFundingStep[];
  error?: string;
  txHashes: {
    usdcTransfer?: string; // User's tx (already completed)
    approve?: string;
    swapToPol?: string;
    swapToUsdcE?: string;
  };
  amounts: {
    totalUsdc: string;
    operatorUsdc: string; // 5% for gas (swapped to POL)
    safeUsdc: string; // 95% for trading (swapped to USDC.e)
    expectedPol: string;
    expectedUsdcE: string;
    actualPol?: string;
    actualUsdcE?: string;
  };
}

export interface UsdcFlowResult {
  success: boolean;
  status: UsdcFlowStatus;
  finalPolBalance: bigint;
  finalUsdcEBalance: bigint;
}

/**
 * Execute the complete USDC funding flow (server-side, QuickSwap V3)
 * Assumes user has already sent USDC to operator wallet
 */
export async function executeUsdcFundingFlow(
  usdcAmount: string, // Total USDC amount user sent (in USDC units, e.g., "100")
  operatorAddress: string,
  safeAddress: string,
  operatorWallet: ethers.Wallet,
  userTxHash?: string, // Optional: hash of user's USDC transfer
  onStatusUpdate?: (status: UsdcFlowStatus) => void
): Promise<UsdcFlowResult> {
  const provider = operatorWallet.provider;
  if (!provider) {
    throw new Error('Provider not found');
  }

  const usdcAmountWei = ethers.parseUnits(usdcAmount, 6); // USDC has 6 decimals
  const { operatorAmount, safeAmount } = calculateUsdcFundingSplit(usdcAmountWei);

  const status: UsdcFlowStatus = {
    currentStep: 'idle',
    completedSteps: [],
    txHashes: {},
    amounts: {
      totalUsdc: usdcAmount,
      operatorUsdc: ethers.formatUnits(operatorAmount, 6),
      safeUsdc: ethers.formatUnits(safeAmount, 6),
      expectedPol: '0',
      expectedUsdcE: '0',
    },
  };

  if (userTxHash) {
    status.txHashes.usdcTransfer = userTxHash;
  }

  try {
    // ===== STEP 1: Verify USDC was received =====
    status.currentStep = 'verifying_usdc_received';
    onStatusUpdate?.(status);

    const usdcBalance = await getUsdcBalance(operatorAddress, provider);
    if (usdcBalance < usdcAmountWei) {
      throw new Error(
        `Insufficient USDC balance in operator. Expected ${usdcAmount} USDC, but have ${ethers.formatUnits(usdcBalance, 6)} USDC`
      );
    }

    status.completedSteps.push('verifying_usdc_received');
    onStatusUpdate?.(status);

    // ===== STEP 2: Approve USDC for QuickSwap router =====
    status.currentStep = 'approving_usdc';
    onStatusUpdate?.(status);

    // Check if approval is needed
    const currentAllowance = await getUsdcAllowance(
      operatorAddress,
      FUNDING_CONTRACTS.QUICKSWAP_V3_ROUTER,
      provider
    );

    if (currentAllowance < usdcAmountWei) {
      const approveTx = buildUsdcApproveTx(usdcAmountWei);

      const approveTransaction = await operatorWallet.sendTransaction({
        to: approveTx.to,
        data: approveTx.data,
      });

      status.txHashes.approve = approveTransaction.hash;
      onStatusUpdate?.(status);

      await approveTransaction.wait();
    }

    status.completedSteps.push('approving_usdc');
    onStatusUpdate?.(status);

    // ===== STEP 3: Swap 5% USDC → WMATIC → POL (for operator gas) =====
    status.currentStep = 'swapping_to_pol';
    onStatusUpdate?.(status);

    // Get quote for USDC → WMATIC
    const polQuote = await getUsdcToWmaticQuote(operatorAmount, provider);
    status.amounts.expectedPol = ethers.formatEther(polQuote.expectedOutput);
    onStatusUpdate?.(status);

    // Build and execute swap transaction (USDC → WMATIC)
    const swapToPolTx = buildUsdcToWmaticSwapTx(
      operatorAmount,
      polQuote.minimumOutput,
      operatorAddress // Recipient is operator (receives WMATIC first)
    );

    const polSwapTransaction = await operatorWallet.sendTransaction({
      to: swapToPolTx.to,
      data: swapToPolTx.data,
    });

    status.txHashes.swapToPol = polSwapTransaction.hash;
    onStatusUpdate?.(status);

    await polSwapTransaction.wait();

    // Get WMATIC balance to unwrap
    const wmaticContract = new ethers.Contract(
      FUNDING_CONTRACTS.WMATIC,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    const wmaticBalance = (await wmaticContract.balanceOf(operatorAddress)) as bigint;

    // Unwrap WMATIC → POL
    const unwrapTx = buildUnwrapWmaticTx(wmaticBalance);
    const unwrapTransaction = await operatorWallet.sendTransaction({
      to: unwrapTx.to,
      data: unwrapTx.data,
    });

    await unwrapTransaction.wait();

    // Verify POL received
    const polBalance = await provider.getBalance(operatorAddress);
    status.amounts.actualPol = ethers.formatEther(polBalance);

    status.completedSteps.push('swapping_to_pol');
    onStatusUpdate?.(status);

    // ===== STEP 4: Swap 95% USDC → USDC.e (send directly to Safe) =====
    status.currentStep = 'swapping_to_usdce';
    onStatusUpdate?.(status);

    // Get quote for USDC → USDC.e
    const usdcEQuote = await getUsdcToUsdcEQuote(safeAmount, provider);
    status.amounts.expectedUsdcE = ethers.formatUnits(usdcEQuote.expectedOutput, 6);
    onStatusUpdate?.(status);

    // Build and execute swap transaction (send directly to Safe!)
    const swapToUsdcETx = buildUsdcToUsdcESwapTx(
      safeAmount,
      usdcEQuote.minimumOutput,
      safeAddress // Recipient is Safe wallet (no extra transfer needed!)
    );

    const usdcESwapTransaction = await operatorWallet.sendTransaction({
      to: swapToUsdcETx.to,
      data: swapToUsdcETx.data,
    });

    status.txHashes.swapToUsdcE = usdcESwapTransaction.hash;
    onStatusUpdate?.(status);

    await usdcESwapTransaction.wait();
    status.completedSteps.push('swapping_to_usdce');
    onStatusUpdate?.(status);

    // Get USDC.e balance in Safe wallet to verify
    const usdcEContract = new ethers.Contract(
      FUNDING_CONTRACTS.USDC_E,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    const usdcEBalance = (await usdcEContract.balanceOf(safeAddress)) as bigint;
    status.amounts.actualUsdcE = ethers.formatUnits(usdcEBalance, 6);
    onStatusUpdate?.(status);

    // ===== FLOW COMPLETED =====
    status.currentStep = 'completed';
    onStatusUpdate?.(status);

    return {
      success: true,
      status,
      finalPolBalance: polBalance,
      finalUsdcEBalance: usdcEBalance,
    };
  } catch (error) {
    status.currentStep = 'failed';
    status.error = error instanceof Error ? error.message : 'Unknown error occurred';
    onStatusUpdate?.(status);

    return {
      success: false,
      status,
      finalPolBalance: 0n,
      finalUsdcEBalance: 0n,
    };
  }
}

/**
 * Estimate total gas cost for the complete USDC funding flow
 */
export async function estimateUsdcFlowGas(
  usdcAmount: string,
  provider: ethers.Provider
): Promise<{
  totalGasCostWei: bigint;
  totalGasCostPol: string;
  totalGasCostUsdc: string; // Estimated in USD
  breakdown: {
    approve: bigint;
    swapToPol: bigint;
    swapToUsdcE: bigint;
  };
}> {
  const gasPrice = (await provider.getFeeData()).gasPrice || 30000000000n; // 30 gwei fallback

  // Estimate gas for each step
  const approveGas = 50000n; // ERC20 approve
  const swapToPolGas = 250000n; // QuickSwap V3 swap + unwrap
  const swapToUsdcEGas = 150000n; // QuickSwap V3 swap (stablecoin, less hops)

  const breakdown = {
    approve: approveGas * gasPrice,
    swapToPol: swapToPolGas * gasPrice,
    swapToUsdcE: swapToUsdcEGas * gasPrice,
  };

  const totalGasCostWei = breakdown.approve + breakdown.swapToPol + breakdown.swapToUsdcE;

  // Estimate USD cost (assuming POL price ~$0.50, can be fetched from oracle in production)
  const polPrice = 0.5;
  const totalGasCostUsdc = (Number(ethers.formatEther(totalGasCostWei)) * polPrice).toFixed(2);

  return {
    totalGasCostWei,
    totalGasCostPol: ethers.formatEther(totalGasCostWei),
    totalGasCostUsdc,
    breakdown,
  };
}

/**
 * Validate that operator has received USDC and POL for gas
 */
export async function validateUsdcFlowRequirements(
  usdcAmount: string,
  operatorAddress: string,
  provider: ethers.Provider
): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
  requiredPolForGas: string;
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const usdcAmountWei = ethers.parseUnits(usdcAmount, 6);

    // Check operator has received USDC
    const usdcBalance = await getUsdcBalance(operatorAddress, provider);
    if (usdcBalance < usdcAmountWei) {
      errors.push(
        `Operator has not received sufficient USDC. Expected ${usdcAmount} USDC, but have ${ethers.formatUnits(usdcBalance, 6)} USDC. User must send USDC to operator first.`
      );
    }

    // Check operator has gas for transactions
    const polBalance = await provider.getBalance(operatorAddress);
    const gasCost = await estimateUsdcFlowGas(usdcAmount, provider);

    if (polBalance < gasCost.totalGasCostWei) {
      errors.push(
        `Operator wallet needs POL for gas fees. Required: ~${gasCost.totalGasCostPol} POL (~$${gasCost.totalGasCostUsdc}), Current: ${ethers.formatEther(polBalance)} POL. User must swap USDC to POL and send to operator: ${operatorAddress}`
      );
    } else if (polBalance < gasCost.totalGasCostWei * 2n) {
      // Warning if POL is less than 2x the estimated gas cost
      warnings.push(
        `Low POL balance for gas. Have ${ethers.formatEther(polBalance)} POL, recommended: ~${ethers.formatEther(gasCost.totalGasCostWei * 2n)} POL`
      );
    }

    // Check minimum USDC amount ($0.01)
    const minAmount = ethers.parseUnits('0.01', 6);
    if (usdcAmountWei < minAmount) {
      errors.push('Minimum amount is $0.01 USDC');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      requiredPolForGas: gasCost.totalGasCostPol,
    };
  } catch (error) {
    errors.push(
      'Failed to validate requirements: ' +
        (error instanceof Error ? error.message : 'Unknown error')
    );
    return {
      isValid: false,
      errors,
      warnings: [],
      requiredPolForGas: '0',
    };
  }
}
