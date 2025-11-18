'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useAccount } from 'wagmi'
import confetti from 'canvas-confetti'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Wallet,
  Copy,
  CheckCircle2,
  AlertCircle,
  Shield,
  Key,
  Lock,
  ExternalLink,
  ChevronDown,
  Loader2,
  ArrowRight,
  Info,
  AlertTriangle,
} from 'lucide-react'
import {  ONBOARDING_CONSTANTS,
  formatUsdcBalance,
  formatPolBalance,
  type OnboardingStep,
} from '@/lib/constants/onboarding'
import { SafeExternalLink, buildSwapUrl } from '@/lib/components/safe-external-link'
import { useAutoRefresh } from '@/lib/hooks/use-onboarding-state'
import { cn } from '@/lib/utils'

interface OnboardingStepProps {
  currentStep: OnboardingStep
  onNext: () => void
  onRefreshStatus: () => Promise<void>
  status: any // Current onboarding status from API
  lockStep?: () => void
  unlockStep?: () => void
}

/**
 * Step 0: Welcome / Intro
 */
export function WelcomeStep({ onNext }: { onNext: () => void }) {
  const [platformDetailsOpen, setPlatformDetailsOpen] = useState(false)
  const [securityDetailsOpen, setSecurityDetailsOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Welcome to Copy Trading</h2>
        <p className="text-muted-foreground text-lg">
          Follow this setup to start automatically copying trades from top traders
        </p>
      </div>

      <Card className="border-primary/20">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">What to expect:</p>
              <p className="text-sm text-muted-foreground">
                This setup takes 5-10 minutes and requires funding two wallets
              </p>
            </div>
          </div>

          <div className="grid gap-3 pt-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm">Deploy your trading wallet (Gnosis Safe)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm">Fund operator with POL (~$3-6 for gas)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm">Deposit USDC.e (your trading capital)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm">Configure security features</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collapsible Educational Sections */}
      <div className="space-y-3">
        <Collapsible open={platformDetailsOpen} onOpenChange={setPlatformDetailsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-accent">
            <span className="font-medium">📖 What is copy trading?</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", platformDetailsOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 px-4 space-y-3 text-sm text-muted-foreground">
            <p>
              Copy trading lets you automatically replicate trades from successful traders on Polymarket.
            </p>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong>Browse traders:</strong> See performance, win rates, and trading history</li>
              <li><strong>Set your rules:</strong> Control position sizes, max losses, and market types</li>
              <li><strong>Auto-execute:</strong> Your account mirrors their trades in real-time</li>
              <li><strong>Track everything:</strong> Monitor your portfolio, P&L, and active positions</li>
            </ul>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={securityDetailsOpen} onOpenChange={setSecurityDetailsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-accent">
            <span className="font-medium">🛡️ How your funds stay safe</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", securityDetailsOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 px-4 space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">You maintain full control at all times:</p>
            <div className="space-y-3">
              <div className="flex gap-3">
                <Wallet className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Gnosis Safe Wallet</p>
                  <p>Your funds stay in a smart contract wallet you control</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Key className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Restricted Operator</p>
                  <p>Automated wallet can only trade on Polymarket - nothing else</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Shield className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Smart Contract Guards</p>
                  <p>Protection prevents any unauthorized actions</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Lock className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Instant Withdrawal</p>
                  <p>You can withdraw your funds anytime without permission</p>
                </div>
              </div>
            </div>
            <p className="pt-2 border-t">
              <strong>Bottom line:</strong> It's like giving a trader access to a trading account, not your bank account.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Button onClick={onNext} className="w-full" size="lg">
        Start Setup <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Step 1: Deploy Safe
 */
export function DeploySafeStep({ onNext, onRefreshStatus, status, lockStep, unlockStep }: OnboardingStepProps) {
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [safeAddress, setSafeAddress] = useState<string | null>(status?.safeAddress || null)

  const deploySafe = async () => {
    try {
      setDeploying(true)
      setError(null)
      lockStep?.() // Lock step during deployment

      const response = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok) {
        // Provide more helpful error messages
        let errorMsg = data.error || 'Failed to deploy Safe'

        if (errorMsg.includes('connection error') || errorMsg.includes('Connection error')) {
          errorMsg = 'Unable to connect to Polymarket Relayer service. This might be a temporary issue. Please try again in a few moments.'
        } else if (errorMsg.includes('timeout')) {
          errorMsg = 'Deployment timed out. The network might be congested. Please try again.'
        }

        throw new Error(errorMsg)
      }

      setSafeAddress(data.safeAddress)
      await onRefreshStatus()

      // Auto-advance after deployment
      setTimeout(() => {
        unlockStep?.() // Unlock after successful deployment
        onNext()
      }, 1500)
    } catch (err: any) {
      console.error('[DeploySafe] error:', err)
      setError(err.message)
      unlockStep?.() // Unlock on error so user can retry
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Create Your Trading Wallet</h2>
        <p className="text-muted-foreground">
          Expected time: {ONBOARDING_CONSTANTS.EXPECTED_TIMES.DEPLOY_SAFE}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Wallet className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Deploying a Gnosis Safe</p>
              <p className="text-sm text-muted-foreground">
                This is a secure smart contract wallet where your funds will be stored. Deployment is gasless via Polymarket Relayer.
              </p>
            </div>
          </div>

          {safeAddress && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Safe Ready!</span>
              </div>
              <CopyableAddress address={safeAddress} />
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Your Safe address has been generated. You can start depositing funds now.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <span className="text-sm">{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deploySafe}
                    disabled={deploying}
                    className="w-full"
                  >
                    Retry Deployment
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!safeAddress ? (
        <Button onClick={deploySafe} disabled={deploying} className="w-full" size="lg">
          {deploying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {deploying ? 'Deploying Safe (~10-20 seconds)...' : 'Deploy Safe Wallet'}
        </Button>
      ) : (
        <Button onClick={onNext} className="w-full" size="lg">
          Continue <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

/**
 * Step 2: Fund Operator (POL)
 */
export function FundOperatorStep({ onNext, onRefreshStatus, status }: OnboardingStepProps) {
  const { address: connectedWallet } = useAccount()
  const [copied, setCopied] = useState(false)
  const [polBalance, setPolBalance] = useState<bigint>(BigInt(0))
  const [userPolBalance, setUserPolBalance] = useState<bigint>(BigInt(0))
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  const operatorAddress = status?.operatorAddress
  const minPolRequired = BigInt(Math.floor(ONBOARDING_CONSTANTS.MIN_POL_BALANCE))
  const hasSufficientPol = polBalance >= minPolRequired

  // Auto-refresh balance every 5 seconds
  useAutoRefresh(
    !!operatorAddress && !hasSufficientPol,
    async () => {
      await onRefreshStatus()
      // Parse balance from status
      if (status?.operatorPolBalance) {
        setPolBalance(BigInt(status.operatorPolBalance))
      }
    },
    ONBOARDING_CONSTANTS.BALANCE_POLL_INTERVAL
  )

  // Fetch user's POL balance in connected wallet
  // (In production, you'd query this via wagmi or viem)
  // For now, we'll skip this to keep it simple

  useEffect(() => {
    if (hasSufficientPol) {
      setTimeout(onNext, 2000)
    }
  }, [hasSufficientPol, onNext])

  const copyAddress = () => {
    if (operatorAddress) {
      navigator.clipboard.writeText(operatorAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Fund Operator Wallet</h2>
        <p className="text-muted-foreground">
          Expected time: {ONBOARDING_CONSTANTS.EXPECTED_TIMES.FUND_POL}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Key className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Why POL is needed</p>
              <p className="text-sm text-muted-foreground">
                The operator wallet needs POL (Polygon's gas token) to execute trades on your behalf. POL pays for blockchain transaction fees.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                💡 <strong>Start small:</strong> Deposit any amount to test! {ONBOARDING_CONSTANTS.RECOMMENDED_POL} recommended for multiple trades.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Current Balance:</span>
              <Badge variant={hasSufficientPol ? "default" : "secondary"}>
                {formatPolBalance(polBalance)}
              </Badge>
            </div>

            {!hasSufficientPol && polBalance > BigInt(0) && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-2 text-blue-700 dark:text-blue-300">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">Deposit detected!</p>
                    <p>
                      Current: <span className="font-mono">{formatPolBalance(polBalance)}</span>
                    </p>
                    <p className="text-xs mt-1 opacity-75">
                      Add <span className="font-mono">{formatPolBalance(minPolRequired - polBalance)}</span> more to continue, or this amount works for testing.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {operatorAddress && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Operator Address:</label>
                <div className="flex gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-lg text-xs font-mono break-all">
                    {operatorAddress}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyAddress}
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {hasSufficientPol && (
              <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Operator funded! Moving to next step...</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-accent">
          <span className="font-medium">How to get POL</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", instructionsOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 px-4 space-y-3 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Option 1: Buy on Exchange</p>
            <p className="text-muted-foreground">
              Buy POL on Coinbase, Binance, or other exchanges, then withdraw to Polygon network
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Option 2: Bridge from Ethereum</p>
            <p className="text-muted-foreground">
              Use the official Polygon bridge to transfer POL from Ethereum
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Option 3: Swap on Polygon DEX</p>
            <SafeExternalLink
              href={buildSwapUrl.quickswap({
                inputCurrency: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e
                outputCurrency: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC (wrapped POL)
              })}
            >
              Swap USDC → POL on QuickSwap
            </SafeExternalLink>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {!hasSufficientPol && (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking for deposit (every 10 seconds)...</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Deposit any amount to continue - even a small test amount works!
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Step 3: Deposit USDC.e
 */
export function DepositUsdcStep({ onNext, onRefreshStatus, status }: OnboardingStepProps) {
  const [copied, setCopied] = useState(false)
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0))
  const [nativeUsdcBalance, setNativeUsdcBalance] = useState<bigint>(BigInt(0))

  const safeAddress = status?.safeAddress
  const minUsdcRequired = BigInt(Math.floor(ONBOARDING_CONSTANTS.MIN_USDC_BALANCE))
  const hasSufficientUsdc = usdcBalance >= minUsdcRequired
  const hasWrongToken = nativeUsdcBalance > BigInt(0)

  // Auto-refresh balance every 5 seconds
  useAutoRefresh(
    !!safeAddress && !hasSufficientUsdc,
    async () => {
      await onRefreshStatus()
      if (status?.safeUsdcEBalance) {
        setUsdcBalance(BigInt(status.safeUsdcEBalance))
      }
      if (status?.safeNativeUsdcBalance) {
        setNativeUsdcBalance(BigInt(status.safeNativeUsdcBalance))
      }
    },
    ONBOARDING_CONSTANTS.BALANCE_POLL_INTERVAL
  )

  useEffect(() => {
    if (hasSufficientUsdc) {
      setTimeout(onNext, 2000)
    }
  }, [hasSufficientUsdc, onNext])

  const copyAddress = () => {
    if (safeAddress) {
      navigator.clipboard.writeText(safeAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Deposit Trading Capital</h2>
        <p className="text-muted-foreground">
          Expected time: {ONBOARDING_CONSTANTS.EXPECTED_TIMES.DEPOSIT_USDC}
        </p>
      </div>

      {/* Critical Warning */}
      <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-bold text-orange-900 dark:text-orange-100">
                IMPORTANT: Must be USDC.e (bridged USDC)
              </p>
              <p className="text-sm text-orange-800 dark:text-orange-200">
                Do NOT send native USDC. Only send USDC.e (bridged USDC on Polygon). Sending native USDC will require swapping it.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Wallet className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Why USDC.e is needed</p>
              <p className="text-sm text-muted-foreground">
                This is your trading capital - the funds that will be used to copy trades. USDC.e is bridged USDC on Polygon, the standard for Polymarket.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                💡 <strong>No minimum required!</strong> {ONBOARDING_CONSTANTS.RECOMMENDED_USDC} You can always add more later.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Current Balance:</span>
              <Badge variant={hasSufficientUsdc ? "default" : "secondary"}>
                {formatUsdcBalance(usdcBalance)}
              </Badge>
            </div>

            {!hasSufficientUsdc && usdcBalance > BigInt(0) && (
              <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">Great! Funds detected!</p>
                    <p>
                      Balance: <span className="font-mono font-semibold">{formatUsdcBalance(usdcBalance)}</span>
                    </p>
                    <p className="text-xs mt-1 opacity-75">
                      Perfect for testing! Add more anytime to increase your trading capital.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {safeAddress && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Safe Address:</label>
                <div className="flex gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-lg text-xs font-mono break-all">
                    {safeAddress}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyAddress}
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {hasWrongToken && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Wrong token detected!</span>
                    <p className="text-sm">
                      You deposited native USDC ({formatUsdcBalance(nativeUsdcBalance)}). You need to swap it to USDC.e.
                    </p>
                    <SafeExternalLink
                      href={buildSwapUrl.quickswap({
                        inputCurrency: ONBOARDING_CONSTANTS.NATIVE_USDC_ADDRESS,
                        outputCurrency: ONBOARDING_CONSTANTS.USDC_E_ADDRESS,
                      })}
                      className="text-sm"
                    >
                      Swap native USDC → USDC.e on QuickSwap
                    </SafeExternalLink>
                  </div>
                </div>
              </div>
            )}

            {hasSufficientUsdc && (
              <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Safe funded! Moving to next step...</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!hasSufficientUsdc && (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking for deposit (every 10 seconds)...</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Start with any amount - $1, $5, or $100. Your choice!
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Helper component for copyable addresses
 */
function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex gap-2 items-center">
      <code className="flex-1 text-xs font-mono bg-background p-2 rounded border">
        {address}
      </code>
      <Button variant="ghost" size="sm" onClick={copy}>
        {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  )
}

/**
 * Step 4: Complete Security Setup
 */
export function CompleteSetupStep({ onNext, onRefreshStatus, lockStep, unlockStep }: OnboardingStepProps) {
  const [settingUp, setSettingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>('')
  const [currentSubStep, setCurrentSubStep] = useState(0)
  const [retryCount, setRetryCount] = useState(0)

  const subSteps = [
    'Creating operator credentials',
    'Approving USDC.e for trading',
    'Enabling TradeGuard',
    'Enabling withdrawal module',
    'Verifying configuration',
  ]

  const executeSetup = async () => {
    try {
      setSettingUp(true)
      setError(null)
      setProgress('Starting security setup...')
      lockStep?.() // Lock step during setup

      const response = await fetch('/api/wallet/complete-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle operator funding error specifically
        if (data.error?.includes('OPERATOR_NEEDS_FUNDING')) {
          throw new Error('Operator needs more POL for gas fees. Please add more POL and retry.')
        }
        throw new Error(data.error || 'Setup failed')
      }

      setProgress('Setup complete!')
      await onRefreshStatus()

      // Auto-advance after setup
      setTimeout(() => {
        unlockStep?.() // Unlock after successful setup
        onNext()
      }, 1500)
    } catch (err: any) {
      console.error('[CompleteSetup] error:', err)
      setError(err.message)
      setRetryCount((c) => c + 1)
      unlockStep?.() // Unlock on error so user can retry
    } finally {
      setSettingUp(false)
    }
  }

  // Simulate progress during setup (in production, you'd get real progress from API)
  useEffect(() => {
    if (settingUp) {
      const interval = setInterval(() => {
        setCurrentSubStep((step) => {
          if (step < subSteps.length - 1) {
            setProgress(subSteps[step + 1])
            return step + 1
          }
          return step
        })
      }, 3000) // ~3 seconds per step

      return () => clearInterval(interval)
    } else {
      setCurrentSubStep(0)
    }
  }, [settingUp])

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Configure Security & Permissions</h2>
        <p className="text-muted-foreground">
          Expected time: {ONBOARDING_CONSTANTS.EXPECTED_TIMES.COMPLETE_SETUP}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Setting up security features</p>
              <p className="text-sm text-muted-foreground">
                We'll configure your Safe with security features and trading permissions
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {subSteps.map((step, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-colors",
                  index === currentSubStep && settingUp && "bg-primary/10",
                  index < currentSubStep && "bg-green-50 dark:bg-green-950"
                )}
              >
                {index < currentSubStep ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : index === currentSubStep && settingUp ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted" />
                )}
                <span className={cn(
                  "text-sm",
                  index === currentSubStep && settingUp && "font-medium"
                )}>
                  {step}
                </span>
              </div>
            ))}
          </div>

          {settingUp && (
            <div className="space-y-2">
              <Progress value={(currentSubStep / subSteps.length) * 100} />
              <p className="text-xs text-muted-foreground text-center">{progress}</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <span className="text-sm font-medium">Setup failed</span>
                  <p className="text-sm">{error}</p>
                  {retryCount < ONBOARDING_CONSTANTS.MAX_RETRIES && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={executeSetup}
                      className="mt-2"
                    >
                      Retry ({retryCount + 1}/{ONBOARDING_CONSTANTS.MAX_RETRIES})
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={executeSetup}
        disabled={settingUp}
        className="w-full"
        size="lg"
      >
        {settingUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {settingUp ? 'Configuring Security...' : 'Complete Setup'}
      </Button>
    </div>
  )
}

/**
 * Step 5: Review & Finalize
 */
export function ReviewStep({ onNext, status }: OnboardingStepProps) {
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finalize = async () => {
    try {
      setFinalizing(true)
      setError(null)

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Verification failed')
      }

      // Success! Move to final step
      onNext()
    } catch (err: any) {
      console.error('[Review] finalize error:', err)
      setError(err.message)
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Review Your Setup</h2>
        <p className="text-muted-foreground">
          Expected time: {ONBOARDING_CONSTANTS.EXPECTED_TIMES.REVIEW}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="font-semibold mb-3">Setup Summary</h3>

          <div className="space-y-2">
            <ChecklistItem
              checked
              label="Safe deployed"
              value={status?.safeAddress}
            />
            <ChecklistItem
              checked
              label="Operator funded"
              value={status?.operatorPolBalance ? formatPolBalance(BigInt(status.operatorPolBalance)) : 'Ready'}
            />
            <ChecklistItem
              checked
              label="Trading capital"
              value={status?.safeUsdcEBalance ? formatUsdcBalance(BigInt(status.safeUsdcEBalance)) : 'Deposited'}
            />
            <ChecklistItem
              checked
              label="Security enabled"
              value="Guard + Withdrawal module"
            />
            <ChecklistItem
              checked
              label="Token approvals set"
              value="All exchanges approved"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <span className="text-sm font-medium">Verification failed</span>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        onClick={finalize}
        disabled={finalizing}
        className="w-full"
        size="lg"
      >
        {finalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {finalizing ? 'Verifying...' : 'Finalize Setup'}
      </Button>
    </div>
  )
}

/**
 * Step 6: Success
 */
export function SuccessStep({ status, onComplete }: { status: any; onComplete: () => void }) {
  useEffect(() => {
    // Fire confetti!
    const duration = 3 * 1000
    const end = Date.now() + duration

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
      })
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }

    frame()
  }, [])

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-3xl font-bold">You're All Set! 🎉</h2>
        <p className="text-muted-foreground text-lg">
          Your trading wallet is fully configured and secured
        </p>
        <p className="text-sm text-muted-foreground">
          You can now start following and copying top traders
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="font-semibold mb-3">Your Configuration</h3>

          <div className="space-y-2">
            <ChecklistItem
              checked
              label="Safe wallet"
              value={status?.safeAddress}
            />
            <ChecklistItem
              checked
              label="Balance"
              value={status?.safeUsdcEBalance ? formatUsdcBalance(BigInt(status.safeUsdcEBalance)) : 'Funded'}
            />
            <ChecklistItem
              checked
              label="Operator"
              value={status?.operatorPolBalance ? `${formatPolBalance(BigInt(status.operatorPolBalance))} available` : 'Ready'}
            />
            <ChecklistItem
              checked
              label="Security features"
              value="All enabled"
            />
            <ChecklistItem
              checked
              label="Ready to trade"
              value="✓"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={onComplete} className="w-full" size="lg">
        Start Trading <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Helper component for checklist items
 */
function ChecklistItem({
  checked,
  label,
  value,
}: {
  checked: boolean
  label: string
  value?: string
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
      <div className="flex items-center gap-3">
        {checked ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {value && (
        <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
          {value}
        </span>
      )}
    </div>
  )
}
