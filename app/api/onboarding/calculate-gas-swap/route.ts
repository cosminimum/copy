/**
 * API Endpoint: Calculate Required USDC to POL Swap for Gas
 *
 * Calculates how much USDC the user needs to swap to POL
 * to cover the operator's gas fees for the funding flow.
 *
 * POST /api/onboarding/calculate-gas-swap
 *
 * Request:
 *   { usdcAmount: string }
 *
 * Response:
 *   {
 *     success: boolean,
 *     usdcToSwap: string,
 *     expectedPol: string,
 *     minimumPol: string,
 *     exchangeRate: string,
 *     estimatedGasCost: string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { estimateUsdcFlowGas } from '@/lib/transactions/usdc-funding-flow';
import { calculateRequiredUsdcForGas } from '@/lib/dex/user-usdc-swap';

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { usdcAmount } = body;

    if (!usdcAmount) {
      return NextResponse.json(
        { error: 'USDC amount is required' },
        { status: 400 }
      );
    }

    // Validate USDC amount
    try {
      const amount = ethers.parseUnits(usdcAmount, 6);
      if (amount <= 0n) {
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

    return NextResponse.json({
      success: true,
      usdcToSwap: ethers.formatUnits(swapQuote.usdcAmount, 6),
      expectedPol: ethers.formatEther(swapQuote.expectedPolOutput),
      minimumPol: ethers.formatEther(swapQuote.minimumPolOutput),
      exchangeRate: swapQuote.exchangeRate,
      estimatedGasCost: ethers.formatEther(gasCost.totalGasCostWei),
      estimatedGasCostUsdc: gasCost.totalGasCostUsdc,
      breakdown: {
        approve: ethers.formatEther(gasCost.breakdown.approve),
        swapToPol: ethers.formatEther(gasCost.breakdown.swapToPol),
        swapToUsdcE: ethers.formatEther(gasCost.breakdown.swapToUsdcE),
      },
    });
  } catch (error) {
    console.error('[calculate-gas-swap] Error:', error);

    let errorMessage = 'Failed to calculate gas swap';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
