'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ActivityLog {
  id: string
  action: string
  description: string
  createdAt: Date
}

export function ActivityFeed() {
  const { data: session, status } = useSession()
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  // Load activity when authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      loadActivity()
    }
  }, [status])

  // Clear state when session ends
  useEffect(() => {
    if (status === 'unauthenticated') {
      setActivityLogs([])
      setLoading(false)
    }
  }, [status])

  const loadActivity = async () => {
    try {
      const response = await fetch('/api/dashboard/activity')
      if (response.ok) {
        const data = await response.json()
        setActivityLogs(data.activityLogs || [])
      }
    } catch (error) {
      console.error('Error loading activity:', error)
    } finally {
      setLoading(false)
    }
  }

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
