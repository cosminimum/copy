'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react'
import { ethers } from 'ethers'

interface WithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface WithdrawInfo {
  balance: number
  lockedFunds: number
  availableToWithdraw: number
  isAuthorized: boolean
}

export function WithdrawModal({ isOpen, onClose, onSuccess }: WithdrawModalProps) {
  const { address: connectedAddress } = useAccount()

  const [withdrawInfo, setWithdrawInfo] = useState<WithdrawInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [useConnectedWallet, setUseConnectedWallet] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [txHash, setTxHash] = useState('')

  // Fetch withdraw info when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchWithdrawInfo()
      // Set connected wallet as default recipient
      if (connectedAddress) {
        setRecipient(connectedAddress)
      }
    } else {
      // Reset state when modal closes
      resetForm()
    }
  }, [isOpen, connectedAddress])

  const fetchWithdrawInfo = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/wallet/withdraw')
      const data = await response.json()

      console.log('[WithdrawModal] API Response:', { status: response.status, data })

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch withdrawal information')
      }

      setWithdrawInfo(data)
      console.log('[WithdrawModal] Set withdrawInfo:', data)
    } catch (err) {
      console.error('[WithdrawModal] Error fetching withdraw info:', err)
      setError(err instanceof Error ? err.message : 'Failed to load withdrawal information')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setAmount('')
    setRecipient(connectedAddress || '')
    setUseConnectedWallet(true)
    setError('')
    setSuccess(false)
    setTxHash('')
    setIsExecuting(false)
  }

  const handleMaxClick = () => {
    if (withdrawInfo) {
      setAmount(withdrawInfo.availableToWithdraw.toFixed(2))
    }
  }

  const handleRecipientToggle = () => {
    if (!useConnectedWallet) {
      // Switching back to connected wallet
      if (connectedAddress) {
        setRecipient(connectedAddress)
      }
    } else {
      // Switching to custom address
      setRecipient('')
    }
    setUseConnectedWallet(!useConnectedWallet)
  }

  const validateForm = (): string | null => {
    if (!amount || parseFloat(amount) <= 0) {
      return 'Please enter a valid amount'
    }

    if (!withdrawInfo) {
      return 'Withdrawal information not loaded'
    }

    if (parseFloat(amount) > withdrawInfo.availableToWithdraw) {
      return `Maximum available to withdraw: $${withdrawInfo.availableToWithdraw.toFixed(2)}`
    }

    if (!recipient || !ethers.isAddress(recipient)) {
      return 'Please enter a valid Ethereum address'
    }

    if (!withdrawInfo.isAuthorized) {
      return 'Your wallet is not authorized to withdraw. Please contact support.'
    }

    return null
  }

  const handleWithdraw = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsExecuting(true)
    setError('')

    try {
      // First, prepare the withdrawal
      const prepareResponse = await fetch('/api/wallet/prepare-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          recipient,
        }),
      })

      const prepareData = await prepareResponse.json()

      if (!prepareResponse.ok) {
        throw new Error(prepareData.error || 'Failed to prepare withdrawal')
      }

      // Execute the withdrawal
      const executeResponse = await fetch('/api/wallet/execute-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          recipient,
        }),
      })

      const executeData = await executeResponse.json()

      if (!executeResponse.ok) {
        throw new Error(executeData.error || 'Failed to execute withdrawal')
      }

      setSuccess(true)
      setTxHash(executeData.transactionHash)

      // Call success callback after a delay
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process withdrawal')
    } finally {
      setIsExecuting(false)
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (success) {
      return (
        <div className="space-y-4 py-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <h3 className="font-semibold text-lg">Withdrawal Successful!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                ${parseFloat(amount).toFixed(2)} USDC.e sent to {recipient.slice(0, 6)}...{recipient.slice(-4)}
              </p>
            </div>
            {txHash && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`https://polygonscan.com/tx/${txHash}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View on PolygonScan
              </Button>
            )}
          </div>
        </div>
      )
    }

    if (!withdrawInfo) {
      return (
        <div className="py-6 text-center text-muted-foreground">
          Failed to load withdrawal information
        </div>
      )
    }

    return (
      <div className="space-y-4 py-4">
        {/* Balance Info */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Balance</div>
            <div className="font-semibold">${withdrawInfo.balance.toFixed(2)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Locked</div>
            <div className="font-semibold">${withdrawInfo.lockedFunds.toFixed(2)}</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Available</div>
            <div className="font-semibold text-green-600 dark:text-green-500">
              ${withdrawInfo.availableToWithdraw.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Authorization Warning */}
        {!withdrawInfo.isAuthorized && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-red-600 dark:text-red-500">Not Authorized</div>
              <div className="text-muted-foreground text-xs mt-1">
                Your wallet is not authorized to withdraw funds. Please contact support.
              </div>
            </div>
          </div>
        )}

        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="amount">Withdrawal Amount (USDC.e)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                step="0.01"
                className="pl-6"
                disabled={isExecuting || !withdrawInfo.isAuthorized}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleMaxClick}
              disabled={isExecuting || !withdrawInfo.isAuthorized}
            >
              Max
            </Button>
          </div>
        </div>

        {/* Recipient Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="recipient">Recipient Address</Label>
            <button
              type="button"
              onClick={handleRecipientToggle}
              className="text-xs text-primary hover:underline"
              disabled={isExecuting}
            >
              {useConnectedWallet ? 'Use custom address' : 'Use connected wallet'}
            </button>
          </div>
          <Input
            id="recipient"
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={isExecuting || useConnectedWallet || !withdrawInfo.isAuthorized}
            className="font-mono text-sm"
          />
          {useConnectedWallet && connectedAddress && (
            <p className="text-xs text-muted-foreground">
              Withdrawing to your connected wallet
            </p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-600 dark:text-red-500">{error}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Withdraw from Safe Wallet</DialogTitle>
          <DialogDescription>
            Transfer USDC.e from your Safe wallet to another address
          </DialogDescription>
        </DialogHeader>

        {renderContent()}

        {!success && !isLoading && withdrawInfo && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isExecuting}>
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={isExecuting || !withdrawInfo.isAuthorized}
            >
              {isExecuting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isExecuting ? 'Processing...' : 'Withdraw'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
