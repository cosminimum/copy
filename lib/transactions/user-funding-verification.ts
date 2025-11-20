/**
 * User-Side Funding Flow Verification
 *
 * Verifies that the user has successfully completed all swaps and transfers:
 * - Operator received POL for gas
 * - Safe received USDC.e for trading
 *
 * NO swaps are executed by the operator. This is verification only.
 */

import { ethers } from 'ethers';
import { FUNDING_CONTRACTS, FUNDING_CONFIG } from '@/lib/constants/funding';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

/**
 * Verify that operator has sufficient POL for gas and Safe has USDC.e
 */
export async function verifyUserFundingCompletion(
  operatorAddress: string,
  safeAddress: string,
  expectedPolAmount: bigint,
  expectedUsdcEAmount: bigint,
  provider: ethers.Provider
): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
  balances: {
    operatorPol: string;
    safeUsdcE: string;
  };
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Check operator POL balance
    const operatorPolBalance = await provider.getBalance(operatorAddress);

    if (operatorPolBalance < expectedPolAmount) {
      errors.push(
        `Operator has insufficient POL. Expected at least ${ethers.formatEther(expectedPolAmount)} POL, but has ${ethers.formatEther(operatorPolBalance)} POL. User must complete the POL transfer.`
      );
    }

    // Check Safe USDC.e balance
    const usdcE = new ethers.Contract(FUNDING_CONTRACTS.USDC_E, ERC20_ABI, provider);
    const safeUsdcEBalance = (await usdcE.balanceOf(safeAddress)) as bigint;

    if (safeUsdcEBalance < expectedUsdcEAmount) {
      errors.push(
        `Safe has insufficient USDC.e. Expected at least ${ethers.formatUnits(expectedUsdcEAmount, 6)} USDC.e, but has ${ethers.formatUnits(safeUsdcEBalance, 6)} USDC.e. User must complete the USDC.e transfer.`
      );
    }

    // Warning if balances are significantly higher than expected (possible leftover from previous funding)
    if (operatorPolBalance > expectedPolAmount * 2n) {
      warnings.push(
        `Operator has more POL than expected (${ethers.formatEther(operatorPolBalance)} POL). This may be from a previous funding session.`
      );
    }

    if (safeUsdcEBalance > expectedUsdcEAmount * 2n) {
      warnings.push(
        `Safe has more USDC.e than expected (${ethers.formatUnits(safeUsdcEBalance, 6)} USDC.e). This may be from a previous funding session.`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      balances: {
        operatorPol: ethers.formatEther(operatorPolBalance),
        safeUsdcE: ethers.formatUnits(safeUsdcEBalance, 6),
      },
    };
  } catch (error) {
    errors.push(
      'Failed to verify funding completion: ' +
        (error instanceof Error ? error.message : 'Unknown error')
    );
    return {
      isValid: false,
      errors,
      warnings: [],
      balances: {
        operatorPol: '0',
        safeUsdcE: '0',
      },
    };
  }
}

/**
 * Calculate expected minimum balances based on USDC amount
 */
export async function calculateExpectedBalances(
  usdcAmount: string,
  provider: ethers.Provider
): Promise<{
  expectedPolAmount: bigint;
  expectedUsdcEAmount: bigint;
}> {
  const usdcAmountWei = ethers.parseUnits(usdcAmount, 6);

  // Calculate 5% for operator (USDC to POL)
  const operatorUsdcAmount = (usdcAmountWei * BigInt(FUNDING_CONFIG.OPERATOR_SPLIT_BPS)) / 10000n;

  // Calculate 95% for Safe (USDC to USDC.e)
  const safeUsdcAmount = (usdcAmountWei * BigInt(FUNDING_CONFIG.SAFE_SPLIT_BPS)) / 10000n;

  // For POL: estimate ~$0.50 per POL, so 1 USDC ≈ 2 POL
  // Apply 1% slippage tolerance
  const estimatedPol = (operatorUsdcAmount * ethers.parseEther('2')) / ethers.parseUnits('1', 6);
  const expectedPolAmount = (estimatedPol * 99n) / 100n; // 1% slippage

  // For USDC.e: nearly 1:1 swap (stablecoin)
  // Apply 0.1% slippage tolerance
  const expectedUsdcEAmount = (safeUsdcAmount * 999n) / 1000n; // 0.1% slippage

  return {
    expectedPolAmount,
    expectedUsdcEAmount,
  };
}

/**
 * Get current balances for monitoring
 */
export async function getCurrentBalances(
  operatorAddress: string,
  safeAddress: string,
  provider: ethers.Provider
): Promise<{
  operatorPol: string;
  safeUsdcE: string;
}> {
  const operatorPolBalance = await provider.getBalance(operatorAddress);

  const usdcE = new ethers.Contract(FUNDING_CONTRACTS.USDC_E, ERC20_ABI, provider);
  const safeUsdcEBalance = (await usdcE.balanceOf(safeAddress)) as bigint;

  return {
    operatorPol: ethers.formatEther(operatorPolBalance),
    safeUsdcE: ethers.formatUnits(safeUsdcEBalance, 6),
  };
}
