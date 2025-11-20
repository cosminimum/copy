'use client';

/**
 * USDC Funding Input Component
 *
 * Allows users to input USDC amount and see real-time quotes for:
 * - 5% USDC → WMATIC (for operator gas)
 * - 95% USDC → USDC.e (for Safe trading)
 */

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowDown, Info, Zap, Wallet } from 'lucide-react';
import { useDebounce } from '@/lib/hooks/use-debounce';

interface FundingQuotes {
  wmatic: {
    inputUsdc: string;
    expectedWmatic: string;
    minimumWmatic: string;
    exchangeRate: string;
    slippage: string;
  };
  usdcE: {
    inputUsdc: string;
    expectedUsdcE: string;
    minimumUsdcE: string;
    exchangeRate: string;
    slippage: string;
  };
}

interface FundingDistribution {
  totalUsdc: string;
  operatorUsdc: string; // 5%
  safeUsdc: string; // 95%
  operatorPercent: string;
  safePercent: string;
}

interface EstimatedGas {
  totalPol: string;
  totalUsdc: string;
  breakdown: {
    approve: string;
    swapToWmatic: string;
    swapToUsdcE: string;
    transferToSafe: string;
  };
}

interface PreparedFunding {
  sessionId: string;
  operatorAddress: string;
  safeAddress: string;
  distribution: FundingDistribution;
  quotes: FundingQuotes;
  estimatedGas: EstimatedGas;
}

interface UsdcFundingInputProps {
  userAddress: string;
  userBalance: string; // USDC balance
  onFundingPrepared: (funding: PreparedFunding) => void;
  disabled?: boolean;
}

export function UsdcFundingInput({
  userAddress,
  userBalance,
  onFundingPrepared,
  disabled = false,
}: UsdcFundingInputProps) {
  const [usdcAmount, setUsdcAmount] = useState('');
  const [preparedFunding, setPreparedFunding] = useState<PreparedFunding | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedAmount = useDebounce(usdcAmount, 500);

  // Fetch quote when amount changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!debouncedAmount || parseFloat(debouncedAmount) <= 0) {
        setPreparedFunding(null);
        setError(null);
        return;
      }

      // Validate minimum
      if (parseFloat(debouncedAmount) < 0.01) {
        setError('Minimum amount is $0.01 USDC');
        setPreparedFunding(null);
        return;
      }

      // Validate user balance
      if (parseFloat(debouncedAmount) > parseFloat(userBalance)) {
        setError('Insufficient USDC balance');
        setPreparedFunding(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/onboarding/prepare-funding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usdcAmount: debouncedAmount,
            userAddress,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to prepare funding');
        }

        setPreparedFunding(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to prepare funding');
        setPreparedFunding(null);
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [debouncedAmount, userAddress, userBalance]);

  const handleMaxClick = () => {
    setUsdcAmount(userBalance);
  };

  const handleStartFunding = () => {
    if (usdcAmount && preparedFunding) {
      onFundingPrepared(preparedFunding);
    }
  };

  const isValidAmount = usdcAmount && !error && preparedFunding && !loading;

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="usdc-amount">USDC Amount</Label>
          <button
            type="button"
            onClick={handleMaxClick}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            disabled={disabled}
          >
            Balance: ${parseFloat(userBalance).toFixed(2)} USDC
          </button>
        </div>
        <div className="relative">
          <Input
            id="usdc-amount"
            type="number"
            placeholder="0.00"
            value={usdcAmount}
            onChange={(e) => setUsdcAmount(e.target.value)}
            disabled={disabled}
            className="pr-24"
            min="0.01"
            step="0.01"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">USDC</span>
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

      {/* Distribution Arrow */}
      {(loading || preparedFunding) && (
        <div className="flex justify-center py-2">
          <div className="rounded-full bg-muted p-2">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center p-6 border rounded-lg bg-muted/50">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Preparing funding details...
          </span>
        </div>
      )}

      {/* Quote Display */}
      {preparedFunding && !loading && (
        <div className="space-y-3">
          {/* Operator Receives (5%) */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <Label className="text-xs text-muted-foreground">
                Operator Receives (for gas fees)
              </Label>
            </div>
            <div className="text-xl font-bold">
              ~{parseFloat(preparedFunding.quotes.wmatic.expectedWmatic).toFixed(4)} POL
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              ${preparedFunding.distribution.operatorUsdc} USDC (5%)
            </div>
          </div>

          {/* Safe Receives (95%) */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-green-500" />
              <Label className="text-xs text-muted-foreground">
                Safe Receives (for trading)
              </Label>
            </div>
            <div className="text-xl font-bold">
              ~${parseFloat(preparedFunding.quotes.usdcE.expectedUsdcE).toFixed(2)} USDC.e
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              ${preparedFunding.distribution.safeUsdc} USDC (95%)
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2 pt-3 border-t">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="space-y-1.5 text-xs text-muted-foreground flex-1">
                <div className="flex justify-between">
                  <span>Exchange rate (USDC → POL):</span>
                  <span className="font-medium text-foreground">
                    {preparedFunding.quotes.wmatic.exchangeRate}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Exchange rate (USDC → USDC.e):</span>
                  <span className="font-medium text-foreground">
                    {preparedFunding.quotes.usdcE.exchangeRate}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Slippage tolerance:</span>
                  <span className="font-medium text-foreground">
                    {preparedFunding.quotes.wmatic.slippage}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span>Estimated gas cost:</span>
                  <span className="font-medium text-foreground">
                    ~${preparedFunding.estimatedGas.totalUsdc} (
                    {parseFloat(preparedFunding.estimatedGas.totalPol).toFixed(6)} POL)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Button */}
      <Button
        onClick={handleStartFunding}
        disabled={!isValidAmount || disabled}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Preparing...
          </>
        ) : (
          'Start Funding'
        )}
      </Button>

      {/* Info Notice */}
      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
        <strong>How it works:</strong> You send USDC to your operator wallet. Then 5% is
        automatically swapped to POL for gas fees, and 95% is swapped to USDC.e and transferred
        to your Safe for trading. All automated—just one transaction from you!
      </div>
    </div>
  );
}
