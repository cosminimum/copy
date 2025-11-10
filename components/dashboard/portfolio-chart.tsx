'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface PortfolioSnapshot {
  id: string
  totalValue: number
  createdAt: Date
  dailyPnL: number
}

interface PortfolioChartProps {
  snapshots: PortfolioSnapshot[]
}

export function PortfolioChart({ snapshots }: PortfolioChartProps) {
  // Format data for the chart
  const chartData = snapshots.map(snapshot => ({
    date: new Date(snapshot.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }),
    value: snapshot.totalValue,
    pnl: snapshot.dailyPnL,
  })).reverse() // Reverse to show oldest to newest

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Value</CardTitle>
        <CardDescription>Historical portfolio value over time</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No portfolio data available yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.5rem',
                }}
                labelStyle={{ color: 'hsl(var(--card-foreground))' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Value']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
