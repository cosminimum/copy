/**
 * API Endpoint: Prepare User-Side Funding Transactions
 *
 * Prepares ALL transactions for the user to execute in their wallet:
 * 1. Approve USDC for QuickSwap
 * 2. Swap 5% USDC → WMATIC (for operator gas)
 * 3. Unwrap WMATIC → POL
 * 4. Transfer POL to operator
 * 5. Swap 95% USDC → USDC.e (for Safe trading capital)
 * 6. Transfer USDC.e to Safe
 *
 * POST /api/onboarding/prepare-user-funding
 *
 * Request:
 *   {
 *     userAddress: string,
 *     operatorAddress: string,
 *     safeAddress: string,
 *     usdcAmount: string
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     transactions: UserFundingTransaction[],
 *     summary: {
 *       totalUsdc: string,
 *       operatorPol: { usdc, expectedPol, minimumPol, rate },
 *       safeUsdcE: { usdc, expectedUsdcE, minimumUsdcE, rate }
 *     },
 *     checks: { hasEnoughUsdc, needsApproval }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  getUserFundingQuotes,
  buildUsdcApprovalTx,
  buildUsdcToWmaticTx,
  buildWmaticUnwrapTx,
  buildPolTransferTx,
  buildUsdcToUsdcETx,
  buildUsdcETransferTx,
  checkUserUsdcBalance,
  checkUsdcAllowance,
  UserFundingTransaction,
} from '@/lib/dex/user-funding-swaps';

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, operatorAddress, safeAddress, usdcAmount } = body;

    console.log('[prepare-user-funding] Request:', {
      userAddress,
      operatorAddress,
      safeAddress,
      usdcAmount,
    });

    // Validate inputs
    if (!userAddress || !operatorAddress || !safeAddress || !usdcAmount) {
      return NextResponse.json(
        { error: 'userAddress, operatorAddress, safeAddress, and usdcAmount are required' },
        { status: 400 }
      );
    }

    // Validate addresses
    if (
      !ethers.isAddress(userAddress) ||
      !ethers.isAddress(operatorAddress) ||
      !ethers.isAddress(safeAddress)
    ) {
      return NextResponse.json({ error: 'Invalid Ethereum address' }, { status: 400 });
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
      return NextResponse.json({ error: 'Invalid USDC amount format' }, { status: 400 });
    }

    // Check minimum amount
    const minAmount = ethers.parseUnits('0.01', 6);
    if (usdcAmountWei < minAmount) {
      return NextResponse.json(
        { error: 'Minimum funding amount is $0.01 USDC' },
        { status: 400 }
      );
    }

    // Get quotes for both swaps
    console.log('[prepare-user-funding] Getting quotes...');
    const quotes = await getUserFundingQuotes(usdcAmountWei, provider);

    // Check user balance
    const balanceCheck = await checkUserUsdcBalance(userAddress, usdcAmountWei, provider);
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

    // Check allowance
    const allowanceCheck = await checkUsdcAllowance(userAddress, usdcAmountWei, provider);

    // Build transaction sequence
    const transactions: UserFundingTransaction[] = [];

    // Step 1: Approve USDC (if needed)
    if (allowanceCheck.needsApproval) {
      const approveTx = buildUsdcApprovalTx(usdcAmountWei);
      transactions.push({
        type: 'approve',
        to: approveTx.to,
        data: approveTx.data,
        value: approveTx.value,
        description: `Approve ${ethers.formatUnits(usdcAmountWei, 6)} USDC for QuickSwap`,
        gasLimit: '60000',
      });
    }

    // Step 2: Swap 5% USDC → WMATIC
    const swapToWmaticTx = buildUsdcToWmaticTx(
      quotes.operatorPol.usdcAmount,
      quotes.operatorPol.minimumPol,
      userAddress
    );
    transactions.push({
      type: 'swap_to_pol',
      to: swapToWmaticTx.to,
      data: swapToWmaticTx.data,
      value: swapToWmaticTx.value,
      description: `Swap ${ethers.formatUnits(quotes.operatorPol.usdcAmount, 6)} USDC to WMATIC (for operator gas)`,
      gasLimit: '250000',
    });

    // Step 3: Unwrap WMATIC → POL
    const unwrapTx = buildWmaticUnwrapTx(quotes.operatorPol.expectedPol);
    transactions.push({
      type: 'unwrap_pol',
      to: unwrapTx.to,
      data: unwrapTx.data,
      value: unwrapTx.value,
      description: `Unwrap WMATIC to ${ethers.formatEther(quotes.operatorPol.expectedPol)} POL`,
      gasLimit: '50000',
    });

    // Step 4: Transfer POL to operator
    const transferPolTx = buildPolTransferTx(operatorAddress, quotes.operatorPol.minimumPol);
    transactions.push({
      type: 'transfer_pol',
      to: transferPolTx.to,
      data: transferPolTx.data,
      value: transferPolTx.value,
      description: `Transfer ${ethers.formatEther(quotes.operatorPol.minimumPol)} POL to operator`,
      gasLimit: '21000',
    });

    // Step 5: Swap 95% USDC → USDC.e
    const swapToUsdcETx = buildUsdcToUsdcETx(
      quotes.safeUsdcE.usdcAmount,
      quotes.safeUsdcE.minimumUsdcE,
      userAddress
    );
    transactions.push({
      type: 'swap_to_usdce',
      to: swapToUsdcETx.to,
      data: swapToUsdcETx.data,
      value: swapToUsdcETx.value,
      description: `Swap ${ethers.formatUnits(quotes.safeUsdcE.usdcAmount, 6)} USDC to USDC.e (for Safe trading)`,
      gasLimit: '200000',
    });

    // Step 6: Transfer USDC.e to Safe
    const transferUsdcETx = buildUsdcETransferTx(safeAddress, quotes.safeUsdcE.minimumUsdcE);
    transactions.push({
      type: 'transfer_usdce',
      to: transferUsdcETx.to,
      data: transferUsdcETx.data,
      value: transferUsdcETx.value,
      description: `Transfer ${ethers.formatUnits(quotes.safeUsdcE.minimumUsdcE, 6)} USDC.e to Safe`,
      gasLimit: '65000',
    });

    console.log('[prepare-user-funding] Prepared', transactions.length, 'transactions');

    return NextResponse.json({
      success: true,
      transactions,
      summary: {
        totalUsdc: ethers.formatUnits(usdcAmountWei, 6),
        operatorPol: {
          usdc: ethers.formatUnits(quotes.operatorPol.usdcAmount, 6),
          expectedPol: ethers.formatEther(quotes.operatorPol.expectedPol),
          minimumPol: ethers.formatEther(quotes.operatorPol.minimumPol),
          rate: quotes.operatorPol.exchangeRate,
        },
        safeUsdcE: {
          usdc: ethers.formatUnits(quotes.safeUsdcE.usdcAmount, 6),
          expectedUsdcE: ethers.formatUnits(quotes.safeUsdcE.expectedUsdcE, 6),
          minimumUsdcE: ethers.formatUnits(quotes.safeUsdcE.minimumUsdcE, 6),
          rate: quotes.safeUsdcE.exchangeRate,
        },
        operatorAddress,
        safeAddress,
      },
      checks: {
        hasEnoughUsdc: balanceCheck.hasEnough,
        needsApproval: allowanceCheck.needsApproval,
        currentBalance: ethers.formatUnits(balanceCheck.balance, 6),
        currentAllowance: ethers.formatUnits(allowanceCheck.allowance, 6),
      },
    });
  } catch (error) {
    console.error('[prepare-user-funding] Error:', error);

    let errorMessage = 'Failed to prepare user funding transactions';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}
