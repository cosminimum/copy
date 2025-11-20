'use client'

/**
 * Swap Transaction Status Modal
 *
 * Displays progress for multi-step POL → USDC.e swap transaction
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { TransactionStep } from '@/lib/transactions/pol-to-usdc-flow'
import { Button } from '@/components/ui/button'

interface SwapStatusModalProps {
  open: boolean
  currentStep: TransactionStep
  completedSteps: TransactionStep[]
  error?: string
  txHashes: {
    polTransfer?: string
    swap?: string
    usdcTransfer?: string
  }
  amounts: {
    totalPol: string
    polToSwap: string
    polToKeep: string
    expectedUsdc: string
    actualUsdc?: string
  }
  onClose?: () => void
}

interface Step {
  id: TransactionStep
  label: string
  description: string
}

const STEPS: Step[] = [
  {
    id: 'transferring_pol',
    label: 'Transfer POL',
    description: 'Sending POL from your wallet to operator',
  },
  {
    id: 'swapping_to_usdc',
    label: 'Swap to USDC.e',
    description: 'Converting POL to USDC.e via QuickSwap',
  },
  {
    id: 'transferring_usdc',
    label: 'Transfer USDC.e',
    description: 'Sending USDC.e to your Safe wallet',
  },
]

export function SwapStatusModal({
  open,
  currentStep,
  completedSteps,
  error,
  txHashes,
  amounts,
  onClose,
}: SwapStatusModalProps) {
  const getStepStatus = (stepId: TransactionStep): 'pending' | 'in_progress' | 'completed' | 'failed' => {
    if (currentStep === 'failed') {
      // When failed, mark the current failing step and show completed steps as completed
      const lastCompletedIndex = STEPS.findIndex((s) => completedSteps.includes(s.id) && !STEPS.slice(STEPS.findIndex(step => step.id === s.id) + 1).some(laterStep => completedSteps.includes(laterStep.id)))
      const stepIndex = STEPS.findIndex((s) => s.id === stepId)

      if (completedSteps.includes(stepId)) return 'completed'
      if (stepIndex === lastCompletedIndex + 1) return 'failed'
      return 'pending'
    }

    if (completedSteps.includes(stepId)) return 'completed'
    if (currentStep === stepId) return 'in_progress'
    return 'pending'
  }

  const getTxHash = (stepId: TransactionStep): string | undefined => {
    if (stepId === 'transferring_pol') return txHashes.polTransfer
    if (stepId === 'swapping_to_usdc') return txHashes.swap
    if (stepId === 'transferring_usdc') return txHashes.usdcTransfer
    return undefined
  }

  const isCompleted = currentStep === 'completed'
  const isFailed = currentStep === 'failed'
  const canClose = isCompleted || isFailed

  return (
    <Dialog open={open} onOpenChange={canClose ? onClose : undefined}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => !canClose && e.preventDefault()}
        onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
        onInteractOutside={(e) => !canClose && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {isCompleted ? 'Swap Completed!' : isFailed ? 'Swap Failed' : 'Processing Swap'}
          </DialogTitle>
          <DialogDescription>
            {isCompleted
              ? 'Your POL has been successfully converted to USDC.e'
              : isFailed
                ? 'An error occurred during the swap process'
                : 'Please wait while we process your transaction'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Steps */}
          <div className="space-y-3">
            {STEPS.map((step, index) => {
              const status = getStepStatus(step.id)
              const txHash = getTxHash(step.id)

              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    status === 'in_progress'
                      ? 'bg-primary/5 border-primary'
                      : status === 'completed'
                        ? 'bg-green-500/5 border-green-500/20'
                        : status === 'failed'
                          ? 'bg-red-500/5 border-red-500/20'
                          : 'bg-muted/50'
                  }`}
                >
                  {/* Icon */}
                  <div className="mt-0.5">
                    {status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : status === 'failed' ? (
                      <XCircle className="h-5 w-5 text-red-600" />
                    ) : status === 'in_progress' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">
                        {index + 1}. {step.label}
                      </p>
                      {txHash && (
                        <a
                          href={`https://polygonscan.com/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-600 font-medium">Error</p>
              <p className="text-xs text-red-600/80 mt-1">{error}</p>
            </div>
          )}

          {/* Summary */}
          {(isCompleted || amounts.actualUsdc) && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2">
              <p className="text-sm font-medium text-green-700">Summary</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>POL sent:</span>
                  <span className="font-medium text-foreground">{amounts.totalPol} POL</span>
                </div>
                <div className="flex justify-between">
                  <span>USDC.e received:</span>
                  <span className="font-medium text-foreground">
                    {amounts.actualUsdc || amounts.expectedUsdc} USDC.e
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Operator funded:</span>
                  <span className="font-medium text-foreground">{amounts.polToKeep} POL</span>
                </div>
              </div>
            </div>
          )}

          {/* Close Button */}
          {canClose && onClose && (
            <Button onClick={onClose} className="w-full" variant={isFailed ? 'outline' : 'default'}>
              {isFailed ? 'Close' : 'Continue'}
            </Button>
          )}

          {/* Info */}
          {!canClose && (
            <p className="text-xs text-center text-muted-foreground">
              Please do not close this window or refresh the page
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
