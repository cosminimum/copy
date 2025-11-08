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

        // Calculate total PnL for trades from this trader
        const totalPnL = completedTrades.reduce((sum, t) => {
          const position = positions.find(p => p.market === t.market && p.asset === t.asset)
          return sum + (position?.realizedPnL || 0)
        }, 0)

        // Calculate win rate
        const profitableTrades = completedTrades.filter(t => {
          const position = positions.find(p => p.market === t.market && p.asset === t.asset)
          return position && position.realizedPnL > 0
        }).length

        const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0

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
