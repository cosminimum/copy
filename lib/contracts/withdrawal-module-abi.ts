/**
 * UserWithdrawalModule Contract Configuration
 *
 * This module allows authorized users to withdraw tokens from their Safe
 * without requiring the operator's signature.
 */

// Contract Addresses on Polygon
export const USER_WITHDRAWAL_MODULE = '0x9C4d41503aCbF6433f7D73a1507FDF8845Be4e49' as const
export const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const

// UserWithdrawalModule ABI (JSON format for wagmi/viem)
export const USER_WITHDRAWAL_MODULE_ABI = [
  {
    name: 'isAuthorized',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'safe', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getAuthorizedUser',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'safe', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'withdrawToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'safe', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdrawAllTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'safe', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'authorizeUser',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [],
  },
  {
    name: 'revokeUser',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

// ERC20 ABI (minimal, for balance checks)
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const
