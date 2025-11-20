import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'

/**
 * Get list of followed traders with performance metrics
 * GET /api/following
 */
export async function GET(request: NextRequest) {
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

    // Fetch active subscriptions (no trader join needed)
    const subscriptions = await prisma.subscription.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
    })

    // Build performance data for each followed trader
    const followingWithPerformance = await Promise.all(
      subscriptions.map(async (subscription) => {
        // Get trades from this trader
        const trades = await prisma.trade.findMany({
          where: {
            userId: session.user.id,
            traderWalletAddress: subscription.traderWalletAddress,
          },
        })

        const completedTrades = trades.filter(t => t.status === 'COMPLETED')

        const totalTrades = completedTrades.length
        const totalVolume = completedTrades.reduce((sum, t) => sum + t.value, 0)

        // Get user's positions to calculate PnL
        const positions = await prisma.position.findMany({
          where: {
            userId: session.user.id,
          },
        })

        // Calculate realized PnL from closed positions
        const realizedPnL = positions
          .filter(p => p.status === 'CLOSED')
          .reduce((sum, p) => sum + (p.realizedPnL || 0), 0)

        // Calculate unrealized PnL from open positions
        const unrealizedPnL = positions
          .filter(p => p.status === 'OPEN')
          .reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0)

        // Total PnL includes both realized and unrealized
        const totalPnL = realizedPnL + unrealizedPnL

        // Calculate win rate (based on closed positions only)
        const closedPositions = positions.filter(p => p.status === 'CLOSED')
        const profitableClosedPositions = closedPositions.filter(p => (p.realizedPnL || 0) > 0).length
        const winRate = closedPositions.length > 0 ? profitableClosedPositions / closedPositions.length : 0

        // Get copy settings for this trader
        const copySettings = await prisma.copySetting.findFirst({
          where: {
            userId: session.user.id,
            traderWalletAddress: subscription.traderWalletAddress,
          },
        })

        // Build trader object from subscription's cached data
        return {
          trader: {
            walletAddress: subscription.traderWalletAddress,
            name: subscription.traderName,
            profileImage: subscription.traderProfileImage,
          },
          performance: {
            totalTrades,
            totalVolume,
            totalPnL,
            winRate,
          },
          settings: copySettings,
        }
      })
    )

    return NextResponse.json({ following: followingWithPerformance })
  } catch (error) {
    console.error('Error fetching following:', error)
    return NextResponse.json(
      { error: 'Failed to fetch following' },
      { status: 500 }
    )
  }
}
