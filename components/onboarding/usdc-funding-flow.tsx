/**
 * USDC Funding Flow Component (QuickSwap V3 - Simplified)
 *
 * Handles the 4-step USDC funding process:
 * 1. User sends USDC to operator (requires signature)
 * 2-4. Automated server-side processing via QuickSwap
 */

'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import { polygon } from 'wagmi/chains';
import { ethers } from 'ethers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { USDC_FUNDING_STEPS, FUNDING_CONTRACTS } from '@/lib/constants/funding';
import { cn } from '@/lib/utils';
import { UsdcFundingInput } from './usdc-funding-input';

interface PreparedFunding {
  sessionId: string;
  operatorAddress: string;
  safeAddress: string;
  distribution: {
    totalUsdc: string;
    operatorUsdc: string;
    safeUsdc: string;
  };
  quotes: {
    wmatic: {
      expectedWmatic: string;
    };
    usdcE: {
      expectedUsdcE: string;
    };
  };
}

type StepStatus = 'pending' | 'signing' | 'confirming' | 'processing' | 'success' | 'failed';

interface StepState {
  status: StepStatus;
  txHash?: string;
  error?: string;
}

interface UsdcFundingFlowProps {
  userAddress: string;
  usdcBalance: string;
  onComplete?: () => void;
}

export function UsdcFundingFlow({ userAddress, usdcBalance, onComplete }: UsdcFundingFlowProps) {
  const [preparedFunding, setPreparedFunding] = useState<PreparedFunding | null>(null);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [steps, setSteps] = useState<Record<number, StepState>>({
    1: { status: 'pending' },
    2: { status: 'pending' },
    3: { status: 'pending' },
    4: { status: 'pending' },
  });
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const { isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  // Step 1: Send USDC transaction
  const {
    data: txHash,
    sendTransaction,
    isPending: isSigning,
    isError: txError,
    error: txErrorMessage,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Update step 1 status based on transaction state
  useEffect(() => {
    if (!preparedFunding) return;

    console.log('[UsdcFundingFlow] Transaction state:', {
      isSigning,
      isConfirming,
      txConfirmed,
      txHash,
      txError,
      txErrorMessage: txErrorMessage?.message,
    });

    if (txError && txErrorMessage) {
      console.error('[UsdcFundingFlow] Transaction error:', txErrorMessage);
      setError(txErrorMessage.message || 'Transaction failed');
      updateStepStatus(1, { status: 'failed', error: txErrorMessage.message });
    } else if (isSigning) {
      console.log('[UsdcFundingFlow] Setting status to signing');
      updateStepStatus(1, { status: 'signing' });
    } else if (isConfirming && txHash) {
      console.log('[UsdcFundingFlow] Setting status to confirming, txHash:', txHash);
      updateStepStatus(1, { status: 'confirming', txHash });
    } else if (txConfirmed && txHash) {
      console.log('[UsdcFundingFlow] Transaction confirmed! Triggering server-side flow');
      updateStepStatus(1, { status: 'success', txHash });
      // Trigger server-side execution
      executeServerSideFlow(txHash);
    }
  }, [isSigning, isConfirming, txConfirmed, txHash, txError, txErrorMessage, preparedFunding]);

  const updateStepStatus = (step: number, update: Partial<StepState>) => {
    setSteps((prev) => ({
      ...prev,
      [step]: { ...prev[step], ...update },
    }));
  };

  const handleFundingPrepared = (funding: PreparedFunding) => {
    setPreparedFunding(funding);
    setCurrentStep(1);
    setError(null);
  };

  const handleSendUsdc = async () => {
    if (!preparedFunding) return;

    setError(null);

    try {
      // Check if on Polygon network
      if (chain?.id !== polygon.id) {
        console.log('Wrong network, switching to Polygon...');
        try {
          await switchChain({ chainId: polygon.id });
          // Wait a bit for the network switch to settle
          await new Promise((resolve) => setTimeout(resolve, 1000));
          console.log('Network switched to Polygon successfully');
        } catch (switchError) {
          console.error('Failed to switch network:', switchError);
          setError('Please switch to Polygon network in your wallet');
          return;
        }
      }

      const usdcAmount = parseUnits(preparedFunding.distribution.totalUsdc, 6);

      // Build proper ERC20 transfer call data
      const erc20Interface = new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)',
      ]);

      const transferData = erc20Interface.encodeFunctionData('transfer', [
        preparedFunding.operatorAddress,
        usdcAmount,
      ]);

      console.log('Sending USDC transaction...', {
        to: FUNDING_CONTRACTS.USDC,
        amount: preparedFunding.distribution.totalUsdc,
        recipient: preparedFunding.operatorAddress,
        data: transferData,
      });

      // Send USDC to operator using ERC20 transfer
      sendTransaction(
        {
          to: FUNDING_CONTRACTS.USDC as `0x${string}`,
          data: transferData as `0x${string}`,
        },
        {
          onSuccess: (hash) => {
            console.log('[UsdcFundingFlow] Transaction sent successfully:', hash);
          },
          onError: (error) => {
            console.error('[UsdcFundingFlow] Transaction failed:', error);
          },
        }
      );
    } catch (err) {
      console.error('Send USDC error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send USDC');
      updateStepStatus(1, { status: 'failed', error: err instanceof Error ? err.message : 'Failed' });
    }
  };

  const executeServerSideFlow = async (userTxHash: string) => {
    if (!preparedFunding) return;

    setCurrentStep(2);
    updateStepStatus(2, { status: 'processing' });
    updateStepStatus(3, { status: 'processing' });
    updateStepStatus(4, { status: 'processing' });

    try {
      // Trigger server-side execution
      const response = await fetch('/api/onboarding/execute-funding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: preparedFunding.sessionId,
          userTxHash,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute funding flow');
      }

      if (data.success) {
        // Update all steps as success
        if (data.txHashes?.approveTx) {
          updateStepStatus(2, { status: 'success', txHash: data.txHashes.approveTx });
        }
        if (data.txHashes?.swapPolTx) {
          updateStepStatus(3, { status: 'success', txHash: data.txHashes.swapPolTx });
        }
        if (data.txHashes?.swapUsdcETx) {
          updateStepStatus(4, { status: 'success', txHash: data.txHashes.swapUsdcETx });
        }

        setCurrentStep(null);
        onComplete?.();
      } else {
        throw new Error(data.error || 'Funding execution failed');
      }
    } catch (err) {
      console.error('Server-side execution error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Server-side execution failed';

      // Check if it's a gas error and provide helpful message
      if (errorMessage.includes('POL for gas')) {
        setError(
          `⚠️ Operator needs POL for gas fees.\n\n` +
          `Your USDC has been received, but the operator wallet needs POL to complete the swaps.\n\n` +
          `${errorMessage}`
        );
      } else {
        setError(errorMessage);
      }

      // Mark remaining steps as failed
      [2, 3, 4].forEach((step) => {
        if (steps[step].status === 'processing') {
          updateStepStatus(step, { status: 'failed' });
        }
      });
    }
  };

  // Poll for status updates (alternative to webhook)
  const startPolling = (sessionId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/onboarding/execute-funding?sessionId=${sessionId}`);
        const data = await response.json();

        if (data.success && data.session) {
          const { status, lastStep, txHashes } = data.session;

          // Update step statuses based on lastStep
          if (lastStep >= 1 && txHashes?.approveTx) {
            updateStepStatus(2, { status: 'success', txHash: txHashes.approveTx });
          }
          if (lastStep >= 2 && txHashes?.swapPolTx) {
            updateStepStatus(3, { status: 'success', txHash: txHashes.swapPolTx });
          }
          if (lastStep >= 3 && txHashes?.swapUsdcETx) {
            updateStepStatus(4, { status: 'success', txHash: txHashes.swapUsdcETx });
          }

          if (status === 'COMPLETED') {
            clearInterval(interval);
            setCurrentStep(null);
            onComplete?.();
          } else if (status === 'FAILED') {
            clearInterval(interval);
            setError(data.session.errorMessage || 'Funding failed');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000); // Poll every 2 seconds

    setPollingInterval(interval);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const renderStepIcon = (stepNum: number) => {
    const step = steps[stepNum];

    switch (step.status) {
      case 'success':
        return <Check className="h-5 w-5 text-green-500" />;
      case 'signing':
      case 'confirming':
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return (
          <div className="h-5 w-5 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs text-gray-500">
            {stepNum}
          </div>
        );
    }
  };

  const renderStepStatus = (stepNum: number) => {
    const step = steps[stepNum];

    switch (step.status) {
      case 'success':
        return <span className="text-sm text-green-600">Completed</span>;
      case 'signing':
        return <span className="text-sm text-blue-600">Waiting for signature...</span>;
      case 'confirming':
        return <span className="text-sm text-blue-600">Confirming on-chain...</span>;
      case 'processing':
        return <span className="text-sm text-blue-600">Processing...</span>;
      case 'failed':
        return <span className="text-sm text-red-600">Failed</span>;
      default:
        return <span className="text-sm text-gray-500">Pending</span>;
    }
  };

  const allComplete = steps[4].status === 'success';

  // Show wallet connection prompt if not connected
  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Wallet Not Connected</CardTitle>
          <CardDescription>Please connect your wallet to fund your accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Connection Required</p>
                <p className="mt-1">
                  You need to connect your wallet to send USDC for funding.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Completion view
  if (allComplete) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Check className="h-6 w-6 text-green-500" />
            <CardTitle>Funding Complete!</CardTitle>
          </div>
          <CardDescription>Your wallets have been successfully funded</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preparedFunding && (
            <div className="space-y-2 text-sm bg-muted/30 p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operator received:</span>
                <span className="font-medium">
                  ~{preparedFunding.quotes.wmatic.expectedWmatic} POL
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Safe received:</span>
                <span className="font-medium">
                  ~${preparedFunding.quotes.usdcE.expectedUsdcE} USDC.e
                </span>
              </div>
            </div>
          )}

          <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
            Continue to Next Step
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Initial input view
  if (!preparedFunding) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fund Your Wallets</CardTitle>
          <CardDescription>
            Send USDC to fund both operator (for gas) and Safe (for trading)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsdcFundingInput
            userAddress={userAddress}
            userBalance={usdcBalance}
            onFundingPrepared={handleFundingPrepared}
          />
        </CardContent>
      </Card>
    );
  }

  // Transaction execution view
  return (
    <Card>
      <CardHeader>
        <CardTitle>Funding In Progress</CardTitle>
        <CardDescription>
          {currentStep === 1
            ? 'Send USDC to your operator wallet'
            : 'Processing automated swaps and transfers...'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Steps */}
        <div className="space-y-3">
          {USDC_FUNDING_STEPS.map((step) => {
            const stepNum = step.id;
            const stepState = steps[stepNum];
            const isCurrent = currentStep === stepNum;
            const canExecute = isCurrent && stepState.status === 'pending' && stepNum === 1;

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  isCurrent && 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20',
                  stepState.status === 'success' &&
                    'border-green-500 bg-green-50/50 dark:bg-green-950/20',
                  stepState.status === 'failed' && 'border-red-500 bg-red-50/50 dark:bg-red-950/20'
                )}
              >
                <div className="flex-shrink-0 mt-0.5">{renderStepIcon(stepNum)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{step.name}</p>
                    {renderStepStatus(stepNum)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{step.description}</p>

                  {stepState.txHash && (
                    <a
                      href={`https://polygonscan.com/tx/${stepState.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-2"
                    >
                      View transaction <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {stepState.error && (
                    <p className="text-xs text-red-600 mt-2">{stepState.error}</p>
                  )}

                  {canExecute && (
                    <Button
                      onClick={handleSendUsdc}
                      size="sm"
                      className="mt-3"
                      disabled={isSigning || isConfirming}
                    >
                      {isSigning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sign Transaction
                        </>
                      ) : (
                        'Send USDC'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm whitespace-pre-line">{error}</div>
            </div>
          </div>
        )}

        {/* Info Notice */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg border-t">
          <p className="font-medium mb-1">What&apos;s happening:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Step 1 requires your signature to send USDC</li>
            <li>Steps 2-5 are automated by the server</li>
            <li>Don&apos;t close this window until complete</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
