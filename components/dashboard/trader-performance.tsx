import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface TraderPerformanceData {
  trader: {
    walletAddress: string
    name: string | null
    profileImage: string | null
  }
  totalTrades: number
  successfulTrades: number
  totalPnL: number
  totalVolume: number
  avgTradeSize: number
}

interface TraderPerformanceProps {
  data: TraderPerformanceData[]
}

export function TraderPerformance({ data }: TraderPerformanceProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trader Performance</CardTitle>
          <CardDescription>Performance breakdown by trader</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No trader performance data available yet
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trader Performance</CardTitle>
        <CardDescription>Performance breakdown by trader</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((item) => {
            const successRate = item.totalTrades > 0
              ? ((item.successfulTrades / item.totalTrades) * 100).toFixed(1)
              : '0.0'

            return (
              <div
                key={item.trader.walletAddress}
                className="flex items-center justify-between border-b pb-4 last:border-0"
              >
                <div className="flex items-center gap-3 flex-1">
                  <img
                    src={item.trader.profileImage || `https://api.dicebear.com/7.x/identicon/svg?seed=${item.trader.walletAddress}`}
                    alt={item.trader.name || 'Trader'}
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <div className="font-medium">
                      {item.trader.name || `${item.trader.walletAddress.slice(0, 6)}...${item.trader.walletAddress.slice(-4)}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.trader.walletAddress.slice(0, 6)}...{item.trader.walletAddress.slice(-4)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 text-right">
                  <div>
                    <div className="text-sm font-medium">{item.totalTrades}</div>
                    <div className="text-xs text-muted-foreground">Trades</div>
                  </div>

                  <div>
                    <div className="text-sm font-medium">{successRate}%</div>
                    <div className="text-xs text-muted-foreground">Success</div>
                  </div>

                  <div>
                    <div className="text-sm font-medium">${item.totalVolume.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">Volume</div>
                  </div>

                  <div>
                    <div
                      className={`text-sm font-medium ${
                        item.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {item.totalPnL >= 0 ? '+' : ''}${item.totalPnL.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">P&L</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 pt-4 border-t">
          <div className="flex justify-between text-sm font-medium">
            <span>Total Performance</span>
            <span className={
              data.reduce((sum, item) => sum + item.totalPnL, 0) >= 0
                ? 'text-green-600'
                : 'text-red-600'
            }>
              {data.reduce((sum, item) => sum + item.totalPnL, 0) >= 0 ? '+' : ''}
              ${data.reduce((sum, item) => sum + item.totalPnL, 0).toFixed(2)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
