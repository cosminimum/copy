'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FollowingSection } from '@/components/dashboard/following-section'
import { PortfolioStats } from '@/components/dashboard/portfolio-stats'
import { RecentTrades } from '@/components/dashboard/recent-trades'
import { ActivePositions } from '@/components/dashboard/active-positions'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { OnboardingModal } from '@/components/onboarding/onboarding-modal'
import { Copy, CheckCircle2, ExternalLink } from 'lucide-react'

interface WalletInfo {
  safeAddress: string | null
  balance: number
}

export function DashboardContent() {
  const { data: session, status, update: updateSession } = useSession()
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [copied, setCopied] = useState(false)

  // Fetch wallet info when authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      fetchWalletInfo()
    }
  }, [status])

  const fetchWalletInfo = async () => {
    try {
      const response = await fetch('/api/wallet/deposit')
      if (response.ok) {
        const data = await response.json()
        setWalletInfo(data)
      }
    } catch (error) {
      console.error('Error fetching wallet info:', error)
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

  // Show loading state while checking session
  if (status === 'loading') {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-16">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Show welcome message if not authenticated
  if (status === 'unauthenticated' || !session?.user?.id) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-16">
          <h1 className="text-3xl font-bold mb-4">Welcome to Forecast Market</h1>
          <p className="text-muted-foreground mb-8">
            Connect your wallet to start following top traders and copying their trades automatically
          </p>
        </div>
      </div>
    )
  }

  // Check if user needs onboarding
  // @ts-ignore - onboardingCompletedAt may not be in session type yet
  const needsOnboarding = !session?.user?.onboardingCompletedAt

  // Show onboarding modal if user hasn't completed onboarding
  if (needsOnboarding) {
    return (
      <div className="container mx-auto px-4 py-8">
        <OnboardingModal
          onComplete={async () => {
            // Refetch session to update user object
            await updateSession()
          }}
        />
        {/* Show a subtle background message */}
        <div className="text-center py-16 opacity-30 pointer-events-none">
          <h1 className="text-3xl font-bold mb-4">Setting up your trading wallet...</h1>
          <p className="text-muted-foreground">
            Complete the setup to access your dashboard
          </p>
        </div>
      </div>
    )
  }

  // Show dashboard if authenticated and onboarded
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Monitor your copy trading activity</p>
        </div>

        {walletInfo?.safeAddress && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Balance</div>
              <div className="text-2xl font-bold">${walletInfo.balance.toFixed(2)}</div>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <div className="text-sm text-muted-foreground mb-1">Deposit to Safe Wallet</div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                  {truncateAddress(walletInfo.safeAddress)}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyAddress}
                  className="h-7 w-7 p-0"
                >
                  {copied ? (
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`https://app.safe.global/home?safe=matic:${walletInfo.safeAddress}`, '_blank')}
                  className="h-7 w-7 p-0"
                  title="Open in Safe App"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-8">
        <PortfolioStats />
      </div>

      <div className="grid grid-cols-1 gap-4 mb-8">
        <FollowingSection />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <RecentTrades />
        <ActivePositions />
      </div>

      <div className="mb-8">
        <ActivityFeed />
      </div>
    </div>
  )
}
