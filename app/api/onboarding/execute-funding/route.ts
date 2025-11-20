/**
 * API Endpoint: Verify User-Side Funding Completion
 *
 * Verifies that the user has completed all funding transactions:
 * - User swapped USDC to POL and sent to operator
 * - User swapped USDC to USDC.e and sent to Safe
 *
 * This endpoint does NOT execute any swaps. It only verifies completion.
 *
 * POST /api/onboarding/execute-funding
 *
 * Request:
 *   { sessionId: string, txHashes?: { pol?: string, usdcE?: string } }
 *
 * Response:
 *   {
 *     success: boolean,
 *     verified: boolean,
 *     balances: { operatorPol, safeUsdcE },
 *     errors?: string[]
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import prisma from '@/lib/db/prisma';
import {
  verifyUserFundingCompletion,
  calculateExpectedBalances,
} from '@/lib/transactions/user-funding-verification';

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);

export async function POST(request: NextRequest) {
  try {
    console.log('[verify-funding] Request received');

    const body = await request.json();
    const { sessionId, txHashes } = body;

    console.log('[verify-funding] Request body:', { sessionId, txHashes });

    // Validate inputs
    if (!sessionId) {
      console.error('[verify-funding] Missing session ID');
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Get funding session from database
    const session = await prisma.fundingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Funding session not found' }, { status: 404 });
    }

    console.log('[verify-funding] Session found:', session);

    // Check session status
    if (session.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Funding session already completed' },
        { status: 400 }
      );
    }

    const { operatorAddress, safeAddress, usdcAmount } = session;

    // Calculate expected balances based on USDC amount
    console.log('[verify-funding] Calculating expected balances...');
    const expectedBalances = await calculateExpectedBalances(parseFloat(usdcAmount), provider);

    // Verify that user completed all transfers
    console.log('[verify-funding] Verifying funding completion...');
    const verification = await verifyUserFundingCompletion(
      operatorAddress,
      safeAddress,
      expectedBalances.expectedPolAmount,
      expectedBalances.expectedUsdcEAmount,
      provider
    );

    if (!verification.isValid) {
      console.error('[verify-funding] Verification failed:', verification.errors);
      if (verification.warnings.length > 0) {
        console.warn('[verify-funding] Warnings:', verification.warnings);
      }

      await prisma.fundingSession.update({
        where: { id: sessionId },
        data: {
          status: 'FAILED',
          errorMessage: verification.errors.join(', '),
        },
      });

      return NextResponse.json(
        {
          success: false,
          verified: false,
          errors: verification.errors,
          warnings: verification.warnings,
          balances: verification.balances,
          expected: {
            operatorPol: ethers.formatEther(expectedBalances.expectedPolAmount),
            safeUsdcE: ethers.formatUnits(expectedBalances.expectedUsdcEAmount, 6),
          },
        },
        { status: 400 }
      );
    }

    // Log warnings if any
    if (verification.warnings.length > 0) {
      console.warn('[verify-funding] Warnings:', verification.warnings);
    }

    // Update session status to COMPLETED
    await prisma.fundingSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        lastStep: 6, // All 6 steps completed by user
        completedAt: new Date(),
        finalBalances: {
          operatorPol: verification.balances.operatorPol,
          safeUsdcE: verification.balances.safeUsdcE,
        },
        txHashes: txHashes || {},
      },
    });

    console.log('[verify-funding] Funding verified and completed successfully');

    return NextResponse.json({
      success: true,
      verified: true,
      balances: verification.balances,
      warnings: verification.warnings,
      message: 'Funding completed successfully. Operator has POL for gas, Safe has USDC.e for trading.',
    });
  } catch (error) {
    console.error('[verify-funding] Error:', error);

    // Extract meaningful error message
    let errorMessage = 'Failed to verify funding completion';
    let errorDetails = 'Unknown error';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetails = error;
    } else if (error && typeof error === 'object') {
      errorMessage = (error as any).reason || (error as any).message || errorMessage;
      errorDetails = JSON.stringify(error);
    }

    console.error('[verify-funding] Error message:', errorMessage);
    console.error('[verify-funding] Error details:', errorDetails);

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check funding session status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const session = await prisma.fundingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Funding session not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        lastStep: session.lastStep,
        usdcAmount: session.usdcAmount,
        txHashes: session.txHashes,
        finalBalances: session.finalBalances,
        errorMessage: session.errorMessage,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
      },
    });
  } catch (error) {
    console.error('[execute-funding] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch funding session' },
      { status: 500 }
    );
  }
}
