/**
 * Operator Wallet Derivation
 *
 * Deterministically derives unique operator wallets for each user using:
 *   operatorPrivateKey = keccak256(MASTER_OPERATOR_PRIVATE_KEY + userEOA)
 *
 * Benefits:
 * - No need to store individual operator private keys
 * - Reproducible from user EOA + master key
 * - Each user gets unique operator address
 * - Scales infinitely without key management overhead
 *
 * Security:
 * - MASTER_OPERATOR_PRIVATE_KEY must be kept secret (AWS Secrets Manager, Vault, etc.)
 * - Operator can only sign orders, cannot transfer funds (guard restricted)
 * - User funds stay in Safe under user's control
 */

import { ethers } from 'ethers';

/**
 * Derive a unique operator wallet for a user
 *
 * @param userEOA User's EOA address (wallet address)
 * @returns Operator wallet (ethers.Wallet) with private key derived deterministically
 *
 * @example
 * ```ts
 * const operator = deriveOperatorWallet('0xbdf3fbccbd4612ab56c770e1ad6eb982040e7254');
 * console.log(operator.address); // 0x084d7...
 * ```
 */
export function deriveOperatorWallet(userEOA: string): ethers.Wallet {
  const masterKey = process.env.MASTER_OPERATOR_PRIVATE_KEY;

  if (!masterKey) {
    throw new Error('MASTER_OPERATOR_PRIVATE_KEY not found in environment');
  }

  if (!masterKey.startsWith('0x') || masterKey.length !== 66) {
    throw new Error('Invalid MASTER_OPERATOR_PRIVATE_KEY format (must be 0x + 64 hex chars)');
  }

  // Normalize user address (checksum)
  const normalizedAddress = ethers.getAddress(userEOA);

  // Derive operator private key: keccak256(MASTER_KEY + userEOA)
  const operatorPrivateKey = ethers.solidityPackedKeccak256(
    ['string', 'address'],
    [masterKey, normalizedAddress]
  );

  // Create wallet from derived private key
  return new ethers.Wallet(operatorPrivateKey);
}

/**
 * Derive operator wallet and connect to provider
 *
 * @param userEOA User's EOA address
 * @param provider Ethers provider (RPC connection)
 * @returns Connected operator wallet
 *
 * @example
 * ```ts
 * const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
 * const operator = deriveOperatorWalletWithProvider('0xbdf3...', provider);
 * const balance = await operator.provider.getBalance(operator.address);
 * ```
 */
export function deriveOperatorWalletWithProvider(
  userEOA: string,
  provider: ethers.Provider
): ethers.Wallet {
  const wallet = deriveOperatorWallet(userEOA);
  return wallet.connect(provider);
}

/**
 * Get operator address without creating wallet (for lookups)
 *
 * @param userEOA User's EOA address
 * @returns Operator address (no private key exposure)
 *
 * @example
 * ```ts
 * const operatorAddr = getOperatorAddress('0xbdf3...');
 * console.log(operatorAddr); // 0x084d7...
 * ```
 */
export function getOperatorAddress(userEOA: string): string {
  const wallet = deriveOperatorWallet(userEOA);
  return wallet.address;
}

/**
 * Validate that an operator address matches the expected derivation
 *
 * @param userEOA User's EOA address
 * @param operatorAddress Operator address to validate
 * @returns True if operator address is correctly derived from user EOA
 *
 * @example
 * ```ts
 * const isValid = validateOperatorDerivation(
 *   '0xbdf3...',
 *   '0x084d7...'
 * );
 * console.log(isValid); // true
 * ```
 */
export function validateOperatorDerivation(
  userEOA: string,
  operatorAddress: string
): boolean {
  try {
    const expectedAddress = getOperatorAddress(userEOA);
    return expectedAddress.toLowerCase() === operatorAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Batch derive operator addresses for multiple users
 *
 * @param userEOAs Array of user EOA addresses
 * @returns Map of userEOA => operatorAddress
 *
 * @example
 * ```ts
 * const operators = batchDeriveOperatorAddresses([
 *   '0xuser1...',
 *   '0xuser2...',
 *   '0xuser3...',
 * ]);
 * console.log(operators);
 * // {
 * //   '0xuser1...': '0xoperator1...',
 * //   '0xuser2...': '0xoperator2...',
 * //   '0xuser3...': '0xoperator3...',
 * // }
 * ```
 */
export function batchDeriveOperatorAddresses(
  userEOAs: string[]
): Record<string, string> {
  const operators: Record<string, string> = {};

  for (const userEOA of userEOAs) {
    try {
      operators[ethers.getAddress(userEOA)] = getOperatorAddress(userEOA);
    } catch (error) {
      console.error(`Failed to derive operator for ${userEOA}:`, error);
    }
  }

  return operators;
}

// Type exports
export interface OperatorDerivationInfo {
  userEOA: string;
  operatorAddress: string;
  operatorWallet?: ethers.Wallet; // Optional, includes private key
}

/**
 * Get full operator derivation info
 *
 * @param userEOA User's EOA address
 * @param includeWallet Whether to include wallet with private key
 * @returns Derivation information
 */
export function getOperatorInfo(
  userEOA: string,
  includeWallet: boolean = false
): OperatorDerivationInfo {
  const normalizedEOA = ethers.getAddress(userEOA);
  const operatorAddress = getOperatorAddress(normalizedEOA);

  const info: OperatorDerivationInfo = {
    userEOA: normalizedEOA,
    operatorAddress,
  };

  if (includeWallet) {
    info.operatorWallet = deriveOperatorWallet(normalizedEOA);
  }

  return info;
}
