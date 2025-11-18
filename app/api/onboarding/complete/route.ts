import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { verifyOnboardingComplete } from '@/lib/blockchain/verify-onboarding'

export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/complete
 *
 * Verifies all onboarding requirements are met and marks onboarding as complete.
 *
 * This endpoint performs comprehensive verification:
 * 1. Safe is deployed and owned by operator
 * 2. Operator has sufficient POL for gas
 * 3. Safe has sufficient USDC.e for trading
 * 4. All token approvals are set correctly
 * 5. Security features (guard, withdrawal module) are enabled
 * 6. Operator credentials exist in database
 *
 * Only sets `onboardingCompletedAt` if ALL checks pass.
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user from database with all relations
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        operatorCredential: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if already onboarded
    if (user.onboardingCompletedAt) {
      return NextResponse.json({
        success: true,
        message: 'Already onboarded',
        onboardingCompletedAt: user.onboardingCompletedAt,
      })
    }

    // Validate required fields exist
    if (!user.safeAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Safe not deployed',
          details: { step: 'deploy_safe' },
        },
        { status: 400 }
      )
    }

    if (!user.operatorAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Operator not configured',
          details: { step: 'configure_operator' },
        },
        { status: 400 }
      )
    }

    if (!user.operatorCredential) {
      return NextResponse.json(
        {
          success: false,
          error: 'Operator credentials not created',
          details: { step: 'create_credentials' },
        },
        { status: 400 }
      )
    }

    // Perform comprehensive blockchain verification
    console.log('[API /api/onboarding/complete] Starting verification...')
    console.log(`[API] Safe: ${user.safeAddress}`)
    console.log(`[API] Operator: ${user.operatorAddress}`)

    const verification = await verifyOnboardingComplete({
      safeAddress: user.safeAddress,
      operatorAddress: user.operatorAddress,
      guardEnabled: user.guardEnabled,
      withdrawalModuleEnabled: user.withdrawalModuleEnabled,
    })

    console.log('[API /api/onboarding/complete] Verification result:', verification)

    // If verification failed, return errors
    if (!verification.isComplete) {
      return NextResponse.json(
        {
          success: false,
          error: 'Onboarding verification failed',
          errors: verification.errors,
          details: verification.details,
        },
        { status: 400 }
      )
    }

    // All checks passed! Mark onboarding as complete
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        onboardingCompletedAt: new Date(),
      },
    })

    console.log(
      '[API /api/onboarding/complete] ✅ Onboarding completed successfully'
    )

    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully',
      onboardingCompletedAt: updatedUser.onboardingCompletedAt,
      user: {
        id: updatedUser.id,
        safeAddress: updatedUser.safeAddress,
        operatorAddress: updatedUser.operatorAddress,
        guardEnabled: updatedUser.guardEnabled,
        withdrawalModuleEnabled: updatedUser.withdrawalModuleEnabled,
      },
    })
  } catch (error: any) {
    console.error('[API /api/onboarding/complete] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to complete onboarding',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
