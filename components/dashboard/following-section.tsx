'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Plus, Copy, Settings, UserMinus } from 'lucide-react'
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
import { EditCopySettingsDialog } from './edit-copy-settings-dialog'

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

async function fetchFollowing(): Promise<Following[]> {
  const response = await fetch('/api/following')
  if (!response.ok) {
    throw new Error('Failed to fetch following')
  }
  const data = await response.json()
  return data.following || []
}

export function FollowingSection() {
  const { status } = useSession()
  const queryClient = useQueryClient()
  const [unfollowingWallet, setUnfollowingWallet] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [traderToUnfollow, setTraderToUnfollow] = useState<Following | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [traderToEdit, setTraderToEdit] = useState<Following | null>(null)
  const { toast } = useToast()

  const { data: following = [], isLoading: loading } = useQuery({
    queryKey: ['following'],
    queryFn: fetchFollowing,
    enabled: status === 'authenticated',
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
    staleTime: 30 * 1000,
  })

  const loadFollowing = () => {
    // Invalidate all relevant queries to refresh the entire dashboard
    queryClient.invalidateQueries({ queryKey: ['following'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    queryClient.invalidateQueries({ queryKey: ['positions'] })
    queryClient.invalidateQueries({ queryKey: ['trades'] })
    queryClient.invalidateQueries({ queryKey: ['activity'] })
  }

  const handleUnfollowClick = (trader: Following) => {
    setTraderToUnfollow(trader)
    setShowConfirmDialog(true)
  }

  const handleEditClick = (trader: Following) => {
    setTraderToEdit(trader)
    setShowEditDialog(true)
  }

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      toast({
        title: 'Copied',
        description: 'Address copied to clipboard',
      })
    } catch (error) {
      console.error('Error copying address:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to copy address',
      })
    }
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

      // Invalidate all relevant queries to refresh the entire dashboard
      queryClient.invalidateQueries({ queryKey: ['following'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['trades'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })

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
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Following</h2>
          <p className="text-muted-foreground">Traders you're copying</p>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (following.length === 0) {
    return (
      <>
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Following</h2>
            <p className="text-muted-foreground">Traders you're copying</p>
          </div>
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
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
        </div>
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
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Following ({following.length})</h2>
            <p className="text-muted-foreground">Traders you're copying</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Trader
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {following.map((item) => {
            const avgTradeSize = item.performance.totalTrades > 0
              ? item.performance.totalVolume / item.performance.totalTrades
              : 0
            const successRate = item.performance.totalTrades > 0
              ? (item.performance.winRate * 100).toFixed(1)
              : '0.0'

            return (
              <Card key={item.trader.walletAddress} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between mb-3">
                    <img
                      src={item.trader.profileImage || `https://api.dicebear.com/7.x/identicon/svg?seed=${item.trader.walletAddress}`}
                      alt={item.trader.name || 'Trader'}
                      className="w-12 h-12 rounded-full"
                    />
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(item)}
                        className="h-8 px-2 text-xs"
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnfollowClick(item)}
                        disabled={unfollowingWallet === item.trader.walletAddress}
                        className="h-8 px-2 text-xs"
                      >
                        <UserMinus className="h-3 w-3 mr-1" />
                        {unfollowingWallet === item.trader.walletAddress ? 'Unfollowing...' : 'Unfollow'}
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-base truncate">
                    <a
                      href={`https://polymarket.com/profile/${item.trader.walletAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {item.trader.name || `${item.trader.walletAddress.slice(0, 6)}...${item.trader.walletAddress.slice(-4)}`}
                    </a>
                  </CardTitle>
                  <CardDescription className="text-xs flex items-center gap-1">
                    <span>
                      {item.trader.walletAddress.slice(0, 8)}...{item.trader.walletAddress.slice(-6)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyAddress(item.trader.walletAddress)}
                      className="h-4 w-4 p-0 hover:bg-transparent"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* P&L - Most Important Metric */}
                  <div className="bg-accent/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
                    <p
                      className={`text-2xl font-bold ${
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

                  {/* Key Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Trades</p>
                      <p className="font-semibold">{item.performance.totalTrades}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Win Rate</p>
                      <p className="font-semibold">{successRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Volume</p>
                      <p className="font-semibold text-sm">
                        ${item.performance.totalVolume.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Trade</p>
                      <p className="font-semibold text-sm">
                        ${avgTradeSize.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Copy Settings */}
                  {item.settings && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Copy Settings</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Multiplier</p>
                          <p className="font-semibold">{item.settings.positionSizeValue}x</p>
                        </div>
                        {item.settings.maxPositionSize && (
                          <div>
                            <p className="text-muted-foreground">Max Size</p>
                            <p className="font-semibold">${item.settings.maxPositionSize}</p>
                          </div>
                        )}
                        {item.settings.minTradeSize && (
                          <div>
                            <p className="text-muted-foreground">Min Size</p>
                            <p className="font-semibold">${item.settings.minTradeSize}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

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

      {traderToEdit && (
        <EditCopySettingsDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          traderWalletAddress={traderToEdit.trader.walletAddress}
          traderName={traderToEdit.trader.name || `${traderToEdit.trader.walletAddress.slice(0, 6)}...${traderToEdit.trader.walletAddress.slice(-4)}`}
          onSuccess={loadFollowing}
        />
      )}
    </>
  )
}
