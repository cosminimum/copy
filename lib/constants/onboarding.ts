/**
 * Onboarding Flow Constants
 *
 * Defines minimum balances, timeouts, polling intervals, and other configuration
 * for the onboarding flow.
 */

export const ONBOARDING_CONSTANTS = {
  // Minimum balances required to complete onboarding (very low to build trust)
  MIN_POL_BALANCE: 0.1 * 1e18, // 0.1 POL token in wei (just enough for gas)
  MIN_USDC_BALANCE: 0.01 * 1e6, // $0.01 USDC.e in smallest unit (any amount welcome!)

  // Recommended amounts shown to users
  RECOMMENDED_POL: '1-5 POL (for gas fees)',
  RECOMMENDED_USDC: 'Any amount - start small to test!',

  // Polling intervals (milliseconds)
  BALANCE_POLL_INTERVAL: 10000, // 10 seconds - poll for balance updates (reduced from 5s to prevent flickering)

  // Timeouts for blockchain operations (milliseconds)
  SAFE_DEPLOYMENT_TIMEOUT: 60000, // 60 seconds
  SETUP_TRANSACTION_TIMEOUT: 120000, // 2 minutes (5 transactions total)
  SINGLE_TRANSACTION_TIMEOUT: 30000, // 30 seconds per transaction

  // Retry configuration
  MAX_RETRIES: 3, // Maximum retry attempts per transaction
  RETRY_DELAY: 5000, // 5 seconds between retries

  // Token addresses on Polygon
  USDC_E_ADDRESS: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Bridged USDC (USDC.e)
  NATIVE_USDC_ADDRESS: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Native USDC
  POL_ADDRESS: '0x0000000000000000000000000000000000001010', // POL (native token)

  // Expected time estimates (for UI display)
  EXPECTED_TIMES: {
    WELCOME: '~30 seconds',
    DEPLOY_SAFE: '~10-20 seconds',
    FUND_POL: 'User-dependent (instant if you have POL, or 5-10 minutes to acquire it)',
    DEPOSIT_USDC: 'User-dependent (instant to 10 mins)',
    COMPLETE_SETUP: '~15-25 seconds (5 blockchain transactions)',
    REVIEW: 'Instant (just backend verification)',
    SUCCESS: 'Celebrate! 🎉',
  },
} as const

/**
 * Onboarding step definitions
 */
export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const ONBOARDING_STEP_NAMES: Record<OnboardingStep, string> = {
  0: 'Welcome',
  1: 'Deploy Safe',
  2: 'Fund Operator (POL)',
  3: 'Deposit Trading Capital (USDC.e)',
  4: 'Complete Security Setup',
  5: 'Review & Finalize',
  6: 'Success',
}

/**
 * Trusted swap/exchange domains for SafeExternalLink component
 */
export const TRUSTED_SWAP_DOMAINS = [
  'quickswap.exchange',
  'app.uniswap.org',
  'app.1inch.io',
  'swap.defillama.com',
] as const

/**
 * Helper functions for working with balances
 */
export const formatUsdcBalance = (balance: bigint): string => {
  return `$${(Number(balance) / 1e6).toFixed(2)}`
}

export const formatPolBalance = (balance: bigint): string => {
  return `${(Number(balance) / 1e18).toFixed(2)} POL`
}
