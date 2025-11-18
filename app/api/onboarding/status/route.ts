import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import {
  checkOperatorBalance,
  checkSafeBalances,
  isContractDeployed,
} from '@/lib/blockchain/verify-onboarding'
import { ONBOARDING_CONSTANTS, type OnboardingStep } from '@/lib/constants/onboarding'

export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding/status
 *
 * Returns the current onboarding status for the authenticated user.
 * This endpoint determines which step the user is on by checking:
 * 1. Database state (user record)
 * 2. Blockchain state (balances, deployments)
 *
 * The blockchain is the source of truth for step progression.
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        operatorCredential: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // If onboarding is already complete, return success
    if (user.onboardingCompletedAt) {
      return NextResponse.json({
        currentStep: 6 as OnboardingStep,
        isComplete: true,
        onboardingCompletedAt: user.onboardingCompletedAt,
        safeAddress: user.safeAddress,
        operatorAddress: user.operatorAddress,
      })
    }

    // Determine current step based on state
    let currentStep: OnboardingStep = 1 // Default: Deploy Safe

    // Check if Safe is deployed
    if (!user.safeAddress || !user.safeDeployedAt) {
      return NextResponse.json({
        currentStep: 1 as OnboardingStep,
        isComplete: false,
        message: 'Safe not deployed',
      })
    }

    // Verify Safe is actually deployed on-chain
    const safeDeployed = await isContractDeployed(user.safeAddress)
    if (!safeDeployed) {
      return NextResponse.json({
        currentStep: 1 as OnboardingStep,
        isComplete: false,
        message: 'Safe not found on blockchain',
      })
    }

    currentStep = 2 // Safe deployed, move to Fund Operator

    // Check if operator is configured and has sufficient POL
    if (!user.operatorAddress) {
      return NextResponse.json({
        currentStep: 2 as OnboardingStep,
        isComplete: false,
        message: 'Operator not configured',
        safeAddress: user.safeAddress,
      })
    }

    const operatorBalance = await checkOperatorBalance(user.operatorAddress)
    if (!operatorBalance.hasSufficientPol) {
      return NextResponse.json({
        currentStep: 2 as OnboardingStep,
        isComplete: false,
        message: 'Operator needs POL for gas',
        safeAddress: user.safeAddress,
        operatorAddress: user.operatorAddress,
        operatorPolBalance: operatorBalance.polBalance.toString(),
        minPolRequired: Math.floor(ONBOARDING_CONSTANTS.MIN_POL_BALANCE).toString(),
      })
    }

    currentStep = 3 // Operator funded, move to Deposit USDC.e

    // Check if Safe has sufficient USDC.e
    const safeBalances = await checkSafeBalances(user.safeAddress)
    if (!safeBalances.hasSufficientUsdc) {
      return NextResponse.json({
        currentStep: 3 as OnboardingStep,
        isComplete: false,
        message: 'Safe needs USDC.e deposit',
        safeAddress: user.safeAddress,
        operatorAddress: user.operatorAddress,
        safeUsdcEBalance: safeBalances.usdcEBalance.toString(),
        safeNativeUsdcBalance: safeBalances.nativeUsdcBalance.toString(),
        hasWrongToken: safeBalances.hasWrongToken,
        minUsdcRequired: Math.floor(ONBOARDING_CONSTANTS.MIN_USDC_BALANCE).toString(),
      })
    }

    currentStep = 4 // Safe funded, move to Complete Setup

    // Check if security setup is complete
    if (!user.securitySetupCompletedAt) {
      return NextResponse.json({
        currentStep: 4 as OnboardingStep,
        isComplete: false,
        message: 'Security setup not complete',
        safeAddress: user.safeAddress,
        operatorAddress: user.operatorAddress,
        setupStatus: {
          guardEnabled: user.guardEnabled,
          withdrawalModuleEnabled: user.withdrawalModuleEnabled,
          credentialsCreated: !!user.operatorCredential,
        },
      })
    }

    currentStep = 5 // Setup complete, move to Review & Finalize

    return NextResponse.json({
      currentStep: 5 as OnboardingStep,
      isComplete: false,
      message: 'Ready for final review',
      safeAddress: user.safeAddress,
      operatorAddress: user.operatorAddress,
      safeUsdcEBalance: safeBalances.usdcEBalance.toString(),
      operatorPolBalance: operatorBalance.polBalance.toString(),
      setupComplete: true,
    })
  } catch (error: any) {
    console.error('[API /api/onboarding/status] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch onboarding status',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
