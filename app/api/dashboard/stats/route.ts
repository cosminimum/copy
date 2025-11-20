import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { PortfolioCalculator } from '@/lib/services/portfolio-calculator'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      })
    }

    const [subscriptions, trades, positions, portfolioSnapshots] = await Promise.all([
      prisma.subscription.findMany({
        where: {
          userId: session.user.id,
          isActive: true,
        },
      }),
      prisma.trade.findMany({
        where: {
          userId: session.user.id,
        },
        orderBy: {
          timestamp: 'desc',
        },
      }),
      prisma.position.findMany({
        where: {
          userId: session.user.id,
          status: 'OPEN',
        },
      }),
      prisma.portfolioSnapshot.findMany({
        where: {
          userId: session.user.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      }),
    ])

    const totalTrades = trades.length
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayTrades = trades.filter(t => t.timestamp >= todayStart).length

    // Get latest portfolio snapshot or calculate from positions
    const latestSnapshot = portfolioSnapshots[0]
    let portfolioValue = latestSnapshot?.totalValue || 0
    let dailyPnL = latestSnapshot?.dailyPnL || 0

    // If no snapshot exists or it's old, calculate live portfolio value
    const snapshotAge = latestSnapshot ? Date.now() - latestSnapshot.createdAt.getTime() : Infinity
    const SNAPSHOT_STALE_THRESHOLD = 10 * 60 * 1000 // 10 minutes

    if (!latestSnapshot || snapshotAge > SNAPSHOT_STALE_THRESHOLD) {
      try {
        const portfolioCalculator = new PortfolioCalculator()
        const livePortfolio = await portfolioCalculator.calculatePortfolioValue(session.user.id)
        portfolioValue = livePortfolio.totalValue
        dailyPnL = livePortfolio.dailyPnL
      } catch (error) {
        console.error('Error calculating live portfolio value:', error)
        // Fall back to snapshot or 0
      }
    }

    const todayPnLPercent = portfolioValue > 0 ? ((dailyPnL / portfolioValue) * 100).toFixed(2) : '0.00'

    return NextResponse.json({
      portfolioValue,
      dailyPnL,
      todayPnLPercent,
      activePositions: positions.length,
      uniqueMarkets: new Set(positions.map(p => p.market)).size,
      totalTrades,
      todayTrades,
      followingCount: subscriptions.length,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
