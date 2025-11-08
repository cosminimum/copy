import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Navbar } from '@/components/layout/navbar'
import { FollowingSection } from '@/components/dashboard/following-section'
import { TraderPerformance } from '@/components/dashboard/trader-performance'
import { WebSocketStatus } from '@/components/dashboard/websocket-status'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <h1 className="text-3xl font-bold mb-4">Welcome to Polymarket Copy Trader</h1>
            <p className="text-muted-foreground mb-8">
              Connect your wallet to start following top traders and copying their trades automatically
            </p>
          </div>
        </div>
      </div>
    )
  }

  const [subscriptions, trades, positions, activityLogs] = await Promise.all([
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
      take: 10,
    }),
    prisma.position.findMany({
      where: {
        userId: session.user.id,
        status: 'OPEN',
      },
    }),
    prisma.activityLog.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    }),
  ])

  // Calculate trader performance
  const traderPerformance = await Promise.all(
    subscriptions.map(async (sub) => {
      const traderTrades = await prisma.trade.findMany({
        where: {
          userId: session.user.id,
          traderWalletAddress: sub.traderWalletAddress,
        },
      })

      const successfulTrades = traderTrades.filter(t => t.status === 'COMPLETED').length
      const totalVolume = traderTrades.reduce((sum, t) => sum + t.value, 0)

      // Calculate PnL for this trader's trades
      const traderPositions = await prisma.position.findMany({
        where: {
          userId: session.user.id,
        },
      })

      // Simple PnL calculation based on positions
      const totalPnL = traderPositions.reduce((sum, p) => {
        return sum + p.unrealizedPnL + p.realizedPnL
      }, 0)

      return {
        trader: {
          walletAddress: sub.traderWalletAddress,
          name: sub.traderName,
          profileImage: sub.traderProfileImage,
        },
        totalTrades: traderTrades.length,
        successfulTrades,
        totalPnL: totalPnL / subscriptions.length, // Rough attribution
        totalVolume,
        avgTradeSize: traderTrades.length > 0 ? totalVolume / traderTrades.length : 0,
      }
    })
  )

  const totalTrades = trades.length
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayTrades = trades.filter(t => t.timestamp >= todayStart).length

  const completedTrades = trades.filter(t => t.status === 'COMPLETED')
  const totalPnL = completedTrades.reduce((sum, t) => {
    const position = positions.find(p => p.market === t.market && p.asset === t.asset)
    return sum + (position?.realizedPnL || 0)
  }, 0)

  const portfolioValue = 10000 + totalPnL
  const todayPnLPercent = portfolioValue > 0 ? ((totalPnL / portfolioValue) * 100).toFixed(2) : 0

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Monitor your copy trading activity</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Portfolio Value</CardDescription>
              <CardTitle className="text-2xl">${portfolioValue.toFixed(2)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xs ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalPnL >= 0 ? '+' : ''}{todayPnLPercent}% today
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Positions</CardDescription>
              <CardTitle className="text-2xl">{positions.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                {new Set(positions.map(p => p.market)).size} markets
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Trades</CardDescription>
              <CardTitle className="text-2xl">{totalTrades}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">{todayTrades} today</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Following</CardDescription>
              <CardTitle className="text-2xl">{subscriptions.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">traders</div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <FollowingSection />
        </div>

        {subscriptions.length > 0 && (
          <div className="mb-8">
            <TraderPerformance data={traderPerformance} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
              <CardDescription>Your latest copy trades</CardDescription>
            </CardHeader>
            <CardContent>
              {trades.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No trades yet. Start following traders to see activity here.
                </div>
              ) : (
                <div className="space-y-4">
                  {trades.slice(0, 5).map((trade) => (
                    <div key={trade.id} className="flex justify-between items-start border-b pb-3 last:border-0">
                      <div>
                        <div className="font-medium text-sm">{trade.market}</div>
                        <div className="text-xs text-muted-foreground">
                          {trade.side} • {trade.outcome} • ${trade.value.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(trade.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className={`text-xs font-medium ${
                        trade.status === 'COMPLETED' ? 'text-green-600' :
                        trade.status === 'FAILED' ? 'text-red-600' :
                        'text-yellow-600'
                      }`}>
                        {trade.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Positions</CardTitle>
              <CardDescription>Your current open positions</CardDescription>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No open positions
                </div>
              ) : (
                <div className="space-y-4">
                  {positions.slice(0, 5).map((position) => (
                    <div key={position.id} className="flex justify-between items-start border-b pb-3 last:border-0">
                      <div>
                        <div className="font-medium text-sm">{position.market}</div>
                        <div className="text-xs text-muted-foreground">
                          {position.side} • {position.outcome} • {position.size} shares
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Entry: ${position.entryPrice.toFixed(4)}
                        </div>
                      </div>
                      <div className={`text-xs font-medium ${
                        position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity Feed</CardTitle>
            <CardDescription>Real-time updates from your copy trading activity</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLogs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  {subscriptions.length === 0
                    ? "No activity yet. Start following traders to see activity here."
                    : "No activity yet. Trades will appear here as they happen."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activityLogs.map((log) => (
                  <div key={log.id} className="flex justify-between items-start border-b pb-3 last:border-0">
                    <div>
                      <div className="font-medium text-sm">{log.action.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-muted-foreground">{log.description}</div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
