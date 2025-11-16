import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import prisma from '@/lib/db/prisma';
import { deriveOperatorWallet } from '@/lib/operators/wallet-derivation';
import { loadCLOBCredentialsByUserId } from '@/lib/polymarket/credential-manager';
import { updateBalanceAllowance, getCLOBBalance } from '@/lib/polymarket/signature-type2-signer';

/**
 * POST /api/wallet/update-balance
 *
 * Manually update Safe balance in Polymarket CLOB backend
 * Fixes "not enough balance / allowance" errors
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        walletAddress: true,
        safeAddress: true,
      },
    });

    if (!user?.safeAddress) {
      return NextResponse.json(
        { error: 'Safe not deployed' },
        { status: 400 }
      );
    }

    // Load credentials
    const credentials = await loadCLOBCredentialsByUserId(session.user.id);

    if (!credentials) {
      return NextResponse.json(
        { error: 'CLOB credentials not found' },
        { status: 400 }
      );
    }

    // Derive operator
    const operator = deriveOperatorWallet(user.walletAddress);

    console.log('[UpdateBalance] Updating CLOB balance for user:', session.user.id);
    console.log('[UpdateBalance] Safe:', user.safeAddress);
    console.log('[UpdateBalance] Operator:', operator.address);

    // Update balance
    await updateBalanceAllowance(
      operator.privateKey,
      credentials,
      user.safeAddress,
      137
    );

    console.log('[UpdateBalance] ✅ Balance update sent to CLOB');

    // Wait for CLOB to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get updated balance
    const clobBalance = await getCLOBBalance(
      operator.privateKey,
      credentials,
      user.safeAddress,
      137
    );

    console.log('[UpdateBalance] CLOB Balance:', clobBalance);

    return NextResponse.json({
      success: true,
      message: 'Balance updated in CLOB',
      clobBalance,
    });
  } catch (error: any) {
    console.error('[UpdateBalance] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update balance' },
      { status: 500 }
    );
  }
}
