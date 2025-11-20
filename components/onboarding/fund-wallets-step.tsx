/**
 * Fund Wallets Step
 *
 * Replaces the old "Fund Operator" and "Deposit USDC" steps
 * with a unified USDC funding flow that handles both wallets
 */

'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { UsdcFundingFlow } from './usdc-funding-flow';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Info, Wallet, Zap } from 'lucide-react';
import { formatUsdcBalance, formatPolBalance, ONBOARDING_CONSTANTS } from '@/lib/constants/onboarding';
import { useAutoRefresh } from '@/lib/hooks/use-onboarding-state';
import { FUNDING_CONTRACTS } from '@/lib/constants/funding';

interface FundWalletsStepProps {
  onNext: () => void;
  onRefreshStatus: () => Promise<void>;
  status: any;
}

export function FundWalletsStep({ onNext, onRefreshStatus, status }: FundWalletsStepProps) {
  const { address: connectedWallet } = useAccount();
  const [operatorWmaticBalance, setOperatorWmaticBalance] = useState<bigint>(BigInt(0));
  const [safeUsdcBalance, setSafeUsdcBalance] = useState<bigint>(BigInt(0));
  const [fundingComplete, setFundingComplete] = useState(false);

  const operatorAddress = status?.operatorAddress;
  const safeAddress = status?.safeAddress;

  // Fetch user's USDC balance
  const { data: userUsdcBalance = BigInt(0) } = useReadContract({
    address: FUNDING_CONTRACTS.USDC as `0x${string}`,
    abi: [
      {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      },
    ],
    functionName: 'balanceOf',
    args: connectedWallet ? [connectedWallet] : undefined,
    query: {
      enabled: !!connectedWallet,
    },
  });

  const minWmaticRequired = BigInt(Math.floor(ONBOARDING_CONSTANTS.MIN_POL_BALANCE));
  const minUsdcRequired = BigInt(Math.floor(ONBOARDING_CONSTANTS.MIN_USDC_BALANCE));

  const hasSufficientWmatic = operatorWmaticBalance >= minWmaticRequired;
  const hasSufficientUsdc = safeUsdcBalance >= minUsdcRequired;
  const canProceed = hasSufficientWmatic && hasSufficientUsdc;

  // Auto-refresh balances
  useAutoRefresh(
    !!operatorAddress && !!safeAddress && !canProceed,
    async () => {
      await onRefreshStatus();
      // Update balances from status
      if (status?.operatorPolBalance) {
        setOperatorWmaticBalance(BigInt(status.operatorPolBalance));
      }
      if (status?.safeUsdcBalance) {
        setSafeUsdcBalance(BigInt(status.safeUsdcBalance));
      }
    },
    ONBOARDING_CONSTANTS.BALANCE_POLL_INTERVAL
  );

  // Auto-advance when both balances are sufficient
  useEffect(() => {
    if (canProceed && !fundingComplete) {
      setFundingComplete(true);
      setTimeout(onNext, 2000);
    }
  }, [canProceed, fundingComplete, onNext]);

  const handleFundingComplete = async () => {
    // Refresh status to get updated balances
    await onRefreshStatus();
    setFundingComplete(true);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Fund Your Wallets</h2>
        <p className="text-muted-foreground">
          Expected time: 2-3 minutes
        </p>
      </div>

      {/* Info Card */}
      <Card className="border-primary/20">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Single Transaction, Dual Funding</p>
              <p className="text-sm text-muted-foreground">
                Send USDC once, and we'll automatically split it:
              </p>
            </div>
          </div>

          <div className="grid gap-3 pt-2 pl-8">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">
                <strong>5%</strong> converted to WMATIC for operator gas fees
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-green-500" />
              <span className="text-sm">
                <strong>95%</strong> converted to USDC.e for Safe trading capital
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Balance Status */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Operator WMATIC Balance:</span>
            <Badge variant={hasSufficientWmatic ? 'default' : 'secondary'}>
              {formatPolBalance(operatorWmaticBalance)}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Safe USDC.e Balance:</span>
            <Badge variant={hasSufficientUsdc ? 'default' : 'secondary'}>
              {formatUsdcBalance(safeUsdcBalance)}
            </Badge>
          </div>

          {canProceed && (
            <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-start gap-2 text-green-700 dark:text-green-300">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Funding complete! ✓</p>
                  <p>Both wallets are ready. Proceeding to next step...</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funding Flow Component */}
      {connectedWallet && (
        <UsdcFundingFlow
          userAddress={connectedWallet}
          usdcBalance={(Number(userUsdcBalance) / 1e6).toString()}
          onComplete={handleFundingComplete}
        />
      )}

      {!connectedWallet && (
        <Card>
          <CardContent className="pt-6">
            <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Wallet Connection Required</p>
                  <p className="mt-1">
                    Please connect your wallet to continue with funding.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Educational Info */}
      <Card className="border-muted">
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm font-medium">Why two wallets?</p>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Operator Wallet:</strong> Executes trades on your behalf using WMATIC for gas.
              Restricted by security guards—can only trade on Polymarket, cannot withdraw your funds.
            </p>
            <p>
              <strong>Safe Wallet:</strong> Holds your USDC.e trading capital. You maintain full control
              and can withdraw anytime.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
