/**
 * API Endpoint: Prepare Gas Transfer Transactions
 *
 * Prepares the transaction data for the user to:
 * 1. Approve USDC for QuickSwap
 * 2. Swap USDC to WMATIC
 * 3. Unwrap WMATIC to POL
 * 4. Transfer POL to operator
 *
 * POST /api/onboarding/prepare-gas-transfer
 *
 * Request:
 *   {
 *     userAddress: string,
 *     operatorAddress: string,
 *     usdcAmount: string
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     steps: [
 *       { type: 'approve', to: string, data: string, description: string },
 *       { type: 'swap', to: string, data: string, description: string },
 *       { type: 'unwrap', to: string, data: string, description: string },
 *       { type: 'transfer', to: string, value: string, description: string }
 *     ],
 *     summary: {
 *       usdcToSwap: string,
 *       expectedPol: string,
 *       minimumPol: string,
 *       exchangeRate: string
 *     }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { estimateUsdcFlowGas } from '@/lib/transactions/usdc-funding-flow';
import {
  calculateRequiredUsdcForGas,
  buildUserUsdcApproval,
  buildUserUsdcToWmaticSwap,
  buildUserWmaticUnwrap,
  checkUserUsdcBalance,
  checkUserUsdcAllowance,
} from '@/lib/dex/user-usdc-swap';

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, operatorAddress, usdcAmount } = body;

    // Validate inputs
    if (!userAddress || !operatorAddress || !usdcAmount) {
      return NextResponse.json(
        { error: 'userAddress, operatorAddress, and usdcAmount are required' },
        { status: 400 }
      );
    }

    // Validate addresses
    if (!ethers.isAddress(userAddress) || !ethers.isAddress(operatorAddress)) {
      return NextResponse.json(
        { error: 'Invalid Ethereum address' },
        { status: 400 }
      );
    }

    // Validate USDC amount
    let usdcAmountWei: bigint;
    try {
      usdcAmountWei = ethers.parseUnits(usdcAmount, 6);
      if (usdcAmountWei <= 0n) {
        return NextResponse.json(
          { error: 'USDC amount must be greater than 0' },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid USDC amount format' },
        { status: 400 }
      );
    }

    // Estimate gas cost for the funding flow
    const gasCost = await estimateUsdcFlowGas(usdcAmount, provider);

    // Calculate required USDC to swap for gas
    const swapQuote = await calculateRequiredUsdcForGas(
      gasCost.totalGasCostWei,
      provider
    );

    // Check user's USDC balance
    const balanceCheck = await checkUserUsdcBalance(
      userAddress,
      swapQuote.usdcAmount,
      provider
    );

    if (!balanceCheck.hasEnough) {
      return NextResponse.json(
        {
          error: 'Insufficient USDC balance',
          details: {
            required: ethers.formatUnits(balanceCheck.required, 6),
            balance: ethers.formatUnits(balanceCheck.balance, 6),
          },
        },
        { status: 400 }
      );
    }

    // Check USDC allowance
    const allowanceCheck = await checkUserUsdcAllowance(
      userAddress,
      swapQuote.usdcAmount,
      provider
    );

    // Build transaction steps
    const steps = [];

    // Step 1: Approve USDC (if needed)
    if (allowanceCheck.needsApproval) {
      const approveTx = buildUserUsdcApproval(swapQuote.usdcAmount);
      steps.push({
        type: 'approve',
        to: approveTx.to,
        data: approveTx.data,
        value: '0',
        description: `Approve ${ethers.formatUnits(swapQuote.usdcAmount, 6)} USDC for QuickSwap`,
        gasLimit: '60000',
      });
    }

    // Step 2: Swap USDC to WMATIC
    const swapTx = buildUserUsdcToWmaticSwap(
      swapQuote.usdcAmount,
      swapQuote.minimumPolOutput,
      userAddress
    );
    steps.push({
      type: 'swap',
      to: swapTx.to,
      data: swapTx.data,
      value: '0',
      description: `Swap ${ethers.formatUnits(swapQuote.usdcAmount, 6)} USDC to WMATIC`,
      gasLimit: '250000',
    });

    // Step 3: Unwrap WMATIC to POL
    const unwrapTx = buildUserWmaticUnwrap(swapQuote.expectedPolOutput);
    steps.push({
      type: 'unwrap',
      to: unwrapTx.to,
      data: unwrapTx.data,
      value: '0',
      description: `Unwrap WMATIC to ${ethers.formatEther(swapQuote.expectedPolOutput)} POL`,
      gasLimit: '50000',
    });

    // Step 4: Transfer POL to operator
    steps.push({
      type: 'transfer',
      to: operatorAddress,
      data: '0x',
      value: swapQuote.minimumPolOutput.toString(),
      description: `Transfer ${ethers.formatEther(swapQuote.minimumPolOutput)} POL to operator`,
      gasLimit: '21000',
    });

    return NextResponse.json({
      success: true,
      steps,
      summary: {
        usdcToSwap: ethers.formatUnits(swapQuote.usdcAmount, 6),
        expectedPol: ethers.formatEther(swapQuote.expectedPolOutput),
        minimumPol: ethers.formatEther(swapQuote.minimumPolOutput),
        exchangeRate: swapQuote.exchangeRate,
        estimatedGasCost: ethers.formatEther(gasCost.totalGasCostWei),
        operatorAddress,
      },
      checks: {
        hasEnoughUsdc: balanceCheck.hasEnough,
        needsApproval: allowanceCheck.needsApproval,
      },
    });
  } catch (error) {
    console.error('[prepare-gas-transfer] Error:', error);

    let errorMessage = 'Failed to prepare gas transfer';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
