import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { type OnboardingStep } from '@/lib/constants/onboarding'

interface OnboardingStatus {
  currentStep: OnboardingStep
  isComplete: boolean
  safeAddress?: string
  operatorAddress?: string
  message?: string
  [key: string]: any
}

interface UseOnboardingStateReturn {
  currentStep: OnboardingStep
  isLoading: boolean
  error: string | null
  status: OnboardingStatus | null
  refreshStatus: () => Promise<void>
  goToStep: (step: OnboardingStep) => void
  completeOnboarding: () => Promise<{ success: boolean; error?: string }>
  lockStep: () => void
  unlockStep: () => void
}

/**
 * useOnboardingState - Manage onboarding flow state
 *
 * This hook implements the onboarding state machine with deterministic recovery:
 * - Fetches current onboarding status from backend
 * - Backend queries blockchain state (balances, deployments)
 * - Blockchain state is source of truth for step progression
 * - LocalStorage used only as cache, backend always wins
 *
 * State hierarchy (deterministic):
 * 1. Backend state (database + blockchain queries)
 * 2. Blockchain state (if backend unavailable)
 * 3. localStorage (fallback only)
 *
 * Anti-flicker mechanisms:
 * - Only allows forward step progression (never backward)
 * - Debounces step changes (minimum 500ms between changes)
 * - Prevents concurrent API calls
 * - Locks step during transitions
 */
export function useOnboardingState(): UseOnboardingStateReturn {
  const { data: session, status: sessionStatus } = useSession()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<OnboardingStatus | null>(null)

  // Anti-flicker mechanisms
  const isFetchingRef = useRef(false) // Prevent concurrent API calls
  const lastStepChangeRef = useRef<number>(Date.now()) // Track last step change time
  const stepLockRef = useRef(false) // Lock step during transitions

  /**
   * Fetch current onboarding status from backend with anti-flicker protection
   */
  const fetchStatus = useCallback(async (force = false) => {
    if (sessionStatus !== 'authenticated') {
      return
    }

    // Prevent concurrent API calls
    if (isFetchingRef.current && !force) {
      console.log('[useOnboardingState] Skipping fetch - already in progress')
      return
    }

    // Respect step lock during transitions
    if (stepLockRef.current && !force) {
      console.log('[useOnboardingState] Skipping fetch - step locked during transition')
      return
    }

    isFetchingRef.current = true

    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/onboarding/status')
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.statusText}`)
      }

      const data = await response.json()
      setStatus(data)

      // Only update step if it's moving forward (prevent backward flicker)
      const newStep = data.currentStep
      const now = Date.now()
      const timeSinceLastChange = now - lastStepChangeRef.current
      const MIN_STEP_CHANGE_DELAY = 500 // 500ms minimum between step changes

      if (newStep > currentStep) {
        // Moving forward - allow immediately (but respect debounce)
        if (timeSinceLastChange >= MIN_STEP_CHANGE_DELAY || force) {
          console.log(`[useOnboardingState] Step change: ${currentStep} → ${newStep}`)
          setCurrentStep(newStep)
          lastStepChangeRef.current = now
        } else {
          console.log(`[useOnboardingState] Debouncing step change (${timeSinceLastChange}ms < ${MIN_STEP_CHANGE_DELAY}ms)`)
        }
      } else if (newStep < currentStep) {
        // Moving backward - only allow if forced or initial load
        if (force || currentStep === 0) {
          console.log(`[useOnboardingState] Backward step change (forced): ${currentStep} → ${newStep}`)
          setCurrentStep(newStep)
          lastStepChangeRef.current = now
        } else {
          console.log(`[useOnboardingState] Blocked backward step change: ${currentStep} ↛ ${newStep}`)
        }
      }
      // If newStep === currentStep, do nothing (no flicker)

      // Save to localStorage for cache (but backend is always source of truth)
      localStorage.setItem('onboarding_cache', JSON.stringify({
        step: newStep,
        timestamp: Date.now(),
      }))
    } catch (err: any) {
      console.error('[useOnboardingState] fetchStatus error:', err)
      setError(err.message)

      // Try to recover from localStorage cache
      const cache = localStorage.getItem('onboarding_cache')
      if (cache) {
        try {
          const { step, timestamp } = JSON.parse(cache)
          // Only use cache if less than 5 minutes old
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            setCurrentStep(step)
            console.log('[useOnboardingState] Using cached step:', step)
          }
        } catch {
          // Invalid cache, ignore
        }
      }
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [sessionStatus, currentStep])

  /**
   * Complete onboarding - marks as complete in backend
   */
  const completeOnboarding = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Failed to complete onboarding',
        }
      }

      // Clear localStorage cache
      localStorage.removeItem('onboarding_cache')

      // Update state
      setCurrentStep(6)
      setStatus({ ...status!, currentStep: 6, isComplete: true })

      return { success: true }
    } catch (err: any) {
      console.error('[useOnboardingState] completeOnboarding error:', err)
      return {
        success: false,
        error: err.message,
      }
    } finally {
      setIsLoading(false)
    }
  }, [status])

  /**
   * Manually go to a specific step (for testing/debugging)
   */
  const goToStep = useCallback((step: OnboardingStep) => {
    console.log(`[useOnboardingState] Manual step change: ${currentStep} → ${step}`)
    setCurrentStep(step)
    lastStepChangeRef.current = Date.now()
  }, [currentStep])

  /**
   * Lock step to prevent changes during transitions
   */
  const lockStep = useCallback(() => {
    console.log('[useOnboardingState] Locking step')
    stepLockRef.current = true
  }, [])

  /**
   * Unlock step to allow changes
   */
  const unlockStep = useCallback(() => {
    console.log('[useOnboardingState] Unlocking step')
    stepLockRef.current = false
  }, [])

  /**
   * Fetch status on mount and when session changes (force initial load)
   */
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchStatus(true) // Force initial load
    }
  }, [sessionStatus]) // Don't include fetchStatus to avoid re-fetching

  /**
   * Handle page visibility change - refetch when page becomes visible
   * This ensures we have latest state if user switched tabs during deposit
   * Debounced to prevent multiple rapid calls
   */
  useEffect(() => {
    let visibilityTimeout: NodeJS.Timeout

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionStatus === 'authenticated') {
        // Debounce visibility change refresh (wait 1 second after becoming visible)
        clearTimeout(visibilityTimeout)
        visibilityTimeout = setTimeout(() => {
          fetchStatus(false) // Don't force - respect locks
        }, 1000)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      clearTimeout(visibilityTimeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [sessionStatus]) // Don't include fetchStatus

  return {
    currentStep,
    isLoading,
    error,
    status,
    refreshStatus: fetchStatus,
    goToStep,
    completeOnboarding,
    lockStep,
    unlockStep,
  }
}

/**
 * Helper hook for auto-refreshing balance during deposit steps
 * Less aggressive than before - uses 10 second intervals by default
 */
export function useAutoRefresh(
  enabled: boolean,
  refreshFn: () => Promise<void>,
  interval: number = 10000 // Increased from 5s to 10s to reduce load
) {
  useEffect(() => {
    if (!enabled) return

    // Initial fetch (delayed slightly to avoid concurrent calls on mount)
    const initialTimeout = setTimeout(() => {
      refreshFn()
    }, 1000)

    // Set up interval for subsequent fetches
    const intervalId = setInterval(refreshFn, interval)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(intervalId)
    }
  }, [enabled, interval]) // Don't include refreshFn to avoid re-creating intervals
}
