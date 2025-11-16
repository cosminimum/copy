import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import prisma from '@/lib/db/prisma';
import { ethers } from 'ethers';
import { deriveOperatorWallet } from '@/lib/operators/wallet-derivation';
import { createAndStoreCLOBCredentials } from '@/lib/polymarket/credential-manager';
import { approveAllTokens } from '@/lib/contracts/token-approvals';
import { updateBalanceAllowance } from '@/lib/polymarket/signature-type2-signer';
import { ensureOperatorFunded, getFundingInstructions } from '@/lib/operators/operator-funding';
import { setupCompleteSecurity } from '@/lib/contracts/safe-security-setup';

/**
 * POST /api/wallet/complete-setup
 *
 * Complete automated setup for SignatureType 2 architecture:
 * 1. Derive operator wallet
 * 2. Create CLOB API credentials
 * 3. Approve tokens to all exchanges
 * 4. Update CLOB balance
 *
 * Note: Security setup (guard + module) is optional for now
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        walletAddress: true,
        safeAddress: true,
        operatorAddress: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.safeAddress) {
      return NextResponse.json(
        { error: 'Safe not deployed. Please deploy Safe first.' },
        { status: 400 }
      );
    }

    const results = {
      operatorDerived: false,
      credentialsCreated: false,
      tokensApproved: false,
      securitySetup: false,
      balanceUpdated: false,
      error: null as string | null,
    };

    // Step 1: Derive operator wallet
    console.log('[CompleteSetup] Step 1: Deriving operator wallet...');
    let operatorWallet: ethers.Wallet;
    try {
      operatorWallet = deriveOperatorWallet(user.walletAddress);

      // Update user with operator address if not already set
      if (!user.operatorAddress) {
        await prisma.user.update({
          where: { id: user.id },
          data: { operatorAddress: operatorWallet.address },
        });
      }

      results.operatorDerived = true;
      console.log(`[CompleteSetup] ✅ Operator derived: ${operatorWallet.address}`);
    } catch (error: any) {
      console.error('[CompleteSetup] Operator derivation failed:', error);
      return NextResponse.json(
        {
          error: 'Failed to derive operator wallet',
          details: error.message,
          results,
        },
        { status: 500 }
      );
    }

    // Step 1.5: Ensure operator has POL for gas
    console.log('[CompleteSetup] Checking operator balance...');
    try {
      const fundingResult = await ensureOperatorFunded(operatorWallet.address);

      if (!fundingResult.success) {
        console.error('[CompleteSetup] Operator funding failed:', fundingResult.error);

        // Return helpful error with funding instructions
        const instructions = getFundingInstructions(operatorWallet.address);

        return NextResponse.json(
          {
            error: 'Operator wallet needs POL for gas fees',
            errorCode: 'OPERATOR_NEEDS_FUNDING',
            details: fundingResult.error,
            fundingInstructions: instructions,
            results,
          },
          { status: 402 } // Payment Required
        );
      }

      if (fundingResult.funded) {
        console.log(`[CompleteSetup] ✅ Operator funded with ${fundingResult.balance} POL (tx: ${fundingResult.txHash})`);
      } else {
        console.log(`[CompleteSetup] ✅ Operator already has ${fundingResult.balance} POL`);
      }
    } catch (error: any) {
      console.error('[CompleteSetup] Operator funding check failed:', error);
      // Continue anyway - the token approval will fail with better error
    }

    // Step 2: Create CLOB credentials
    console.log('[CompleteSetup] Step 2: Creating CLOB API credentials...');
    try {
      const credentials = await createAndStoreCLOBCredentials(
        user.id,
        operatorWallet.privateKey,
        operatorWallet.address,
        137
      );
      results.credentialsCreated = true;
      console.log(`[CompleteSetup] ✅ CLOB credentials created: ${credentials.apiKey}`);
    } catch (error: any) {
      console.error('[CompleteSetup] Credential creation failed:', error);
      return NextResponse.json(
        {
          error: 'Failed to create CLOB credentials',
          details: error.message,
          results,
        },
        { status: 500 }
      );
    }

    // Step 3: Approve tokens to all exchanges
    console.log('[CompleteSetup] Step 3: Approving tokens...');
    try {
      const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);
      const connectedOperator = operatorWallet.connect(provider);

      const approvalResults = await approveAllTokens(user.safeAddress, connectedOperator);

      if (!approvalResults.success) {
        throw new Error(approvalResults.error || 'Token approval failed');
      }

      results.tokensApproved = true;
      console.log('[CompleteSetup] ✅ All token approvals complete');
    } catch (error: any) {
      console.error('[CompleteSetup] Token approval failed:', error);

      // Check if it's a funding issue
      if (error.code === 'INSUFFICIENT_FUNDS' || error.message?.includes('insufficient funds')) {
        const instructions = getFundingInstructions(operatorWallet.address);

        return NextResponse.json(
          {
            error: 'Operator wallet needs POL for gas fees',
            errorCode: 'OPERATOR_NEEDS_FUNDING',
            details: 'The operator wallet does not have enough POL to pay for token approval transactions (~$0.01 total).',
            fundingInstructions: instructions,
            results,
          },
          { status: 402 }
        );
      }

      return NextResponse.json(
        {
          error: 'Failed to approve tokens',
          details: error.message,
          results,
        },
        { status: 500 }
      );
    }

    // Step 4: Setup security (guard + withdrawal module)
    console.log('[CompleteSetup] Step 4: Setting up security (guard + module)...');
    try {
      const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);
      const connectedOperator = operatorWallet.connect(provider);

      const securityResult = await setupCompleteSecurity(
        user.safeAddress,
        user.walletAddress,
        connectedOperator
      );

      if (securityResult.success) {
        console.log('[CompleteSetup] ✅ Security setup complete');
        results.securitySetup = true;

        // Update user record
        await prisma.user.update({
          where: { id: user.id },
          data: {
            guardEnabled: securityResult.guardSet,
            withdrawalModuleEnabled: securityResult.moduleEnabled && securityResult.userAuthorized,
            securitySetupCompletedAt: new Date(),
          },
        });
      } else {
        console.warn('[CompleteSetup] ⚠️  Security setup failed:', securityResult.error);
        console.warn('[CompleteSetup] Continuing anyway - user can set up security later');
      }
    } catch (error: any) {
      console.error('[CompleteSetup] Security setup error:', error);
      // Don't fail the whole process - security setup is optional
      console.log('[CompleteSetup] ⚠️  Continuing without security setup');
    }

    // Step 5: Update balance in CLOB
    console.log('[CompleteSetup] Step 5: Updating CLOB balance...');
    try {
      // Load credentials to update balance
      const credentials = await prisma.operatorCredential.findUnique({
        where: { userId: user.id },
      });

      if (credentials) {
        await updateBalanceAllowance(
          operatorWallet.privateKey,
          {
            apiKey: credentials.apiKey,
            apiSecret: credentials.apiSecret,
            apiPassphrase: credentials.apiPassphrase,
          },
          user.safeAddress,
          137
        );
        results.balanceUpdated = true;
        console.log('[CompleteSetup] ✅ CLOB balance updated');
      }
    } catch (error: any) {
      console.error('[CompleteSetup] Balance update failed:', error);
      // Don't fail the whole process for this
      console.log('[CompleteSetup] ⚠️  Continuing without balance update');
    }

    console.log('[CompleteSetup] 🎉 Setup complete!');

    return NextResponse.json({
      success: true,
      message: 'Setup completed successfully',
      results,
      operatorAddress: operatorWallet.address,
    });
  } catch (error: any) {
    console.error('[CompleteSetup] Unexpected error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Setup failed',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/wallet/complete-setup
 *
 * Check if setup can be run (Safe must be deployed)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        operatorCredential: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const canRun = !!user.safeAddress;
    const alreadySetup = !!(user.operatorAddress && user.operatorCredential);

    return NextResponse.json({
      canRun,
      alreadySetup,
      safeAddress: user.safeAddress,
      operatorAddress: user.operatorAddress,
    });
  } catch (error: any) {
    console.error('[CompleteSetup] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check setup status' },
      { status: 500 }
    );
  }
}
