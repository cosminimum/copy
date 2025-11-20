'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Trade {
  id: string
  market: string
  side: string
  outcome: string
  value: number
  timestamp: Date
  transactionHash: string | null
  status: string
}

async function fetchTrades(): Promise<Trade[]> {
  const response = await fetch('/api/dashboard/trades')
  if (!response.ok) {
    throw new Error('Failed to fetch trades')
  }
  const data = await response.json()
  return data.trades || []
}

export function RecentTrades() {
  const { status } = useSession()

  const { data: trades = [], isLoading: loading } = useQuery({
    queryKey: ['trades'],
    queryFn: fetchTrades,
    enabled: status === 'authenticated',
    refetchInterval: 30 * 1000,
    staleTime: 30 * 1000,
  })

  if (loading || status === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
          <CardDescription>Your latest copy trades</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Trades</CardTitle>
        <CardDescription>Your latest copy trades</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[400px] overflow-y-auto">
        {trades.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No trades yet. Start following traders to see activity here.
          </div>
        ) : (
          <div className="space-y-4">
            {trades.slice(0, 5).map((trade) => (
              <div key={trade.id} className="flex justify-between items-start border-b pb-3 last:border-0">
                <div className="flex-1">
                  <div className="font-medium text-sm">{trade.market}</div>
                  <div className="text-xs text-muted-foreground">
                    {trade.side} • {trade.outcome} • ${trade.value.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(trade.timestamp).toLocaleString()}
                  </div>
                  {trade.transactionHash && (
                    <div className="text-xs mt-1">
                      <a
                        href={`https://polygonscan.com/tx/${trade.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        View on Polygonscan ↗
                      </a>
                    </div>
                  )}
                </div>
                <div className={`text-xs font-medium px-2 py-1 rounded ${
                  trade.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                  trade.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {trade.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
