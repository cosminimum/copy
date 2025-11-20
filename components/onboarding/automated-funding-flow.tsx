/**
 * Automated Funding Flow Component
 *
 * Handles the 4-step funding process with visual feedback and state management
 */

'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, AlertCircle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useAutomatedFunding, type FundingStep } from '@/lib/hooks/use-automated-funding';
import { POL_FUNDING_STEPS } from '@/lib/constants/funding';
import { cn } from '@/lib/utils';

interface AutomatedFundingFlowProps {
  onComplete?: () => void;
  onManualFallback?: () => void;
}

export function AutomatedFundingFlow({ onComplete, onManualFallback }: AutomatedFundingFlowProps) {
  const [polAmount, setPolAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const {
    state,
    preparedData,
    prepare,
    executeStep1,
    executeStep2,
    executeStep3,
    executeStep4,
    reset,
    isExecuting,
    needsQuoteRefresh,
  } = useAutomatedFunding();

  // Check if wallet is connected
  const { address, isConnected } = useAccount();

  const isStarted = state.sessionId !== null;
  const allComplete = state.steps.step4.status === 'success';

  // Show wallet connection prompt if not connected
  if (!isConnected || !address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Wallet Not Connected</CardTitle>
          <CardDescription>Please connect your wallet to use automated funding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Connection Required</p>
                <p className="mt-1">
                  You need to connect your wallet to use the automated funding feature. This allows us to help you sign the necessary transactions.
                </p>
              </div>
            </div>
          </div>

          <Button onClick={onManualFallback} variant="outline" className="w-full">
            Use Manual Funding Instead
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handlePrepare = async () => {
    setError(null);
    try {
      await prepare(polAmount);
    } catch (err) {
      console.error('Prepare funding error:', err);
      setError(err instanceof Error ? err.message : 'Failed to prepare funding');
    }
  };

  const handleExecuteStep = async (step: FundingStep) => {
    console.log('[handleExecuteStep] Starting step:', step);
    setError(null);
    try {
      switch (step) {
        case 1:
          console.log('[handleExecuteStep] Executing step 1');
          await executeStep1();
          break;
        case 2:
          console.log('[handleExecuteStep] Executing step 2');
          await executeStep2();
          break;
        case 3:
          console.log('[handleExecuteStep] Executing step 3');
          await executeStep3();
          break;
        case 4:
          console.log('[handleExecuteStep] Executing step 4');
          if (needsQuoteRefresh()) {
            setError('Quote expired. Please start over with a fresh quote.');
            return;
          }
          await executeStep4();
          break;
      }

      // Check if all done
      if (step === 4) {
        onComplete?.();
      }
    } catch (err) {
      console.error('[handleExecuteStep] Error:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
    }
  };

  const handleReset = () => {
    reset();
    setPolAmount('');
    setError(null);
    setShowDetails(false);
  };

  // Render step status icon
  const renderStepIcon = (step: FundingStep) => {
    const stepState = state.steps[`step${step}`];

    switch (stepState.status) {
      case 'success':
        return <Check className="h-5 w-5 text-green-500" />;
      case 'signing':
      case 'confirming':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return (
          <div className="h-5 w-5 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs text-gray-500">
            {step}
          </div>
        );
    }
  };

  // Render step status text
  const renderStepStatus = (step: FundingStep) => {
    const stepState = state.steps[`step${step}`];

    switch (stepState.status) {
      case 'success':
        return <span className="text-sm text-green-600">Completed</span>;
      case 'signing':
        return <span className="text-sm text-blue-600">Waiting for signature...</span>;
      case 'confirming':
        return <span className="text-sm text-blue-600">Confirming on-chain...</span>;
      case 'failed':
        return <span className="text-sm text-red-600">Failed</span>;
      default:
        return <span className="text-sm text-gray-500">Pending</span>;
    }
  };

  if (allComplete) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Check className="h-6 w-6 text-green-500" />
            <CardTitle>Funding Complete!</CardTitle>
          </div>
          <CardDescription>
            Your operator and Safe have been successfully funded
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preparedData && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operator received:</span>
                <span className="font-medium">{preparedData.distribution.operatorPol} POL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Safe received:</span>
                <span className="font-medium">~{preparedData.quote.expectedUsdc} USDC.e</span>
              </div>
            </div>
          )}

          <Button onClick={handleReset} variant="outline" className="w-full">
            Fund Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isStarted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Automated Funding</CardTitle>
          <CardDescription>
            Fund both your operator and Safe in one flow. You&apos;ll sign 4 transactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="pol-amount" className="text-sm font-medium">
              POL Amount
            </label>
            <Input
              id="pol-amount"
              type="number"
              step="0.1"
              min="4"
              max="1000"
              placeholder="4.0"
              value={polAmount}
              onChange={(e) => setPolAmount(e.target.value)}
              disabled={isExecuting}
            />
            <p className="text-xs text-muted-foreground">
              Recommended: 4-10 POL. Minimum: 4 POL
            </p>
          </div>

          {preparedData && (
            <div className="bg-muted p-3 rounded-md space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operator (5% for gas):</span>
                <span className="font-medium">{preparedData.distribution.operatorPol} POL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Safe (95% swapped):</span>
                <span className="font-medium">~{preparedData.quote.expectedUsdc} USDC.e</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Button onClick={handlePrepare} disabled={!polAmount || isExecuting} className="w-full">
              {isExecuting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing...
                </>
              ) : (
                'Get Quote & Start'
              )}
            </Button>

            <Button
              onClick={onManualFallback}
              variant="ghost"
              className="w-full text-xs"
              type="button"
            >
              Fund Manually Instead
            </Button>
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium">What happens next:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Send POL to operator (for gas fees)</li>
              <li>Wrap POL to WMATIC</li>
              <li>Approve WMATIC for swapping</li>
              <li>Swap WMATIC → USDC.e and send to Safe</li>
            </ol>
          </div>
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
          Complete each transaction step. Don&apos;t close this window.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Steps */}
        <div className="space-y-3">
          {POL_FUNDING_STEPS.map((step) => {
            const stepNum = step.id as FundingStep;
            const stepState = state.steps[`step${stepNum}`];
            const isCurrent = state.currentStep === stepNum;
            const canExecute =
              isCurrent &&
              (stepState.status === 'pending' || stepState.status === 'failed') &&
              !isExecuting;

            console.log(`[Step ${stepNum}]`, {
              isCurrent,
              status: stepState.status,
              isExecuting,
              canExecute,
              currentStep: state.currentStep
            });

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  isCurrent && 'border-blue-500 bg-blue-50/50',
                  stepState.status === 'success' && 'border-green-500 bg-green-50/50',
                  stepState.status === 'failed' && 'border-red-500 bg-red-50/50'
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
                      onClick={() => handleExecuteStep(stepNum)}
                      size="sm"
                      className="mt-2"
                      disabled={isExecuting}
                    >
                      {stepState.status === 'failed' ? 'Retry' : 'Execute'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Distribution Details */}
        {preparedData && (
          <div className="border-t pt-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center justify-between w-full text-sm font-medium"
            >
              <span>Distribution Details</span>
              {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showDetails && (
              <div className="mt-3 space-y-2 text-sm bg-muted p-3 rounded-md">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total POL:</span>
                  <span>{preparedData.distribution.totalPol} POL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Operator Address:</span>
                  <span className="font-mono text-xs">{preparedData.operatorAddress.slice(0, 10)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Safe Address:</span>
                  <span className="font-mono text-xs">{preparedData.safeAddress.slice(0, 10)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected USDC.e:</span>
                  <span>~{preparedData.quote.expectedUsdc} USDC.e</span>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleReset} variant="outline" className="flex-1">
            Start Over
          </Button>
          <Button onClick={onManualFallback} variant="ghost" className="flex-1">
            Switch to Manual
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
