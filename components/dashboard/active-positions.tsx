'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRealtimePrices } from '@/hooks/use-realtime-prices'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

interface Position {
  id: string
  market: string
  side: string
  outcome: string
  size: number
  entryPrice: number
  currentPrice?: number
  unrealizedPnL: number
  status: string
}

interface CloseEstimate {
  positionId: string
  market: string
  outcome: string
  side: string
  size: number
  entryPrice: number
  currentPrice: number
  entryValue: number
  currentValue: number
  unrealizedPnL: number
  estimatedProfit: number
  estimatedPerformanceFee: number
  estimatedNetProceeds: number
  canClose: boolean
}

async function fetchPositions(): Promise<Position[]> {
  const response = await fetch('/api/dashboard/positions')
  if (!response.ok) {
    throw new Error('Failed to fetch positions')
  }
  const data = await response.json()
  return data.positions || []
}

async function fetchCloseEstimate(positionId: string): Promise<CloseEstimate> {
  const response = await fetch(`/api/positions/${positionId}/close`)
  if (!response.ok) {
    throw new Error('Failed to fetch close estimate')
  }
  return response.json()
}

async function closePosition(positionId: string): Promise<any> {
  const response = await fetch(`/api/positions/${positionId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to close position')
  }
  return response.json()
}

export function ActivePositions() {
  const { status } = useSession()
  const queryClient = useQueryClient()
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [showCloseDialog, setShowCloseDialog] = useState(false)

  // Connect to real-time price updates
  const { connected: pricesConnected } = useRealtimePrices()

  const { data: positions = [], isLoading: loading } = useQuery({
    queryKey: ['positions'],
    queryFn: fetchPositions,
    enabled: status === 'authenticated',
    // No polling needed - real-time updates via SSE
    refetchInterval: false,
    staleTime: Infinity,
  })

  const { data: closeEstimate, isLoading: loadingEstimate } = useQuery({
    queryKey: ['closeEstimate', selectedPosition?.id],
    queryFn: () => fetchCloseEstimate(selectedPosition!.id),
    enabled: !!selectedPosition && showCloseDialog,
  })

  const closeMutation = useMutation({
    mutationFn: closePosition,
    onSuccess: (data) => {
      toast({
        title: 'Position Closed',
        description: `Successfully closed position with P&L: ${data.pnl >= 0 ? '+' : ''}$${data.pnl?.toFixed(2) || '0.00'}`,
      })
      setShowCloseDialog(false)
      setSelectedPosition(null)
      // Invalidate all relevant queries to refresh the entire dashboard
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['trades'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      queryClient.invalidateQueries({ queryKey: ['following'] })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleCloseClick = (position: Position) => {
    setSelectedPosition(position)
    setShowCloseDialog(true)
  }

  const handleConfirmClose = () => {
    if (selectedPosition) {
      closeMutation.mutate(selectedPosition.id)
    }
  }

  const handleCancelClose = () => {
    setShowCloseDialog(false)
    setSelectedPosition(null)
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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Active Positions
            {pricesConnected && (
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Live prices" />
            )}
          </CardTitle>
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
                  <div className="flex-1">
                    <div className="font-medium text-sm">{position.market}</div>
                    <div className="text-xs text-muted-foreground">
                      {position.side} • {position.outcome} • {position.size} shares
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Entry: ${position.entryPrice.toFixed(4)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-xs font-medium ${
                      position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCloseClick(position)}
                      className="h-7 text-xs"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Position</DialogTitle>
            <DialogDescription>
              Review the details before closing this position
            </DialogDescription>
          </DialogHeader>

          {loadingEstimate ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading estimate...
            </div>
          ) : closeEstimate ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">{closeEstimate.market}</div>
                <div className="text-xs text-muted-foreground">
                  {closeEstimate.side} • {closeEstimate.outcome} • {closeEstimate.size} shares
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Entry Price:</span>
                  <span>${closeEstimate.entryPrice.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Price:</span>
                  <span>${closeEstimate.currentPrice.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Entry Value:</span>
                  <span>${closeEstimate.entryValue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Value:</span>
                  <span>${closeEstimate.currentValue.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm font-medium">
                  <span>Unrealized P&L:</span>
                  <span className={closeEstimate.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {closeEstimate.unrealizedPnL >= 0 ? '+' : ''}${closeEstimate.unrealizedPnL.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Performance Fee (50%):</span>
                  <span>${closeEstimate.estimatedPerformanceFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>Estimated Net Proceeds:</span>
                  <span>${closeEstimate.estimatedNetProceeds.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Unable to load estimate
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelClose}
              disabled={closeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmClose}
              disabled={closeMutation.isPending || !closeEstimate}
            >
              {closeMutation.isPending ? 'Closing...' : 'Confirm Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
