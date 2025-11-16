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
import { ExternalLink, Wallet, Copy, CheckCircle2, AlertCircle, Shield } from 'lucide-react'
import { useAccount, useSignTypedData, useSwitchChain } from 'wagmi'
import { polygon } from 'wagmi/chains'

interface WalletInfo {
  safeAddress: string | null
  safeStatus: 'deployed' | 'deploying' | 'not_deployed'
  balance: number
  usdcAddress: string
  network: string
  chainId: number
  instructions: {
    step1: string
    step2: string
    step3: string
  }
}

interface ModuleStatus {
  enabled: boolean
  moduleAddress?: string
  message?: string
}

interface SafeTransaction {
  to: string
  value: string
  data: string
  operation: number
  safeTxGas: string
  baseGas: string
  gasPrice: string
  gasToken: string
  refundReceiver: string
  nonce: number
}

export function WalletSection() {
  const { address: walletAddress, isConnected, chain } = useAccount()
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [enablingModule, setEnablingModule] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [checkingBalances, setCheckingBalances] = useState(false)

  // Wagmi hooks for signing typed data
  const { switchChain } = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()

  useEffect(() => {
    fetchWalletInfo()
  }, [])

  useEffect(() => {
    if (walletInfo?.safeStatus === 'deployed' && walletInfo.safeAddress) {
      fetchModuleStatus()
    }
  }, [walletInfo?.safeStatus, walletInfo?.safeAddress])

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

  const fetchModuleStatus = async () => {
    try {
      const response = await fetch('/api/wallet/enable-module')
      if (response.ok) {
        const data = await response.json()
        setModuleStatus(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch module status:', err)
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
        // Refresh wallet info
        await fetchWalletInfo()
      } else {
        // Show detailed error message
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

  const enableModule = async () => {
    console.log('[EnableModule] Starting...')
    console.log('[EnableModule] Safe address:', walletInfo?.safeAddress)
    console.log('[EnableModule] Connected:', isConnected)
    console.log('[EnableModule] Current chain:', chain?.id, chain?.name)

    if (!walletInfo?.safeAddress || !isConnected || !walletAddress) {
      setError('Wallet not connected or Safe not deployed')
      return
    }

    try {
      setEnablingModule(true)
      setError(null)
      setTxHash(null)

      // Check if user is on Polygon chain
      if (chain?.id !== polygon.id) {
        console.log('[EnableModule] Switching to Polygon network...')
        try {
          await switchChain({ chainId: polygon.id })
          console.log('[EnableModule] Network switched to Polygon')
          await new Promise(resolve => setTimeout(resolve, 500))
        } catch (switchError: any) {
          console.error('[EnableModule] Network switch failed:', switchError)
          setError(`Please switch to Polygon network in your wallet. ${switchError.message || ''}`)
          setEnablingModule(false)
          return
        }
      }

      // Step 1: Prepare the Safe transaction via API
      console.log('[EnableModule] Preparing Safe transaction...')
      const prepareResponse = await fetch('/api/wallet/prepare-enable-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json()
        throw new Error(errorData.error || 'Failed to prepare transaction')
      }

      const { safeTxHash, transaction, eip712 } = await prepareResponse.json()
      console.log('[EnableModule] Safe transaction hash:', safeTxHash)
      console.log('[EnableModule] EIP-712 data:', eip712)

      // Step 2: Have user sign the Safe transaction using EIP-712
      console.log('[EnableModule] Requesting EIP-712 signature from user...')
      const signature = await signTypedDataAsync({
        domain: eip712.domain,
        types: eip712.types,
        primaryType: 'SafeTx',
        message: eip712.message,
      })
      console.log('[EnableModule] User signature received:', signature)

      // Step 3: Execute the transaction via the operator
      console.log('[EnableModule] Executing transaction via operator...')
      const executeResponse = await fetch('/api/wallet/execute-enable-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          transaction,
          safeTxHash,
        }),
      })

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json()
        throw new Error(errorData.error || 'Failed to execute transaction')
      }

      const { transactionHash } = await executeResponse.json()
      console.log('[EnableModule] Transaction executed! Hash:', transactionHash)

      setTxHash(transactionHash)
      setEnablingModule(false)

      // Refresh module status after 3 seconds
      setTimeout(() => {
        console.log('[EnableModule] Refreshing module status...')
        fetchModuleStatus()
      }, 3000)

    } catch (err: any) {
      console.error('[EnableModule] Error:', err)

      // Handle specific error cases
      if (err.message?.includes('User rejected') || err.message?.includes('rejected')) {
        setError('Transaction cancelled by user. Please try again.')
      } else if (err.message?.includes('already enabled')) {
        // Module is already enabled - refresh status
        console.log('[EnableModule] Module already enabled, refreshing status...')
        await fetchModuleStatus()
        setError(null)
      } else {
        setError(err.message || 'Failed to enable module')
      }

      setEnablingModule(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
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
          Secure multi-sig wallet for copy trading on {walletInfo?.network}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Safe Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          <Badge variant={
            walletInfo?.safeStatus === 'deployed' ? 'default' :
            walletInfo?.safeStatus === 'deploying' ? 'outline' :
            'secondary'
          }>
            {walletInfo?.safeStatus === 'deployed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {walletInfo?.safeStatus === 'deploying' && <AlertCircle className="h-3 w-3 mr-1" />}
            {walletInfo?.safeStatus?.toUpperCase().replace('_', ' ')}
          </Badge>
        </div>

        {/* Not Deployed - Show Deploy Button */}
        {walletInfo?.safeStatus === 'not_deployed' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100 mb-3">
                <strong>You need a Safe wallet to start copy trading.</strong>
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                A Gnosis Safe is a secure multi-signature wallet that allows the platform to execute trades on your behalf while you maintain full control of your funds.
              </p>
              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside mb-3">
                <li>Full control - only you can deposit/withdraw</li>
                <li>Automatic trade execution when following traders</li>
                <li>Secure multi-sig architecture</li>
              </ul>
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded p-2 mt-2">
                <p className="text-xs text-yellow-900 dark:text-yellow-100">
                  <strong>Note:</strong> Deployment requires ~0.04-0.10 POL for gas.
                  Contact support if deployment fails.
                </p>
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full" disabled={deploying}>
                  {deploying ? 'Deploying...' : 'Deploy Safe Wallet (Free)'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deploy Gnosis Safe?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a Gnosis Safe wallet on Polygon network. The deployment is gasless - Polymarket will pay the gas fees (~$0.04).
                    <br /><br />
                    Your Safe address will be unique to you and you'll have full control over deposits and withdrawals.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deploySafe}>
                    Deploy Safe
                  </AlertDialogAction>
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
              Your Safe is being deployed. This usually takes 1-2 minutes. Refresh the page to check status.
            </p>
          </div>
        )}

        {/* Deployed - Show Safe Info */}
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
                onClick={() => window.open(`https://app.safe.global/home?safe=matic:${walletInfo.safeAddress}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Safe App
              </Button>
            </div>

            {/* Module Status */}
            {moduleStatus && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Trading Module:</span>
                  <Badge variant={moduleStatus.enabled ? 'default' : 'secondary'}>
                    {moduleStatus.enabled ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1" />Enabled</>
                    ) : (
                      <><AlertCircle className="h-3 w-3 mr-1" />Not Enabled</>
                    )}
                  </Badge>
                </div>
                {!moduleStatus.enabled && (
                  <div className="space-y-3">
                    {/* Warning Box */}
                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                      <p className="text-xs text-yellow-900 dark:text-yellow-100 mb-2">
                        <strong>⚠️ Action Required:</strong> Enable the TradeModule to start copy trading.
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300">
                        Click the button below to enable the module. You'll need to sign a message (no gas fees for you).
                      </p>
                    </div>

                    {/* Enable Module Button */}
                    <Button
                      className="w-full"
                      onClick={enableModule}
                      disabled={enablingModule || !isConnected}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      {enablingModule
                        ? 'Processing...'
                        : chain?.id !== polygon.id
                        ? 'Switch to Polygon & Enable Module'
                        : 'Enable Trading Module'}
                    </Button>

                    {/* Error Message */}
                    {error && !txHash && (
                      <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                        <p className="text-xs text-red-900 dark:text-red-100 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                          <span>{error}</span>
                        </p>
                      </div>
                    )}

                    {/* Success Message */}
                    {txHash && (
                      <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                        <p className="text-xs text-green-900 dark:text-green-100 mb-2 flex items-center">
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          <strong>Module enabled successfully!</strong>
                        </p>
                        <a
                          href={`https://polygonscan.com/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-700 dark:text-green-300 hover:underline flex items-center gap-1"
                        >
                          View transaction <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    {/* Network Warning */}
                    {isConnected && chain?.id !== polygon.id && (
                      <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                        <p className="text-xs text-orange-900 dark:text-orange-100">
                          ⚠️ <strong>Wrong Network:</strong> You're connected to {chain?.name}.
                          Click the button above to automatically switch to Polygon.
                        </p>
                      </div>
                    )}

                    {/* Module Address (for reference) */}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Technical Details
                      </summary>
                      <div className="mt-2 p-2 bg-muted rounded">
                        <p className="mb-1"><strong>Module Address:</strong></p>
                        <code className="text-[10px] break-all">{moduleStatus.moduleAddress}</code>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            {/* Balance */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">USDC Balance:</span>
                <span className="text-2xl font-bold">${walletInfo.balance.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={fetchWalletInfo}
                >
                  🔄 Refresh Balance
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={checkingBalances}
                  onClick={async () => {
                    console.log('[DebugBalances] Button clicked')
                    setCheckingBalances(true)
                    try {
                      console.log('[DebugBalances] Fetching...')
                      const response = await fetch('/api/wallet/check-balances')
                      console.log('[DebugBalances] Response status:', response.status)

                      if (!response.ok) {
                        const errorData = await response.json()
                        throw new Error(errorData.error || 'Failed to fetch balances')
                      }

                      const data = await response.json()
                      console.log('=== Balance Debug Info ===')
                      console.log('Safe Address:', data.safeAddress)
                      console.log('USDC.e (Bridged):', data.balances.usdcE.balance, 'USDC')
                      console.log('Native USDC:', data.balances.usdcNative.balance, 'USDC')
                      console.log('POL:', data.balances.pol.balance, 'POL')
                      console.log('Total USDC:', data.totalUSDC, 'USDC')
                      console.log('=========================')

                      const message = `Balance Debug Info:\n\n` +
                        `USDC.e (Bridged): $${data.balances.usdcE.balance}\n` +
                        `Native USDC: $${data.balances.usdcNative.balance}\n` +
                        `POL: ${data.balances.pol.balance}\n\n` +
                        `Total USDC: $${data.totalUSDC}\n\n` +
                        `Check console for full details`

                      window.alert(message)
                    } catch (err: any) {
                      console.error('[DebugBalances] Error:', err)
                      window.alert(`Error: ${err.message}\n\nCheck console for details.`)
                    } finally {
                      setCheckingBalances(false)
                    }
                  }}
                >
                  {checkingBalances ? '⏳ Checking...' : '🔍 Debug Balances'}
                </Button>
              </div>
            </div>

            {/* Deposit Instructions */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">How to Deposit USDC:</h4>
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
                <div className="flex gap-2">
                  <span className="font-bold text-blue-900 dark:text-blue-100">1.</span>
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    {walletInfo.instructions.step1}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-blue-900 dark:text-blue-100">2.</span>
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    {walletInfo.instructions.step2}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-blue-900 dark:text-blue-100">3.</span>
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    {walletInfo.instructions.step3}
                  </p>
                </div>
              </div>
            </div>

            {/* Withdraw Link */}
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(`https://app.safe.global/home?safe=matic:${walletInfo.safeAddress}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Withdraw Funds (via Safe App)
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Use the Safe App to send USDC to any address
              </p>
            </div>

            {/* Network Info */}
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <div className="flex justify-between">
                <span>Network:</span>
                <span className="font-medium">{walletInfo.network}</span>
              </div>
              <div className="flex justify-between">
                <span>Chain ID:</span>
                <span className="font-medium">{walletInfo.chainId}</span>
              </div>
              <div className="flex justify-between">
                <span>USDC Token:</span>
                <button
                  className="font-mono text-xs hover:underline"
                  onClick={() => copyToClipboard(walletInfo.usdcAddress)}
                >
                  {formatAddress(walletInfo.usdcAddress)}
                </button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
