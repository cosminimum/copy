import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { isValidWalletAddress } from '@/lib/polymarket/api-client'

/**
 * Create or update copy trading settings
 * POST /api/copy-settings
 * Body: { walletAddress?, isGlobal?, positionSizeType, positionSizeValue, maxPositionSize?, minTradeSize?, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ensure user exists in database (handle case where DB was reset but JWT still valid)
    const userExists = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!userExists && session.user.walletAddress) {
      await prisma.user.create({
        data: {
          id: session.user.id,
          walletAddress: session.user.walletAddress,
        },
      })
    }

    const body = await request.json()
    const {
      walletAddress,
      isGlobal,
      positionSizeType,
      positionSizeValue,
      maxPositionSize,
      minTradeSize,
      stopLossPercentage,
      takeProfitPercentage,
      maxDailyLoss,
      maxConcurrentTrades,
      allowedMarketTypes,
      excludedMarketTypes,
    } = body

    if (!positionSizeType || positionSizeValue === undefined) {
      return NextResponse.json(
        { error: 'Position size settings are required' },
        { status: 400 }
      )
    }

    // Validate wallet address if provided
    if (walletAddress && !isValidWalletAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Find existing settings for this trader or global
    const existingSettings = await prisma.copySetting.findFirst({
      where: {
        userId: session.user.id,
        traderWalletAddress: walletAddress || null,
        isGlobal: isGlobal || false,
      },
    })

    const settingsData = {
      positionSizeType,
      positionSizeValue,
      maxPositionSize: maxPositionSize || null,
      minTradeSize: minTradeSize || null,
      stopLossPercentage: stopLossPercentage || null,
      takeProfitPercentage: takeProfitPercentage || null,
      maxDailyLoss: maxDailyLoss || null,
      maxConcurrentTrades: maxConcurrentTrades || null,
      allowedMarketTypes: allowedMarketTypes || [],
      excludedMarketTypes: excludedMarketTypes || [],
      isActive: true,
    }

    if (existingSettings) {
      // Update existing settings
      await prisma.copySetting.update({
        where: { id: existingSettings.id },
        data: settingsData,
      })
    } else {
      // Create new settings
      await prisma.copySetting.create({
        data: {
          userId: session.user.id,
          traderWalletAddress: walletAddress || null,
          isGlobal: isGlobal || false,
          ...settingsData,
        },
      })
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'COPY_SETTINGS_UPDATED',
        description: isGlobal
          ? 'Updated global copy settings'
          : `Updated copy settings for trader ${walletAddress}`,
        metadata: {
          walletAddress,
          isGlobal,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving copy settings:', error)
    return NextResponse.json(
      { error: 'Failed to save copy settings' },
      { status: 500 }
    )
  }
}
