'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { parseUnits, formatUnits, maxUint256 } from 'viem'
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
import { Loader2, AlertCircle, CheckCircle2, ExternalLink, Info } from 'lucide-react'
import { ethers } from 'ethers'
import {
  USER_WITHDRAWAL_MODULE,
  USER_WITHDRAWAL_MODULE_ABI,
  USDC_E_ADDRESS
} from '@/lib/contracts/withdrawal-module-abi'

interface WithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface WithdrawInfo {
  balance: number
  safeAddress: string
  isAuthorized: boolean
  moduleAddress: string
  usdcAddress: string
}

export function WithdrawModal({ isOpen, onClose, onSuccess }: WithdrawModalProps) {
  const { address: connectedAddress } = useAccount()
  const queryClient = useQueryClient()
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  const [withdrawInfo, setWithdrawInfo] = useState<WithdrawInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [useConnectedWallet, setUseConnectedWallet] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [withdrawAll, setWithdrawAll] = useState(false)

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

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && hash) {
      // Invalidate all relevant queries to refresh the entire dashboard
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['trades'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      queryClient.invalidateQueries({ queryKey: ['following'] })

      // Call success callback after a delay
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 3000)
    }
  }, [isConfirmed, hash, queryClient, onSuccess, onClose])

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
    setWithdrawAll(false)
  }

  const handleMaxClick = () => {
    if (withdrawInfo) {
      setAmount(withdrawInfo.balance.toFixed(2))
      setWithdrawAll(true)
    }
  }

  const handleAmountChange = (value: string) => {
    setAmount(value)
    setWithdrawAll(false) // Unset withdrawAll if user manually enters amount
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
    if (!withdrawAll && (!amount || parseFloat(amount) <= 0)) {
      return 'Please enter a valid amount'
    }

    if (!withdrawInfo) {
      return 'Withdrawal information not loaded'
    }

    if (!withdrawAll && parseFloat(amount) > withdrawInfo.balance) {
      return `Maximum available to withdraw: $${withdrawInfo.balance.toFixed(2)}`
    }

    if (!recipient || !ethers.isAddress(recipient)) {
      return 'Please enter a valid Ethereum address'
    }

    if (!withdrawInfo.isAuthorized) {
      return 'Your wallet is not authorized to withdraw. Please contact support.'
    }

    if (!connectedAddress) {
      return 'Please connect your wallet'
    }

    return null
  }

  const handleWithdraw = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    if (!withdrawInfo || !connectedAddress) {
      setError('Missing withdrawal information')
      return
    }

    setError('')

    try {
      if (withdrawAll) {
        // Call withdrawAllTokens
        console.log('[WithdrawModal] Calling withdrawAllTokens', {
          safe: withdrawInfo.safeAddress,
          token: USDC_E_ADDRESS,
        })

        writeContract({
          address: USER_WITHDRAWAL_MODULE as `0x${string}`,
          abi: USER_WITHDRAWAL_MODULE_ABI,
          functionName: 'withdrawAllTokens',
          args: [
            withdrawInfo.safeAddress as `0x${string}`,
            USDC_E_ADDRESS as `0x${string}`,
          ],
        })
      } else {
        // Call withdrawToken with specific amount
        const amountInUnits = parseUnits(amount, 6) // USDC.e has 6 decimals

        console.log('[WithdrawModal] Calling withdrawToken', {
          safe: withdrawInfo.safeAddress,
          token: USDC_E_ADDRESS,
          amount: amountInUnits.toString(),
        })

        writeContract({
          address: USER_WITHDRAWAL_MODULE as `0x${string}`,
          abi: USER_WITHDRAWAL_MODULE_ABI,
          functionName: 'withdrawToken',
          args: [
            withdrawInfo.safeAddress as `0x${string}`,
            USDC_E_ADDRESS as `0x${string}`,
            amountInUnits,
          ],
        })
      }
    } catch (err) {
      console.error('[WithdrawModal] Error initiating withdrawal:', err)
      setError(err instanceof Error ? err.message : 'Failed to initiate withdrawal')
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

    if (isConfirmed && hash) {
      return (
        <div className="space-y-4 py-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <h3 className="font-semibold text-lg">Withdrawal Successful!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {withdrawAll ? 'All funds' : `$${parseFloat(amount).toFixed(2)} USDC.e`} sent to {recipient.slice(0, 6)}...{recipient.slice(-4)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`https://polygonscan.com/tx/${hash}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on PolygonScan
            </Button>
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
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="text-sm text-muted-foreground mb-1">Total Balance</div>
          <div className="text-2xl font-semibold text-green-600 dark:text-green-500">
            ${withdrawInfo.balance.toFixed(2)}
          </div>
        </div>

        {/* Gas Fee Notice */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            You will need MATIC in your wallet to pay for gas fees (approximately $0.01-0.05 per withdrawal)
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
                onChange={(e) => handleAmountChange(e.target.value)}
                min="0.01"
                step="0.01"
                className="pl-6"
                disabled={isPending || isConfirming || !withdrawInfo.isAuthorized}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleMaxClick}
              disabled={isPending || isConfirming || !withdrawInfo.isAuthorized}
            >
              Max
            </Button>
          </div>
          {withdrawAll && (
            <p className="text-xs text-muted-foreground">
              Withdrawing all available funds
            </p>
          )}
        </div>

        {/* Recipient Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="recipient">Recipient Address</Label>
            <button
              type="button"
              onClick={handleRecipientToggle}
              className="text-xs text-primary hover:underline"
              disabled={isPending || isConfirming}
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
            disabled={isPending || isConfirming || useConnectedWallet || !withdrawInfo.isAuthorized}
            className="font-mono text-sm"
          />
          {useConnectedWallet && connectedAddress && (
            <p className="text-xs text-muted-foreground">
              Withdrawing to your connected wallet
            </p>
          )}
        </div>

        {/* Error Message */}
        {(error || writeError) && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-600 dark:text-red-500">
              {error || (writeError as Error)?.message || 'Transaction failed'}
            </div>
          </div>
        )}

        {/* Pending Transaction Status */}
        {(isPending || isConfirming) && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2">
            <Loader2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5 animate-spin" />
            <div className="text-sm text-blue-600 dark:text-blue-500">
              {isPending && 'Waiting for wallet confirmation...'}
              {isConfirming && 'Transaction pending confirmation...'}
            </div>
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

        {!isConfirmed && !isLoading && withdrawInfo && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isPending || isConfirming}
            >
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={isPending || isConfirming || !withdrawInfo.isAuthorized}
            >
              {(isPending || isConfirming) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isPending && 'Confirm in Wallet...'}
              {isConfirming && 'Confirming...'}
              {!isPending && !isConfirming && 'Withdraw'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
