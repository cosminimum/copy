import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import prisma from '@/lib/db/prisma';
import { verifySecuritySetup } from '@/lib/contracts/safe-security-setup';
import { checkApprovals } from '@/lib/contracts/token-approvals';
import { loadCLOBCredentialsByUserId } from '@/lib/polymarket/credential-manager';

/**
 * GET /api/wallet/security-status
 *
 * Check security setup status for SignatureType 2 architecture:
 * - Operator credentials
 * - Token approvals
 * - Guard configuration
 * - Withdrawal module
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user with Safe info
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        safeAddress: true,
        operatorAddress: true,
        guardEnabled: true,
        withdrawalModuleEnabled: true,
        walletAddress: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.safeAddress) {
      return NextResponse.json({
        ready: false,
        message: 'Safe not deployed',
        steps: {
          safeDeployed: false,
          operatorConfigured: false,
          credentialsCreated: false,
          tokensApproved: false,
          guardSet: false,
          withdrawalModuleEnabled: false,
        },
      });
    }

    // Check operator configuration
    const operatorConfigured = !!user.operatorAddress;

    // Check CLOB credentials
    const credentials = await loadCLOBCredentialsByUserId(session.user.id);
    const credentialsCreated = !!credentials;

    // Check token approvals
    const approvals = await checkApprovals(user.safeAddress);

    // Check security setup (guard + module)
    const security = await verifySecuritySetup(user.safeAddress, user.walletAddress);

    const allReady =
      operatorConfigured &&
      credentialsCreated &&
      approvals.allApproved &&
      security.isComplete;

    return NextResponse.json({
      ready: allReady,
      message: allReady
        ? 'All systems ready for trading'
        : 'Security setup incomplete',
      steps: {
        safeDeployed: true,
        operatorConfigured,
        credentialsCreated,
        tokensApproved: approvals.allApproved,
        guardSet: security.guardSet,
        withdrawalModuleEnabled: security.moduleEnabled && security.userAuthorized,
      },
      details: {
        operatorAddress: user.operatorAddress,
        approvals: {
          usdcToCTF: approvals.usdcToCTF,
          usdcToNegRisk: approvals.usdcToNegRisk,
          ctToCTF: approvals.ctToCTF,
          ctToNegRisk: approvals.ctToNegRisk,
        },
        security: {
          moduleEnabled: security.moduleEnabled,
          userAuthorized: security.userAuthorized,
          guardSet: security.guardSet,
        },
      },
    });
  } catch (error: any) {
    console.error('[SecurityStatus] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check security status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallet/security-status
 *
 * Run complete security setup (operator + credentials + approvals + guard + module)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // This endpoint will trigger the complete setup process
    // For now, return instruction to use the onboarding script
    return NextResponse.json({
      message: 'Please run the onboarding script to complete security setup',
      command: `npx ts-node scripts/onboard-user-complete.ts ${session.user.walletAddress}`,
    }, { status: 501 });
  } catch (error: any) {
    console.error('[SecuritySetup] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to setup security' },
      { status: 500 }
    );
  }
}
