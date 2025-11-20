/**
 * DEX (Decentralized Exchange) Constants for Polygon Network
 *
 * Used for token swaps via QuickSwap and other DEX protocols
 */

// QuickSwap V2 Router on Polygon
export const QUICKSWAP_ROUTER_V2 = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'

// Token Addresses on Polygon
export const WMATIC_ADDRESS = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' as const // Wrapped MATIC (POL)
export const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const // Bridged USDC (USDC.e)

// Swap Configuration
export const DEFAULT_SLIPPAGE_PERCENT = 0.5 // 0.5% slippage tolerance
export const DEFAULT_DEADLINE_MINUTES = 20 // 20 minutes from now

// Minimum amounts for swaps
export const MIN_POL_FOR_SWAP = '1' // 1 POL minimum to swap
export const POL_TO_OPERATOR_PERCENT = 5 // 5% kept in operator for gas
export const POL_TO_SWAP_PERCENT = 95 // 95% swapped to USDC.e

// Gas settings
export const SWAP_GAS_LIMIT = 300000n // Estimated gas for swap transaction
