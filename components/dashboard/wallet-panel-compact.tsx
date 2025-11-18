'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Copy, CheckCircle2, ChevronDown, ExternalLink, Wallet } from 'lucide-react'
import { formatUsdcBalance, formatPolBalance } from '@/lib/constants/onboarding'
import { cn } from '@/lib/utils'

interface WalletInfo {
  safeAddress: string | null
  balance: number
  network: string
  chainId: number
  operatorAddress?: string
  operatorPolBalance?: string
  securityEnabled: boolean
}

/**
 * WalletPanelCompact - Compact wallet display for post-onboarding users
 *
 * Shown after onboarding is complete. Displays:
 * - Safe address and balance
 * - Deposit/Withdraw actions
 * - Collapsible security details
 */
export function WalletPanelCompact() {
  const { data: session } = useSession()
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Fetch wallet info
  useEffect(() => {
    fetchWalletInfo()
  }, [])

  const fetchWalletInfo = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/wallet/deposit')
      if (response.ok) {
        const data = await response.json()
        setWalletInfo(data)
      }
    } catch (error) {
      console.error('[WalletPanelCompact] Error fetching wallet info:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyAddress = () => {
    if (walletInfo?.safeAddress) {
      navigator.clipboard.writeText(walletInfo.safeAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trading Wallet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!walletInfo?.safeAddress) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Trading Wallet
          </CardTitle>
          <Badge variant="default" className="font-mono">
            {formatUsdcBalance(BigInt(walletInfo.balance * 1e6))}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Safe Address */}
        <div className="flex items-center justify-between gap-2">
          <code className="text-xs font-mono text-muted-foreground">
            {truncateAddress(walletInfo.safeAddress)}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyAddress}
          >
            {copied ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1">
            Deposit
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            Withdraw
          </Button>
        </div>

        {/* Collapsible Details */}
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors">
            <span className="text-sm font-medium">View Details</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                detailsOpen && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            {/* Operator Address */}
            {walletInfo.operatorAddress && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Operator:</label>
                <div className="flex items-center justify-between">
                  <code className="text-xs font-mono">
                    {truncateAddress(walletInfo.operatorAddress)}
                  </code>
                  {walletInfo.operatorPolBalance && (
                    <span className="text-xs text-muted-foreground">
                      {formatPolBalance(BigInt(walletInfo.operatorPolBalance))}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Security Status */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Security:</label>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                <span>Guard Enabled</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                <span>Withdrawal Module</span>
              </div>
            </div>

            {/* Advanced Settings Link */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between"
            >
              <span>Advanced Settings</span>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
