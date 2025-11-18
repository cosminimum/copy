'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface PortfolioStats {
  portfolioValue: number
  dailyPnL: number
  todayPnLPercent: string
  activePositions: number
  uniqueMarkets: number
  totalTrades: number
  todayTrades: number
  followingCount: number
}

export function PortfolioStats() {
  const { data: session, status } = useSession()
  const [stats, setStats] = useState<PortfolioStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Load stats when authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      loadStats()
    }
  }, [status])

  // Clear state when session ends
  useEffect(() => {
    if (status === 'unauthenticated') {
      setStats(null)
      setLoading(false)
    }
  }, [status])

  const loadStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || status === 'loading') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardDescription>Loading...</CardDescription>
              <CardTitle className="text-2xl">--</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">--</div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!stats || status === 'unauthenticated') {
    return null
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Portfolio Value</CardDescription>
          <CardTitle className="text-2xl">${stats.portfolioValue.toFixed(2)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-xs ${stats.dailyPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.dailyPnL >= 0 ? '+' : ''}{stats.todayPnLPercent}% today
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Active Positions</CardDescription>
          <CardTitle className="text-2xl">{stats.activePositions}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground">
            {stats.uniqueMarkets} markets
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Trades</CardDescription>
          <CardTitle className="text-2xl">{stats.totalTrades}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground">{stats.todayTrades} today</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Following</CardDescription>
          <CardTitle className="text-2xl">{stats.followingCount}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground">traders</div>
        </CardContent>
      </Card>
    </div>
  )
}
