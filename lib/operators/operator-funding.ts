/**
 * Operator Funding Management
 *
 * Handles funding operator wallets with POL for gas fees
 */

import { ethers } from 'ethers';

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const MIN_OPERATOR_BALANCE = ethers.parseEther('0.1'); // 0.1 POL minimum
const RECOMMENDED_OPERATOR_BALANCE = ethers.parseEther('1'); // 1 POL recommended

/**
 * Check operator POL balance
 *
 * @param operatorAddress Operator wallet address
 * @returns Balance in POL and status
 */
export async function checkOperatorBalance(operatorAddress: string): Promise<{
  balance: bigint;
  balancePOL: number;
  hasMinimum: boolean;
  needsFunding: boolean;
}> {
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const balance = await provider.getBalance(operatorAddress);
  const balancePOL = parseFloat(ethers.formatEther(balance));

  return {
    balance,
    balancePOL,
    hasMinimum: balance >= MIN_OPERATOR_BALANCE,
    needsFunding: balance < MIN_OPERATOR_BALANCE,
  };
}

/**
 * Fund operator wallet with POL (from platform treasury)
 *
 * @param operatorAddress Operator wallet to fund
 * @param amount Amount in POL (default: 1 POL)
 * @returns Transaction hash
 */
export async function fundOperator(
  operatorAddress: string,
  amount: string = '1'
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const treasuryKey = process.env.TREASURY_PRIVATE_KEY || process.env.OPERATOR_PRIVATE_KEY;

    if (!treasuryKey) {
      return {
        success: false,
        error: 'No treasury wallet configured. Set TREASURY_PRIVATE_KEY in .env',
      };
    }

    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    const treasury = new ethers.Wallet(treasuryKey, provider);

    // Check treasury balance
    const treasuryBalance = await provider.getBalance(treasury.address);
    const amountWei = ethers.parseEther(amount);

    if (treasuryBalance < amountWei) {
      return {
        success: false,
        error: `Insufficient treasury balance. Has ${ethers.formatEther(treasuryBalance)} POL, needs ${amount} POL`,
      };
    }

    console.log(`[OperatorFunding] Funding operator ${operatorAddress} with ${amount} POL`);
    console.log(`[OperatorFunding] From treasury: ${treasury.address}`);

    // Send POL
    const tx = await treasury.sendTransaction({
      to: operatorAddress,
      value: amountWei,
    });

    const receipt = await tx.wait();

    console.log(`[OperatorFunding] ✅ Funded operator (tx: ${receipt?.hash})`);

    return {
      success: true,
      txHash: receipt?.hash,
    };
  } catch (error: any) {
    console.error('[OperatorFunding] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to fund operator',
    };
  }
}

/**
 * Ensure operator has minimum balance, fund if needed
 *
 * @param operatorAddress Operator wallet address
 * @returns Funding result
 */
export async function ensureOperatorFunded(operatorAddress: string): Promise<{
  success: boolean;
  funded: boolean;
  balance: number;
  txHash?: string;
  error?: string;
}> {
  const balanceCheck = await checkOperatorBalance(operatorAddress);

  if (balanceCheck.hasMinimum) {
    return {
      success: true,
      funded: false,
      balance: balanceCheck.balancePOL,
    };
  }

  console.log(`[OperatorFunding] Operator balance too low: ${balanceCheck.balancePOL} POL`);
  console.log(`[OperatorFunding] Funding operator...`);

  const fundResult = await fundOperator(operatorAddress, '1');

  if (!fundResult.success) {
    return {
      success: false,
      funded: false,
      balance: balanceCheck.balancePOL,
      error: fundResult.error,
    };
  }

  // Check new balance
  const newBalanceCheck = await checkOperatorBalance(operatorAddress);

  return {
    success: true,
    funded: true,
    balance: newBalanceCheck.balancePOL,
    txHash: fundResult.txHash,
  };
}

/**
 * Get funding instructions for manual funding
 *
 * @param operatorAddress Operator address that needs funding
 * @returns Instructions
 */
export function getFundingInstructions(operatorAddress: string): {
  message: string;
  operatorAddress: string;
  minimumPOL: string;
  recommendedPOL: string;
  steps: string[];
} {
  return {
    message: 'Operator wallet needs POL for gas fees',
    operatorAddress,
    minimumPOL: '0.1 POL',
    recommendedPOL: '1 POL',
    steps: [
      `Send POL on Polygon network to: ${operatorAddress}`,
      'Use MetaMask or any Polygon wallet',
      'Minimum: 0.1 POL (for ~10-20 transactions)',
      'Recommended: 1 POL (for ~100-200 transactions)',
      'After funding, retry the setup',
    ],
  };
}
