import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { tradeModuleV3, TRADE_MODULE_ADDRESS } from '@/lib/contracts/trade-module-v3'

/**
 * POST /api/wallet/enable-module
 *
 * Check if TradeModule is enabled on user's Safe
 * Returns instructions if not enabled
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        walletAddress: true,
        safeAddress: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.safeAddress) {
      return NextResponse.json(
        { error: 'No Safe deployed. Please deploy a Safe first.' },
        { status: 400 }
      )
    }

    // Check if module is already enabled
    const isEnabled = await tradeModuleV3.isEnabledOnSafe(user.safeAddress)

    if (isEnabled) {
      return NextResponse.json({
        success: true,
        enabled: true,
        message: 'TradeModule is already enabled on your Safe',
      })
    }

    // Module not enabled - return instructions
    return NextResponse.json({
      success: false,
      enabled: false,
      message: 'TradeModule not enabled. Please enable it to start copy trading.',
      instructions: {
        manual: {
          step1: `Visit Safe App: https://app.safe.global/home?safe=matic:${user.safeAddress}`,
          step2: 'Go to "Settings" → "Modules"',
          step3: 'Click "Add Module"',
          step4: `Enter module address: ${TRADE_MODULE_ADDRESS}`,
          step5: 'Sign the transaction to enable the module',
        },
        safeAppDirectLink: `https://app.safe.global/apps/open?safe=matic:${user.safeAddress}&appUrl=https://app.safe.global`,
      },
      moduleAddress: TRADE_MODULE_ADDRESS,
      safeAddress: user.safeAddress,
    })
  } catch (error: any) {
    console.error('POST /api/wallet/enable-module error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check module status' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/wallet/enable-module
 *
 * Check if TradeModule is enabled on user's Safe
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        safeAddress: true,
      },
    })

    if (!user?.safeAddress) {
      return NextResponse.json({
        enabled: false,
        message: 'No Safe deployed',
      })
    }

    // Check if module is enabled
    const isEnabled = await tradeModuleV3.isEnabledOnSafe(user.safeAddress)

    return NextResponse.json({
      enabled: isEnabled,
      safeAddress: user.safeAddress,
      moduleAddress: TRADE_MODULE_ADDRESS,
      message: isEnabled
        ? 'TradeModule is enabled'
        : 'TradeModule is not enabled. Enable it to start copy trading.',
    })
  } catch (error: any) {
    console.error('GET /api/wallet/enable-module error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check module status' },
      { status: 500 }
    )
  }
}
