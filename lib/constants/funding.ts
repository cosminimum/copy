/**
 * Funding Configuration
 *
 * Constants for the automated funding flow that distributes USDC between
 * operator (swapped to POL for gas) and Safe (swapped to USDC.e for trading)
 */

export const FUNDING_CONFIG = {
  // Distribution split
  OPERATOR_SPLIT_BPS: 500,        // 5% to operator for gas
  SAFE_SPLIT_BPS: 9500,           // 95% to Safe (swapped to USDC.e)

  // Swap configuration
  SLIPPAGE_BPS: 100,              // 1% slippage tolerance
  UNISWAP_V3_FEE_WMATIC_USDC: 3000,     // 0.3% fee tier (WMATIC/USDC pairs)
  UNISWAP_V3_FEE_USDC_USDCE: 100,       // 0.01% fee tier (USDC/USDC.e pairs - stablecoin)

  // Minimum balances for onboarding completion
  MIN_OPERATOR_WMATIC: '0.1',     // Minimum WMATIC for operator (~10-20 trades worth of gas)
  MIN_SAFE_USDC: '1',             // Minimum USDC.e for Safe ($1 minimum)

  // Quote validity
  QUOTE_VALIDITY_MS: 120000,      // 2 minutes - re-quote if older

  // Recommended amounts for POL-based funding (legacy)
  RECOMMENDED_MIN_POL: '4',       // ~$2 at $0.50/POL - good starting amount
  RECOMMENDED_MAX_POL: '1000',    // ~$500 - reasonable upper bound for onboarding

  // Recommended amounts for USDC-based funding (new)
  RECOMMENDED_MIN_USDC: '0.01',   // $0.01 minimum for USDC funding (allow any amount)
  RECOMMENDED_MAX_USDC: '10000',  // $10,000 maximum for USDC funding
} as const;

// Contract addresses on Polygon
export const FUNDING_CONTRACTS = {
  WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',       // Native USDC (Circle)
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',     // Bridged USDC.e

  // QuickSwap V3 (Algebra DEX) - Primary DEX
  QUICKSWAP_V3_ROUTER: '0xf5b509bB0909a69B1c207E495f687a596C168E12',
  QUICKSWAP_V3_QUOTER: '0xa15F0D7377B2A0C0c10db057f641beD21028FC89',

  // Uniswap V3 (Fallback)
  UNISWAP_V3_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  UNISWAP_V3_QUOTER: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
} as const;

// Transaction step definitions for POL-based funding (legacy)
export const POL_FUNDING_STEPS = [
  {
    id: 1,
    name: 'Send POL to Operator',
    description: 'Transfer POL to operator wallet for gas fees',
  },
  {
    id: 2,
    name: 'Wrap POL to WMATIC',
    description: 'Convert POL to WMATIC for swapping',
  },
  {
    id: 3,
    name: 'Approve WMATIC',
    description: 'Allow Uniswap to swap your WMATIC',
  },
  {
    id: 4,
    name: 'Swap to USDC.e',
    description: 'Swap WMATIC to USDC.e and send to Safe',
  },
] as const;

// Transaction step definitions for USDC-based funding (User executes all swaps)
export const USDC_FUNDING_STEPS = [
  {
    id: 1,
    name: 'Approve USDC',
    description: 'Allow QuickSwap to swap your USDC',
    requiresUserAction: true,
  },
  {
    id: 2,
    name: 'Swap USDC → POL',
    description: 'Swap 5% USDC to POL for operator gas',
    requiresUserAction: true,
  },
  {
    id: 3,
    name: 'Send POL to Operator',
    description: 'Transfer POL to operator for gas fees',
    requiresUserAction: true,
  },
  {
    id: 4,
    name: 'Swap USDC → USDC.e',
    description: 'Swap 95% USDC to USDC.e for trading',
    requiresUserAction: true,
  },
  {
    id: 5,
    name: 'Send USDC.e to Safe',
    description: 'Transfer USDC.e to Safe wallet for trading',
    requiresUserAction: true,
  },
  {
    id: 6,
    name: 'Verify Completion',
    description: 'Confirm all funds received',
    requiresUserAction: false,
  },
] as const;

export type PolFundingStep = 1 | 2 | 3 | 4;
export type UsdcFundingStep = 1 | 2 | 3 | 4 | 5 | 6;
export type FundingStepStatus = 'pending' | 'signing' | 'confirming' | 'success' | 'failed';
