import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { isValidWalletAddress } from '@/lib/polymarket/api-client'

/**
 * Follow a trader (create subscription)
 * POST /api/subscriptions
 * Body: { walletAddress, traderName?, traderProfileImage? }
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
    const { walletAddress, traderName, traderProfileImage } = body

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Validate wallet address format
    if (!isValidWalletAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Check if subscription already exists
    const existingSubscription = await prisma.subscription.findUnique({
      where: {
        userId_traderWalletAddress: {
          userId: session.user.id,
          traderWalletAddress: walletAddress,
        },
      },
    })

    if (existingSubscription) {
      // Reactivate if inactive, update cached info
      await prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          isActive: true,
          traderName: traderName || existingSubscription.traderName,
          traderProfileImage: traderProfileImage || existingSubscription.traderProfileImage,
        },
      })
    } else {
      // Create new subscription
      await prisma.subscription.create({
        data: {
          userId: session.user.id,
          traderWalletAddress: walletAddress,
          traderName: traderName || null,
          traderProfileImage: traderProfileImage || null,
          isActive: true,
        },
      })
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'TRADER_FOLLOWED',
        description: `Started following trader ${traderName || walletAddress}`,
        metadata: {
          walletAddress,
          traderName,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error creating subscription:', error)
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    )
  }
}

/**
 * Unfollow a trader (deactivate subscription)
 * DELETE /api/subscriptions?walletAddress=<address>
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Validate wallet address format
    if (!isValidWalletAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Get subscription to cache trader name for activity log
    const subscription = await prisma.subscription.findUnique({
      where: {
        userId_traderWalletAddress: {
          userId: session.user.id,
          traderWalletAddress: walletAddress,
        },
      },
    })

    // Deactivate subscription
    await prisma.subscription.updateMany({
      where: {
        userId: session.user.id,
        traderWalletAddress: walletAddress,
      },
      data: { isActive: false },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: 'TRADER_UNFOLLOWED',
        description: `Stopped following trader ${subscription?.traderName || walletAddress}`,
        metadata: {
          walletAddress,
          traderName: subscription?.traderName,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting subscription:', error)
    return NextResponse.json(
      { error: 'Failed to delete subscription' },
      { status: 500 }
    )
  }
}
