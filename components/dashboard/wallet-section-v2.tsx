'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ExternalLink, Wallet, Copy, CheckCircle2, AlertCircle, Shield, Key, Lock } from 'lucide-react'
import { useAccount } from 'wagmi'

interface WalletInfo {
  safeAddress: string | null
  safeStatus: 'deployed' | 'deploying' | 'not_deployed'
  balance: number
  nativeUsdcBalance?: number
  hasWrongToken?: boolean
  usdcEAddress?: string
  nativeUsdcAddress?: string
  network: string
  chainId: number
}

interface SecurityStatus {
  ready: boolean
  message: string
  steps: {
    safeDeployed: boolean
    operatorConfigured: boolean
    credentialsCreated: boolean
    tokensApproved: boolean
    guardSet: boolean
    withdrawalModuleEnabled: boolean
  }
  details?: {
    operatorAddress?: string
    approvals?: any
    security?: any
  }
}

export function WalletSectionV2() {
  const { address: walletAddress, isConnected } = useAccount()
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [setupProgress, setSetupProgress] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fundingInstructions, setFundingInstructions] = useState<any>(null)

  useEffect(() => {
    fetchWalletInfo()
  }, [])

  useEffect(() => {
    if (walletInfo?.safeStatus === 'deployed' && walletInfo.safeAddress) {
      fetchSecurityStatus()
    }
  }, [walletInfo?.safeStatus, walletInfo?.safeAddress])

  // Auto-refresh balance every 10 seconds when Safe is deployed but setup not complete
  useEffect(() => {
    if (walletInfo?.safeStatus === 'deployed' && !securityStatus?.ready) {
      const interval = setInterval(() => {
        fetchWalletInfo()
        fetchSecurityStatus()
      }, 10000) // 10 seconds

      return () => clearInterval(interval)
    }
  }, [walletInfo?.safeStatus, securityStatus?.ready])

  const fetchWalletInfo = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/wallet/deposit')
      if (response.ok) {
        const data = await response.json()
        setWalletInfo(data)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch wallet info')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch wallet info')
    } finally {
      setLoading(false)
    }
  }

  const fetchSecurityStatus = async () => {
    try {
      const response = await fetch('/api/wallet/security-status')
      if (response.ok) {
        const data = await response.json()
        setSecurityStatus(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch security status:', err)
    }
  }

  const deploySafe = async () => {
    try {
      setDeploying(true)
      setError(null)

      const response = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useGasless: true }),
      })

      const data = await response.json()

      if (response.ok) {
        await fetchWalletInfo()
      } else {
        const errorMsg = data.error || 'Failed to deploy Safe'
        const details = data.details ? `\n\n${data.details}` : ''
        const support = data.supportInfo ? `\n\n${data.supportInfo}` : ''
        setError(errorMsg + details + support)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to deploy Safe')
    } finally {
      setDeploying(false)
    }
  }

  const completeSetup = async () => {
    try {
      setSettingUp(true)
      setError(null)
      setSetupProgress('Starting setup...')

      console.log('[CompleteSetup] Starting automated setup...')

      // Step 1: Derive operator & create credentials
      setSetupProgress('Step 1/5: Creating operator credentials...')
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 2: Approve tokens
      setSetupProgress('Step 2/5: Approving tokens to exchanges...')

      const response = await fetch('/api/wallet/complete-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok) {
        // Check if it's a funding issue
        if (data.errorCode === 'OPERATOR_NEEDS_FUNDING' && data.fundingInstructions) {
          setFundingInstructions(data.fundingInstructions)
          setError(data.error || 'Setup failed')
        } else {
          setError(data.error || 'Setup failed')
        }
        setSettingUp(false)
        setSetupProgress('')
        return
      }

      setSetupProgress('Step 3/5: Configuring security (guard + module)...')
      await new Promise(resolve => setTimeout(resolve, 500))

      setSetupProgress('Step 4/5: Updating CLOB balance...')
      await new Promise(resolve => setTimeout(resolve, 500))

      setSetupProgress('Step 5/5: Verifying setup...')
      await new Promise(resolve => setTimeout(resolve, 500))

      console.log('[CompleteSetup] ✅ Setup complete:', data)

      setSetupProgress('✅ Setup complete!')

      // Refresh security status
      await new Promise(resolve => setTimeout(resolve, 1000))
      await fetchSecurityStatus()

      setSettingUp(false)
      setSetupProgress('')
    } catch (err: any) {
      console.error('[CompleteSetup] Error:', err)
      setError(err.message || 'Failed to complete setup')
      setSettingUp(false)
      setSetupProgress('')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Trading Wallet
          </CardTitle>
          <CardDescription>Loading wallet information...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error && !walletInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Trading Wallet
          </CardTitle>
          <CardDescription className="text-red-600">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Trading Wallet (Gnosis Safe)
        </CardTitle>
        <CardDescription>
          Non-custodial copy trading with SignatureType 2 on {walletInfo?.network}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Stepper */}
        <div className="flex items-center justify-between mb-6">
          {/* Step 1: Deploy Safe */}
          <div className="flex-1 flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                walletInfo?.safeStatus === 'deployed'
                  ? 'bg-green-600 text-white'
                  : walletInfo?.safeStatus === 'deploying'
                  ? 'bg-blue-600 text-white animate-pulse'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {walletInfo?.safeStatus === 'deployed' ? '✓' : '1'}
            </div>
            <div className="ml-2 text-xs">
              <div className="font-medium">Deploy Safe</div>
            </div>
          </div>

          {/* Connector */}
          <div
            className={`h-0.5 w-12 ${
              walletInfo?.safeStatus === 'deployed' ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
            }`}
          />

          {/* Step 2: Deposit */}
          <div className="flex-1 flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                walletInfo?.balance && walletInfo.balance > 0
                  ? 'bg-green-600 text-white'
                  : walletInfo?.safeStatus === 'deployed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {walletInfo?.balance && walletInfo.balance > 0 ? '✓' : '2'}
            </div>
            <div className="ml-2 text-xs">
              <div className="font-medium">Deposit</div>
            </div>
          </div>

          {/* Connector */}
          <div
            className={`h-0.5 w-12 ${
              walletInfo?.balance && walletInfo.balance > 0 ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
            }`}
          />

          {/* Step 3: Setup */}
          <div className="flex-1 flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                securityStatus?.ready
                  ? 'bg-green-600 text-white'
                  : settingUp
                  ? 'bg-blue-600 text-white animate-pulse'
                  : walletInfo?.balance && walletInfo.balance > 0
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {securityStatus?.ready ? '✓' : '3'}
            </div>
            <div className="ml-2 text-xs">
              <div className="font-medium">Setup</div>
            </div>
          </div>

          {/* Connector */}
          <div
            className={`h-0.5 w-12 ${
              securityStatus?.ready ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
            }`}
          />

          {/* Step 4: Trade */}
          <div className="flex-1 flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                securityStatus?.ready
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {securityStatus?.ready ? '✓' : '4'}
            </div>
            <div className="ml-2 text-xs">
              <div className="font-medium">Trade</div>
            </div>
          </div>
        </div>

        {/* Safe Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          <Badge
            variant={
              walletInfo?.safeStatus === 'deployed'
                ? 'default'
                : walletInfo?.safeStatus === 'deploying'
                ? 'outline'
                : 'secondary'
            }
          >
            {walletInfo?.safeStatus === 'deployed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {walletInfo?.safeStatus === 'deploying' && <AlertCircle className="h-3 w-3 mr-1" />}
            {walletInfo?.safeStatus?.toUpperCase().replace('_', ' ')}
          </Badge>
        </div>

        {/* Not Deployed - Show Deploy Button */}
        {walletInfo?.safeStatus === 'not_deployed' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100 mb-3 flex items-center">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                <strong>Deploy Your Safe Wallet</strong>
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                Your trading wallet is a Gnosis Safe that uses SignatureType 2 for automated trading.
              </p>
              <div className="bg-white dark:bg-gray-900 border border-blue-300 dark:border-blue-700 rounded p-3 mb-3">
                <p className="text-xs text-blue-900 dark:text-blue-100 mb-2">
                  <strong>🔑 How It Works:</strong>
                </p>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-2">
                  <li>
                    <strong>Operator Wallet:</strong> A unique operator wallet (derived from your address) will own the Safe and sign trades automatically
                  </li>
                  <li>
                    <strong>Your Funds:</strong> You deposit USDC.e to the Safe address - funds stay in the Safe
                  </li>
                  <li>
                    <strong>Security:</strong> Operator can ONLY trade on Polymarket (enforced by smart contract guard)
                  </li>
                  <li>
                    <strong>Your Control:</strong> You can withdraw anytime using your wallet - works even if platform is offline
                  </li>
                </ul>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 italic">
                💡 Think of it like a valet key for your car - it can drive (trade) but can't access the trunk (your withdrawal rights).
              </p>
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-2 mt-2">
                <p className="text-xs text-green-900 dark:text-green-100">
                  ✅ <strong>Free deployment</strong> via Polymarket Relayer (no gas fees!)
                </p>
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full" disabled={deploying}>
                  {deploying ? 'Deploying...' : '🚀 Deploy Safe Wallet (Free)'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deploy Gnosis Safe?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a Gnosis Safe wallet on Polygon using Polymarket's Relayer (gasless deployment).
                    <br />
                    <br />
                    After deployment, the system will automatically:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Derive your unique operator wallet</li>
                      <li>Create CLOB API credentials</li>
                      <li>Set up security (guard + withdrawal module)</li>
                    </ul>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deploySafe}>Deploy Safe</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-900 dark:text-red-100 whitespace-pre-line">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Deploying Status */}
        {walletInfo?.safeStatus === 'deploying' && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-900 dark:text-yellow-100">
              🔄 Your Safe is being deployed via Polymarket Relayer...
              <br />
              This usually takes 1-2 minutes. Refresh to check status.
            </p>
          </div>
        )}

        {/* Deployed - Show Safe Info and Setup Status */}
        {walletInfo?.safeStatus === 'deployed' && walletInfo.safeAddress && (
          <>
            {/* Safe Address */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Safe Address:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(walletInfo.safeAddress!)}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="bg-muted p-3 rounded-lg font-mono text-sm break-all">
                {walletInfo.safeAddress}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  window.open(`https://app.safe.global/home?safe=matic:${walletInfo.safeAddress}`, '_blank')
                }
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Safe App
              </Button>
            </div>

            {/* Security Setup Status */}
            {securityStatus && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Setup Status:</span>
                  <Badge variant={securityStatus.ready ? 'default' : 'secondary'}>
                    {securityStatus.ready ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Ready to Trade
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Setup Required
                      </>
                    )}
                  </Badge>
                </div>

                {/* Setup Steps Progress */}
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium mb-3">Setup Checklist:</p>

                  {/* Step 1: Safe Deployed */}
                  <div className="flex items-center gap-2 text-sm">
                    {securityStatus.steps.safeDeployed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span>Safe Wallet Deployed</span>
                  </div>

                  {/* Step 2: Operator Configured */}
                  <div className="flex items-center gap-2 text-sm">
                    {securityStatus.steps.operatorConfigured ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span>
                      <Key className="h-3 w-3 inline mr-1" />
                      Operator Wallet Configured
                    </span>
                  </div>

                  {/* Step 3: CLOB Credentials */}
                  <div className="flex items-center gap-2 text-sm">
                    {securityStatus.steps.credentialsCreated ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span>CLOB API Credentials Created</span>
                  </div>

                  {/* Step 4: Token Approvals */}
                  <div className="flex items-center gap-2 text-sm">
                    {securityStatus.steps.tokensApproved ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span>Tokens Approved to Exchanges</span>
                  </div>

                  {/* Step 5: Guard Set */}
                  <div className="flex items-center gap-2 text-sm">
                    {securityStatus.steps.guardSet ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span>
                      <Shield className="h-3 w-3 inline mr-1" />
                      Trade Guard Enabled
                    </span>
                  </div>

                  {/* Step 6: Withdrawal Module */}
                  <div className="flex items-center gap-2 text-sm">
                    {securityStatus.steps.withdrawalModuleEnabled ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span>
                      <Lock className="h-3 w-3 inline mr-1" />
                      Withdrawal Module Enabled
                    </span>
                  </div>
                </div>

                {/* Setup Instructions */}
                {!securityStatus.ready && (
                  <div className="space-y-3">
                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <p className="text-sm text-yellow-900 dark:text-yellow-100 mb-3 flex items-center">
                        <span className="bg-yellow-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">3</span>
                        <strong>Complete Automated Setup</strong>
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-3">
                        Click the button below to automatically configure:
                      </p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside mb-3">
                        <li>✓ Derive operator wallet & create CLOB API credentials</li>
                        <li>✓ Approve tokens (4 approvals: USDC.e + CT to CTF & Neg Risk)</li>
                        <li>✓ Configure PolymarketTradeGuard (restricts operator to Polymarket only)</li>
                        <li>✓ Enable UserWithdrawalModule (you can withdraw anytime)</li>
                        <li>✓ Synchronize CLOB balance</li>
                      </ul>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 italic">
                        Note: This process takes 60-90 seconds and executes 6 on-chain transactions (~$0.02 gas).
                      </p>
                    </div>

                    {/* Complete Setup Button */}
                    <Button
                      className="w-full"
                      onClick={completeSetup}
                      disabled={settingUp}
                      size="lg"
                    >
                      {settingUp ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          {setupProgress || 'Setting up...'}
                        </>
                      ) : (
                        <>
                          <Shield className="h-4 w-4 mr-2" />
                          Complete Automated Setup
                        </>
                      )}
                    </Button>

                    {/* Error Display */}
                    {error && (
                      <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                        <p className="text-xs text-red-900 dark:text-red-100 flex items-start mb-2">
                          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                          <span>{error}</span>
                        </p>

                        {/* Funding Instructions */}
                        {fundingInstructions && (
                          <div className="mt-3 p-3 bg-white dark:bg-gray-900 border border-red-300 dark:border-red-700 rounded">
                            <p className="text-xs font-medium text-red-900 dark:text-red-100 mb-2">
                              📋 Operator Funding Required:
                            </p>
                            <div className="space-y-2">
                              <div>
                                <p className="text-[10px] text-red-700 dark:text-red-300 mb-1">
                                  Send POL to operator address:
                                </p>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] break-all bg-black text-green-400 p-2 rounded flex-1">
                                    {fundingInstructions.operatorAddress}
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(fundingInstructions.operatorAddress)}
                                  >
                                    {copied ? '✅' : '📋'}
                                  </Button>
                                </div>
                              </div>
                              <div className="text-[10px] text-red-700 dark:text-red-300">
                                <strong>Amount needed:</strong>
                                <ul className="list-disc list-inside ml-2 mt-1">
                                  <li>Minimum: {fundingInstructions.minimumPOL}</li>
                                  <li>Recommended: {fundingInstructions.recommendedPOL}</li>
                                </ul>
                              </div>
                              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-300 dark:border-yellow-700 rounded p-2 mt-2">
                                <p className="text-[10px] text-yellow-900 dark:text-yellow-100">
                                  💡 <strong>Note:</strong> This is a one-time cost. The operator wallet (derived from your address) needs POL to pay gas fees for setting up token approvals. After funding, click the setup button again.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Alternative: Manual Setup */}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Advanced: Manual Setup via Terminal
                      </summary>
                      <div className="mt-2 p-3 bg-muted rounded">
                        <p className="text-xs mb-2">If automated setup fails, run this command:</p>
                        <code className="block p-2 bg-black text-green-400 rounded text-[10px] overflow-x-auto">
                          npx ts-node scripts/onboard-user-complete.ts {walletAddress}
                        </code>
                      </div>
                    </details>
                  </div>
                )}

                {/* Ready to Trade */}
                {securityStatus.ready && (
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-sm text-green-900 dark:text-green-100 mb-2 flex items-center">
                      <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">✓</span>
                      <strong>All Systems Ready!</strong>
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                      Your Safe is configured with SignatureType 2 architecture. You can now:
                    </p>
                    <ul className="text-xs text-green-700 dark:text-green-300 space-y-1 list-disc list-inside mt-2">
                      <li>Follow traders and copy their trades automatically</li>
                      <li>Withdraw funds anytime via UserWithdrawalModule</li>
                      <li>All operations are secured by PolymarketTradeGuard</li>
                    </ul>
                  </div>
                )}

                {/* Technical Details */}
                {securityStatus.details && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Technical Details & Security Info
                    </summary>
                    <div className="mt-2 p-3 bg-muted rounded space-y-3">
                      {securityStatus.details.operatorAddress && (
                        <div>
                          <p className="font-medium mb-1">Operator Address (Safe Owner):</p>
                          <code className="text-[10px] break-all block bg-black text-green-400 p-2 rounded">
                            {securityStatus.details.operatorAddress}
                          </code>
                          <p className="text-[10px] text-muted-foreground mt-1 italic">
                            This operator wallet owns your Safe and signs trades. It's derived deterministically from your wallet address.
                          </p>
                        </div>
                      )}
                      {securityStatus.details.operatorAddress && (
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-2">
                          <p className="text-[10px] text-blue-900 dark:text-blue-100">
                            <strong>🔒 Security Model:</strong>
                          </p>
                          <ul className="text-[10px] text-blue-700 dark:text-blue-300 mt-1 space-y-0.5">
                            <li>• Operator CAN: Sign Polymarket orders, approve tokens</li>
                            <li>• Operator CANNOT: Transfer funds elsewhere (guard restricts)</li>
                            <li>• You CAN: Withdraw anytime via UserWithdrawalModule</li>
                          </ul>
                        </div>
                      )}
                      {securityStatus.details.approvals && (
                        <div>
                          <p className="font-medium mb-1">Token Approvals:</p>
                          <ul className="text-[10px] space-y-0.5">
                            <li>
                              USDC.e → CTF Exchange:{' '}
                              {securityStatus.details.approvals.usdcToCTF ? '✅' : '❌'}
                            </li>
                            <li>
                              USDC.e → Neg Risk Exchange:{' '}
                              {securityStatus.details.approvals.usdcToNegRisk ? '✅' : '❌'}
                            </li>
                            <li>
                              CT → CTF Exchange: {securityStatus.details.approvals.ctToCTF ? '✅' : '❌'}
                            </li>
                            <li>
                              CT → Neg Risk Exchange:{' '}
                              {securityStatus.details.approvals.ctToNegRisk ? '✅' : '❌'}
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Balance Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">USDC.e Balance:</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">${walletInfo.balance.toFixed(2)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchWalletInfo}
                    disabled={loading}
                  >
                    🔄
                  </Button>
                </div>
              </div>

              {/* Wrong Token Warning */}
              {walletInfo.hasWrongToken && (
                <div className="bg-red-50 dark:bg-red-950 border-2 border-red-500 dark:border-red-600 rounded-lg p-4">
                  <p className="text-sm text-red-900 dark:text-red-100 mb-2 flex items-center font-bold">
                    <AlertCircle className="h-5 w-5 mr-2" />
                    ⚠️ Wrong Token Detected!
                  </p>
                  <p className="text-xs text-red-800 dark:text-red-200 mb-3">
                    You sent <strong>native USDC</strong> (${walletInfo.nativeUsdcBalance?.toFixed(2)}) but Polymarket requires <strong>USDC.e</strong> (bridged USDC).
                  </p>
                  <div className="bg-white dark:bg-gray-900 border border-red-400 rounded p-3 space-y-2">
                    <p className="text-xs text-red-900 dark:text-red-100 font-medium">
                      To fix this:
                    </p>
                    <ol className="text-xs text-red-800 dark:text-red-200 space-y-1 list-decimal list-inside">
                      <li>Go to <a href="https://quickswap.exchange/" target="_blank" className="underline">QuickSwap</a></li>
                      <li>Connect your Safe wallet (use Safe App or WalletConnect)</li>
                      <li>Swap native USDC → USDC.e (0x2791...)</li>
                      <li>Come back here - balance will update automatically</li>
                    </ol>
                  </div>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-2 italic">
                    💡 Or send USDC.e directly from an exchange that supports Polygon withdrawals.
                  </p>
                </div>
              )}

              {/* Deposit Instructions */}
              {walletInfo.balance === 0 && !securityStatus?.ready && !walletInfo.hasWrongToken && (
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100 mb-3 flex items-center">
                    <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                    <strong>Deposit USDC.e to Your Safe</strong>
                  </p>

                  {/* CRITICAL WARNING BANNER */}
                  <div className="bg-red-50 dark:bg-red-950 border-2 border-red-400 dark:border-red-600 rounded-lg p-3 mb-3">
                    <p className="text-xs text-red-900 dark:text-red-100 font-bold mb-2">
                      ⚠️ CRITICAL: You MUST send USDC.e (Bridged USDC), NOT native USDC!
                    </p>
                    <div className="space-y-1 text-[10px] text-red-800 dark:text-red-200">
                      <p>✅ <strong>CORRECT:</strong> USDC.e - <code className="bg-red-200 dark:bg-red-900 px-1 rounded">0x2791...4174</code></p>
                      <p>❌ <strong>WRONG:</strong> Native USDC - <code className="bg-red-200 dark:bg-red-900 px-1 rounded">0x3c49...3359</code></p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white dark:bg-gray-900 border border-blue-300 dark:border-blue-700 rounded p-3">
                      <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                        <strong>Send USDC.e on Polygon Network to:</strong>
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] break-all bg-blue-100 dark:bg-blue-900 p-2 rounded flex-1">
                          {walletInfo.safeAddress}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(walletInfo.safeAddress!)}
                        >
                          {copied ? '✅' : '📋'}
                        </Button>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          <strong>Token Contract:</strong>
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="text-[10px] break-all bg-green-100 dark:bg-green-900 p-2 rounded flex-1 font-bold">
                            0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')}
                          >
                            {copied ? '✅' : '📋'}
                          </Button>
                        </div>
                        <p className="text-[10px] text-blue-500 dark:text-blue-400">
                          This is USDC.e (Bridged USDC) - the ONLY token Polymarket accepts
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        <strong>Where to get USDC.e:</strong>
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        <a
                          href="https://wallet.polygon.technology/polygon/bridge"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 bg-white dark:bg-gray-900 p-2 rounded border border-blue-200"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Bridge from Ethereum (Official Polygon Bridge)
                        </a>
                        <a
                          href="https://quickswap.exchange/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 bg-white dark:bg-gray-900 p-2 rounded border border-blue-200"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Swap on QuickSwap (Polygon DEX)
                        </a>
                      </div>
                    </div>

                    <p className="text-xs text-blue-600 dark:text-blue-400 italic">
                      ⏱️ Auto-refreshing every 10 seconds to detect deposit...
                    </p>
                  </div>
                </div>
              )}

              {/* Setup Ready - Show Button */}
              {walletInfo.balance > 0 && !securityStatus?.ready && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-xs text-green-900 dark:text-green-100 flex items-center">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    <strong>USDC.e detected! You can now complete setup.</strong>
                  </p>
                </div>
              )}

              {/* Ready to Trade - Balance Info */}
              {securityStatus?.ready && walletInfo.balance === 0 && (
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    💡 <strong>Deposit USDC.e</strong> to start copy trading.
                    <br />
                    Send USDC.e on Polygon to your Safe address above.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
