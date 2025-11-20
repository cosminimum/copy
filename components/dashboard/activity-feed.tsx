'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ActivityLog {
  id: string
  action: string
  description: string
  createdAt: Date
}

async function fetchActivity(): Promise<ActivityLog[]> {
  const response = await fetch('/api/dashboard/activity')
  if (!response.ok) {
    throw new Error('Failed to fetch activity')
  }
  const data = await response.json()
  return data.activityLogs || []
}

export function ActivityFeed() {
  const { status } = useSession()

  const { data: activityLogs = [], isLoading: loading } = useQuery({
    queryKey: ['activity'],
    queryFn: fetchActivity,
    enabled: status === 'authenticated',
    refetchInterval: 30 * 1000,
    staleTime: 30 * 1000,
  })

  if (loading || status === 'loading') {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
          <CardDescription>Real-time updates from your copy trading activity</CardDescription>
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
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Activity Feed</CardTitle>
        <CardDescription>Real-time updates from your copy trading activity</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[400px] overflow-y-auto">
        {activityLogs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No activity yet. Start following traders to see activity here.
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
  )
}
