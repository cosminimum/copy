'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useOnboardingState } from '@/lib/hooks/use-onboarding-state'
import { ONBOARDING_STEP_NAMES, type OnboardingStep } from '@/lib/constants/onboarding'
import {
  WelcomeStep,
  DeploySafeStep,
  FundOperatorStep,
  DepositUsdcStep,
  CompleteSetupStep,
  ReviewStep,
  SuccessStep,
} from './onboarding-steps'

interface OnboardingModalProps {
  onComplete?: () => void
}

/**
 * OnboardingModal - Main onboarding flow modal
 *
 * This modal manages the entire onboarding flow:
 * - Cannot be closed until onboarding is complete
 * - Shows progress through all 7 steps
 * - Automatically advances when conditions are met
 * - Handles errors and retries
 * - Fires confetti on success 🎉
 */
export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const { update: updateSession } = useSession()
  const {
    currentStep,
    isLoading,
    error,
    status,
    refreshStatus,
    completeOnboarding,
    lockStep,
    unlockStep,
  } = useOnboardingState()

  // Total steps (0-6 = 7 steps)
  const totalSteps = 7
  const progressPercent = (currentStep / (totalSteps - 1)) * 100

  /**
   * Handle step completion
   */
  const handleNext = () => {
    // Steps automatically advance via the status hook
    // which fetches status from backend
    refreshStatus()
  }

  /**
   * Handle final completion (when user clicks "Start Trading" on success screen)
   */
  const handleComplete = async () => {
    // Refetch session to update user object with onboardingCompletedAt
    await updateSession()

    // Call the completion callback
    if (onComplete) {
      onComplete()
    }
  }

  /**
   * Render the current step component
   */
  const renderStep = () => {
    const stepProps = {
      currentStep,
      onNext: handleNext,
      onRefreshStatus: refreshStatus,
      status,
      lockStep,
      unlockStep,
    }

    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={handleNext} />
      case 1:
        return <DeploySafeStep {...stepProps} />
      case 2:
        return <FundOperatorStep {...stepProps} />
      case 3:
        return <DepositUsdcStep {...stepProps} />
      case 4:
        return <CompleteSetupStep {...stepProps} />
      case 5:
        return <ReviewStep {...stepProps} />
      case 6:
        return <SuccessStep status={status} onComplete={handleComplete} />
      default:
        return <WelcomeStep onNext={handleNext} />
    }
  }

  // Always show modal (can't be closed until complete)
  return (
    <Dialog open={true} modal={true}>
      <DialogContent
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Remove close button - can't close until complete
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Progress Header */}
        <DialogHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <DialogTitle>Setup Your Trading Wallet</DialogTitle>
            <Badge variant="outline">
              Step {currentStep + 1} of {totalSteps}
            </Badge>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{ONBOARDING_STEP_NAMES[currentStep]}</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
          </div>
        </DialogHeader>

        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Step Content */}
        <div className="py-4">
          {isLoading && currentStep === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            renderStep()
          )}
        </div>

        {/* Debug info (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-2 bg-muted rounded text-xs">
            <div>Current Step: {currentStep}</div>
            <div>Status: {status?.message}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
