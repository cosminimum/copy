'use client'

/**
 * Swap POL Input Component
 *
 * Allows users to input POL amount and see real-time quote for USDC.e output
 */

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowDown, Info } from 'lucide-react'
import { useDebounce } from '@/lib/hooks/use-debounce'

interface SwapQuote {
  inputPol: string
  polToSwap: string
  polToKeep: string
  expectedUsdc: string
  minimumUsdc: string
  exchangeRate: string
  slippage: string
}

interface GasCost {
  total: string
  breakdown: {
    polTransfer: string
    swap: string
    usdcTransfer: string
  }
}

interface SwapPolInputProps {
  userBalance: string // POL balance in ETH units
  onSwap: (polAmount: string) => void
  disabled?: boolean
}

export function SwapPolInput({ userBalance, onSwap, disabled = false }: SwapPolInputProps) {
  const [polAmount, setPolAmount] = useState('')
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [gasCost, setGasCost] = useState<GasCost | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedAmount = useDebounce(polAmount, 500)

  // Fetch quote when amount changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!debouncedAmount || parseFloat(debouncedAmount) <= 0) {
        setQuote(null)
        setGasCost(null)
        setError(null)
        return
      }

      // Validate minimum
      if (parseFloat(debouncedAmount) < 1) {
        setError('Minimum amount is 1 POL')
        setQuote(null)
        return
      }

      // Validate user balance
      if (parseFloat(debouncedAmount) > parseFloat(userBalance)) {
        setError('Insufficient balance')
        setQuote(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/swap/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ polAmount: debouncedAmount }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to get quote')
        }

        setQuote(data.quote)
        setGasCost(data.gasCost)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get quote')
        setQuote(null)
      } finally {
        setLoading(false)
      }
    }

    fetchQuote()
  }, [debouncedAmount, userBalance])

  const handleMaxClick = () => {
    setPolAmount(userBalance)
  }

  const handleSwap = () => {
    if (polAmount && quote) {
      onSwap(polAmount)
    }
  }

  const isValidAmount = polAmount && !error && quote && !loading

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="pol-amount">Amount to Convert</Label>
          <button
            type="button"
            onClick={handleMaxClick}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            disabled={disabled}
          >
            Balance: {parseFloat(userBalance).toFixed(4)} POL
          </button>
        </div>
        <div className="relative">
          <Input
            id="pol-amount"
            type="number"
            placeholder="0.0"
            value={polAmount}
            onChange={(e) => setPolAmount(e.target.value)}
            disabled={disabled}
            className="pr-20"
            min="1"
            step="0.1"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">POL</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleMaxClick}
              disabled={disabled}
              className="h-6 px-2 text-xs"
            >
              MAX
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Swap Arrow */}
      {(loading || quote) && (
        <div className="flex justify-center py-2">
          <div className="rounded-full bg-muted p-2">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* Quote Display */}
      {loading && (
        <div className="flex items-center justify-center p-6 border rounded-lg bg-muted/50">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Getting quote...</span>
        </div>
      )}

      {quote && !loading && (
        <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
          {/* Main Output */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">You Receive in Safe</Label>
            <div className="text-2xl font-bold">~{parseFloat(quote.expectedUsdc).toFixed(2)} USDC.e</div>
          </div>

          {/* Split Breakdown */}
          <div className="space-y-2 pt-3 border-t">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="space-y-1.5 text-xs text-muted-foreground flex-1">
                <div className="flex justify-between">
                  <span>Amount to swap (95%):</span>
                  <span className="font-medium text-foreground">{parseFloat(quote.polToSwap).toFixed(4)} POL</span>
                </div>
                <div className="flex justify-between">
                  <span>Kept in operator (5%):</span>
                  <span className="font-medium text-foreground">{parseFloat(quote.polToKeep).toFixed(4)} POL</span>
                </div>
                <div className="flex justify-between">
                  <span>Exchange rate:</span>
                  <span className="font-medium text-foreground">1 USDC.e = {quote.exchangeRate} POL</span>
                </div>
                <div className="flex justify-between">
                  <span>Min. received (with {quote.slippage} slippage):</span>
                  <span className="font-medium text-foreground">{parseFloat(quote.minimumUsdc).toFixed(2)} USDC.e</span>
                </div>
                {gasCost && (
                  <div className="flex justify-between pt-1 border-t">
                    <span>Estimated gas:</span>
                    <span className="font-medium text-foreground">~{parseFloat(gasCost.total).toFixed(6)} POL</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Swap Button */}
      <Button
        onClick={handleSwap}
        disabled={!isValidAmount || disabled}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Getting quote...
          </>
        ) : (
          'Start Automated Swap'
        )}
      </Button>

      {/* Info Notice */}
      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
        <strong>How it works:</strong> Your POL will be sent to your operator wallet, where 95% is
        automatically swapped to USDC.e and transferred to your Safe wallet. The remaining 5% stays in
        the operator for gas fees.
      </div>
    </div>
  )
}
