'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Activity, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'

interface HealthCheck {
  healthy: boolean
  balance?: number
  threshold?: number
  message?: string
  paused?: boolean
  blockNumber?: number
  currentOwner?: string
  expectedOwner?: string
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'error'
  timestamp: string
  checks: {
    operatorBalance: HealthCheck
    moduleNotPaused: HealthCheck
    rpcConnected: HealthCheck
    operatorIsOwner: HealthCheck
  }
}

export function SystemHealth({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHealth()
    // Refresh every 60 seconds
    const interval = setInterval(fetchHealth, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchHealth = async () => {
    try {
      const response = await fetch('/api/health')
      const data = await response.json()
      setHealth(data)
    } catch (err) {
      console.error('Failed to fetch health:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Badge variant="outline" className="gap-1">
        <RefreshCw className="h-3 w-3 animate-spin" />
        {!compact && 'Checking...'}
      </Badge>
    )
  }

  if (!health) return null

  const isHealthy = health.status === 'healthy'
  const Icon = isHealthy ? CheckCircle2 : AlertCircle

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchHealth}
              className="gap-2"
            >
              <Icon className={`h-4 w-4 ${isHealthy ? 'text-green-600' : 'text-red-600'}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-2">
              <p className="font-semibold">
                System: {isHealthy ? 'Healthy' : 'Issues Detected'}
              </p>
              {!health.checks.rpcConnected.healthy && (
                <p className="text-xs text-red-600">RPC Connection: Failed</p>
              )}
              {!health.checks.operatorBalance.healthy && (
                <p className="text-xs text-red-600">
                  Operator Balance: Low ({health.checks.operatorBalance.balance?.toFixed(4)} POL)
                </p>
              )}
              {!health.checks.moduleNotPaused.healthy && (
                <p className="text-xs text-red-600">Trading: Paused</p>
              )}
              {!health.checks.operatorIsOwner.healthy && (
                <p className="text-xs text-red-600">Ownership: Mismatch</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h3 className="font-semibold">System Health</h3>
        </div>
        <Badge variant={isHealthy ? 'default' : 'destructive'} className="gap-1">
          <Icon className="h-3 w-3" />
          {isHealthy ? 'Healthy' : 'Issues'}
        </Badge>
      </div>

      <div className="space-y-2 text-sm">
        <HealthCheckRow
          label="RPC Connection"
          healthy={health.checks.rpcConnected.healthy}
          message={
            health.checks.rpcConnected.healthy
              ? `Block: ${health.checks.rpcConnected.blockNumber}`
              : health.checks.rpcConnected.message
          }
        />
        <HealthCheckRow
          label="Operator Balance"
          healthy={health.checks.operatorBalance.healthy}
          message={
            health.checks.operatorBalance.balance !== undefined
              ? `${health.checks.operatorBalance.balance.toFixed(4)} POL`
              : health.checks.operatorBalance.message
          }
        />
        <HealthCheckRow
          label="Trading Status"
          healthy={health.checks.moduleNotPaused.healthy}
          message={
            health.checks.moduleNotPaused.healthy
              ? 'Active'
              : 'Paused'
          }
        />
        <HealthCheckRow
          label="Ownership"
          healthy={health.checks.operatorIsOwner.healthy}
          message={
            health.checks.operatorIsOwner.healthy
              ? 'Valid'
              : 'Mismatch'
          }
        />
      </div>

      <div className="text-xs text-muted-foreground">
        Last checked: {new Date(health.timestamp).toLocaleTimeString()}
      </div>
    </div>
  )
}

function HealthCheckRow({
  label,
  healthy,
  message,
}: {
  label: string
  healthy: boolean
  message?: string
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
        {healthy ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-600" />
        )}
      </div>
    </div>
  )
}
