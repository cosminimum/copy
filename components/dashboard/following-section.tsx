'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Plus } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AddTraderDialog } from './add-trader-dialog'

interface Following {
  trader: {
    walletAddress: string
    name: string | null
    profileImage: string | null
  }
  performance: {
    totalTrades: number
    totalVolume: number
    totalPnL: number
    winRate: number
  }
  settings: {
    positionSizeValue: number
    maxPositionSize: number | null
    minTradeSize: number | null
  } | null
}

export function FollowingSection() {
  const [following, setFollowing] = useState<Following[]>([])
  const [loading, setLoading] = useState(true)
  const [unfollowingWallet, setUnfollowingWallet] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [traderToUnfollow, setTraderToUnfollow] = useState<Following | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadFollowing()
  }, [])

  const loadFollowing = async () => {
    try {
      const response = await fetch('/api/following')
      const data = await response.json()
      setFollowing(data.following || [])
    } catch (error) {
      console.error('Error loading following:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUnfollowClick = (trader: Following) => {
    setTraderToUnfollow(trader)
    setShowConfirmDialog(true)
  }

  const handleUnfollow = async () => {
    if (!traderToUnfollow) return

    setUnfollowingWallet(traderToUnfollow.trader.walletAddress)
    setShowConfirmDialog(false)

    try {
      const response = await fetch(`/api/subscriptions?walletAddress=${traderToUnfollow.trader.walletAddress}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to unfollow trader')
      }

      toast({
        title: 'Unfollowed',
        description: `You've stopped copying ${traderToUnfollow.trader.name || 'this trader'}`,
      })

      await loadFollowing()
    } catch (error) {
      console.error('Error unfollowing trader:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to unfollow trader. Please try again.',
      })
    } finally {
      setUnfollowingWallet(null)
      setTraderToUnfollow(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Following</CardTitle>
          <CardDescription>Traders you're copying</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-4">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  if (following.length === 0) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Following</CardTitle>
            <CardDescription>Traders you're copying</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                You're not following any traders yet
              </p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Trader
              </Button>
            </div>
          </CardContent>
        </Card>
        <AddTraderDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onSuccess={loadFollowing}
        />
      </>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Following ({following.length})</CardTitle>
              <CardDescription>Performance of traders you're copying</CardDescription>
            </div>
            <Button onClick={() => setShowAddDialog(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Trader
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {following.map((item) => (
              <div
                key={item.trader.walletAddress}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <img
                    src={item.trader.profileImage || `https://api.dicebear.com/7.x/identicon/svg?seed=${item.trader.walletAddress}`}
                    alt={item.trader.name || 'Trader'}
                    className="w-12 h-12 rounded-full flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-semibold truncate">
                          {item.trader.name || `${item.trader.walletAddress.slice(0, 6)}...${item.trader.walletAddress.slice(-4)}`}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {item.trader.walletAddress.slice(0, 6)}...
                          {item.trader.walletAddress.slice(-4)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {item.settings && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Multiplier</p>
                            <p className="font-semibold">{item.settings.positionSizeValue}x</p>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnfollowClick(item)}
                          disabled={unfollowingWallet === item.trader.walletAddress}
                        >
                          {unfollowingWallet === item.trader.walletAddress ? 'Unfollowing...' : 'Unfollow'}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Trades Copied</p>
                        <p className="font-semibold">{item.performance.totalTrades}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Volume</p>
                        <p className="font-semibold">
                          ${item.performance.totalVolume.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">P&L</p>
                        <p
                          className={`font-semibold ${
                            item.performance.totalPnL >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {item.performance.totalPnL >= 0 ? '+' : ''}$
                          {item.performance.totalPnL.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Win Rate</p>
                        <p className="font-semibold">
                          {(item.performance.winRate * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop copying this trader?</AlertDialogTitle>
            <AlertDialogDescription>
              You will unfollow{' '}
              <span className="font-semibold">
                {traderToUnfollow?.trader.name || 'this trader'}
              </span>{' '}
              and stop copying their trades. Your existing positions will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnfollow}>
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddTraderDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={loadFollowing}
      />
    </>
  )
}
