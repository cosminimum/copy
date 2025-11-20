/**
 * UserWithdrawalModule Contract Configuration
 *
 * This module allows authorized users to withdraw tokens from their Safe
 * without requiring the operator's signature.
 */

// Contract Addresses on Polygon
export const USER_WITHDRAWAL_MODULE = '0x9C4d41503aCbF6433f7D73a1507FDF8845Be4e49' as const
export const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const

// UserWithdrawalModule ABI
export const USER_WITHDRAWAL_MODULE_ABI = [
  // View functions
  'function isAuthorized(address safe, address user) external view returns (bool)',
  'function getAuthorizedUser(address safe) external view returns (address)',

  // Withdrawal functions (user-callable)
  'function withdrawToken(address safe, address token, uint256 amount) external',
  'function withdrawAllTokens(address safe, address token) external',

  // Admin functions (operator-only, for setup)
  'function authorizeUser(address user) external',
  'function revokeUser() external',
] as const

// ERC20 ABI (minimal, for balance checks)
export const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
] as const
