'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Position {
  id: string
  market: string
  side: string
  outcome: string
  size: number
  entryPrice: number
  unrealizedPnL: number
  status: string
}

export function ActivePositions() {
  const { data: session, status } = useSession()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  // Load positions when authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      loadPositions()
    }
  }, [status])

  // Clear state when session ends
  useEffect(() => {
    if (status === 'unauthenticated') {
      setPositions([])
      setLoading(false)
    }
  }, [status])

  const loadPositions = async () => {
    try {
      const response = await fetch('/api/dashboard/positions')
      if (response.ok) {
        const data = await response.json()
        setPositions(data.positions || [])
      }
    } catch (error) {
      console.error('Error loading positions:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || status === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Positions</CardTitle>
          <CardDescription>Your current open positions</CardDescription>
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
        <CardTitle>Active Positions</CardTitle>
        <CardDescription>Your current open positions</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[400px] overflow-y-auto">
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
  )
}
