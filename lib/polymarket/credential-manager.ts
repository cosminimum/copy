/**
 * CLOB API Credential Manager
 *
 * Handles creation and storage of Polymarket CLOB API credentials per operator.
 *
 * Architecture:
 * - Each operator gets unique CLOB API credentials
 * - Credentials stored in database (OperatorCredential model)
 * - Uses ClobClient.createOrDeriveApiKey() for generation
 * - Implements ethers v5 compatibility wrapper for _signTypedData
 *
 * Flow:
 * 1. Derive operator wallet from user EOA
 * 2. Create v5-compatible wallet wrapper
 * 3. Generate CLOB API credentials via ClobClient
 * 4. Store in database
 * 5. Load credentials when needed for trading
 */

import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { PrismaClient } from '@prisma/client';
import { configureAxiosForCloudflare } from './axios-config';

const prisma = new PrismaClient();

export interface CLOBCredentials {
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
}

export interface StoredCredentials extends CLOBCredentials {
  operatorAddress: string;
  userId: string;
  createdAt: Date;
}

/**
 * Create ethers v6 wallet compatible with v5 signature methods
 *
 * The @polymarket/clob-client expects ethers v5's _signTypedData method,
 * but ethers v6 uses signTypedData. This proxy bridges the gap.
 *
 * @param privateKey Operator private key
 * @returns Proxied wallet with v5 compatibility
 */
export function createV5CompatibleWallet(privateKey: string): any {
  const wallet = new ethers.Wallet(privateKey);

  return new Proxy(wallet, {
    get(target: any, prop: string) {
      // Map v5's _signTypedData to v6's signTypedData
      if (prop === '_signTypedData') {
        return async (domain: any, types: any, value: any) => {
          return target.signTypedData(domain, types, value);
        };
      }
      return target[prop];
    },
  });
}

/**
 * Create CLOB API credentials for an operator
 *
 * @param operatorPrivateKey Operator's private key
 * @param chainId Chain ID (137 for Polygon mainnet)
 * @returns CLOB API credentials (key, secret, passphrase)
 *
 * @throws Error if credential creation fails
 *
 * @example
 * ```ts
 * const operator = deriveOperatorWallet(userEOA);
 * const creds = await createCLOBCredentials(operator.privateKey, 137);
 * console.log(creds.apiKey); // "91ebf1a9-eb24-b417-98f2-b845810d1b4d"
 * ```
 */
export async function createCLOBCredentials(
  operatorPrivateKey: string,
  chainId: number = 137
): Promise<CLOBCredentials> {
  // Configure axios for Cloudflare bypass (proxy + headers)
  configureAxiosForCloudflare();

  // Create v5-compatible wallet for CLOB client
  const v5Wallet = createV5CompatibleWallet(operatorPrivateKey);

  // Initialize CLOB client
  const clobClient = new ClobClient(
    'https://clob.polymarket.com',
    chainId,
    v5Wallet
  );

  // Generate API credentials
  const creds = await clobClient.createOrDeriveApiKey();

  return {
    apiKey: creds.key,
    apiSecret: creds.secret,
    apiPassphrase: creds.passphrase,
  };
}

/**
 * Store CLOB credentials in database
 *
 * @param userId User ID from database
 * @param operatorAddress Operator wallet address
 * @param credentials CLOB API credentials to store
 *
 * @example
 * ```ts
 * await storeCLOBCredentials(
 *   'user_123',
 *   '0x084d7...',
 *   { apiKey: '...', apiSecret: '...', apiPassphrase: '...' }
 * );
 * ```
 */
export async function storeCLOBCredentials(
  userId: string,
  operatorAddress: string,
  credentials: CLOBCredentials
): Promise<void> {
  await prisma.operatorCredential.upsert({
    where: { userId },
    create: {
      userId,
      operatorAddress,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      apiPassphrase: credentials.apiPassphrase,
    },
    update: {
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      apiPassphrase: credentials.apiPassphrase,
      updatedAt: new Date(),
    },
  });
}

/**
 * Load CLOB credentials from database by user EOA
 *
 * @param userEOA User's EOA address
 * @returns CLOB credentials or null if not found
 *
 * @example
 * ```ts
 * const creds = await loadCLOBCredentialsByEOA('0xbdf3...');
 * if (creds) {
 *   console.log(creds.apiKey);
 * }
 * ```
 */
export async function loadCLOBCredentialsByEOA(
  userEOA: string
): Promise<StoredCredentials | null> {
  const user = await prisma.user.findUnique({
    where: { walletAddress: ethers.getAddress(userEOA) },
    include: { operatorCredential: true },
  });

  if (!user?.operatorCredential) {
    return null;
  }

  return {
    userId: user.id,
    operatorAddress: user.operatorCredential.operatorAddress,
    apiKey: user.operatorCredential.apiKey,
    apiSecret: user.operatorCredential.apiSecret,
    apiPassphrase: user.operatorCredential.apiPassphrase,
    createdAt: user.operatorCredential.createdAt,
  };
}

/**
 * Load CLOB credentials from database by user ID
 *
 * @param userId User ID from database
 * @returns CLOB credentials or null if not found
 */
export async function loadCLOBCredentialsByUserId(
  userId: string
): Promise<StoredCredentials | null> {
  const credential = await prisma.operatorCredential.findUnique({
    where: { userId },
    include: { user: true },
  });

  if (!credential) {
    return null;
  }

  return {
    userId: credential.userId,
    operatorAddress: credential.operatorAddress,
    apiKey: credential.apiKey,
    apiSecret: credential.apiSecret,
    apiPassphrase: credential.apiPassphrase,
    createdAt: credential.createdAt,
  };
}

/**
 * Load CLOB credentials by operator address
 *
 * @param operatorAddress Operator wallet address
 * @returns CLOB credentials or null if not found
 */
export async function loadCLOBCredentialsByOperator(
  operatorAddress: string
): Promise<StoredCredentials | null> {
  const credential = await prisma.operatorCredential.findUnique({
    where: { operatorAddress: ethers.getAddress(operatorAddress) },
    include: { user: true },
  });

  if (!credential) {
    return null;
  }

  return {
    userId: credential.userId,
    operatorAddress: credential.operatorAddress,
    apiKey: credential.apiKey,
    apiSecret: credential.apiSecret,
    apiPassphrase: credential.apiPassphrase,
    createdAt: credential.createdAt,
  };
}

/**
 * Create and store CLOB credentials for a user (complete flow)
 *
 * @param userId User ID from database
 * @param operatorPrivateKey Operator's private key
 * @param operatorAddress Operator's wallet address
 * @param chainId Chain ID (137 for Polygon mainnet)
 * @returns Created credentials
 *
 * @example
 * ```ts
 * const operator = deriveOperatorWallet(userEOA);
 * const creds = await createAndStoreCLOBCredentials(
 *   'user_123',
 *   operator.privateKey,
 *   operator.address,
 *   137
 * );
 * ```
 */
export async function createAndStoreCLOBCredentials(
  userId: string,
  operatorPrivateKey: string,
  operatorAddress: string,
  chainId: number = 137
): Promise<StoredCredentials> {
  // Check if credentials already exist
  const existing = await loadCLOBCredentialsByUserId(userId);
  if (existing) {
    console.log(`CLOB credentials already exist for user ${userId}`);
    return existing;
  }

  // Create new credentials
  const credentials = await createCLOBCredentials(operatorPrivateKey, chainId);

  // Store in database
  await storeCLOBCredentials(userId, operatorAddress, credentials);

  return {
    userId,
    operatorAddress,
    ...credentials,
    createdAt: new Date(),
  };
}

/**
 * Delete CLOB credentials from database
 *
 * @param userId User ID
 *
 * @example
 * ```ts
 * await deleteCLOBCredentials('user_123');
 * ```
 */
export async function deleteCLOBCredentials(userId: string): Promise<void> {
  await prisma.operatorCredential.delete({
    where: { userId },
  });
}

/**
 * Check if user has CLOB credentials
 *
 * @param userId User ID
 * @returns True if credentials exist
 */
export async function hasCLOBCredentials(userId: string): Promise<boolean> {
  const count = await prisma.operatorCredential.count({
    where: { userId },
  });
  return count > 0;
}

/**
 * Rotate CLOB credentials (create new ones)
 *
 * @param userId User ID
 * @param operatorPrivateKey Operator's private key
 * @param chainId Chain ID
 * @returns New credentials
 */
export async function rotateCLOBCredentials(
  userId: string,
  operatorPrivateKey: string,
  chainId: number = 137
): Promise<StoredCredentials> {
  const operator = new ethers.Wallet(operatorPrivateKey);

  // Delete old credentials
  await deleteCLOBCredentials(userId);

  // Create new ones
  return await createAndStoreCLOBCredentials(
    userId,
    operatorPrivateKey,
    operator.address,
    chainId
  );
}

/**
 * Get all stored credentials (admin function)
 *
 * @returns Array of all credentials
 */
export async function getAllCredentials(): Promise<StoredCredentials[]> {
  const credentials = await prisma.operatorCredential.findMany({
    include: { user: true },
  });

  return credentials.map((cred) => ({
    userId: cred.userId,
    operatorAddress: cred.operatorAddress,
    apiKey: cred.apiKey,
    apiSecret: cred.apiSecret,
    apiPassphrase: cred.apiPassphrase,
    createdAt: cred.createdAt,
  }));
}

/**
 * Get credential statistics
 *
 * @returns Statistics about stored credentials
 */
export async function getCredentialStats(): Promise<{
  total: number;
  oldestCreated: Date | null;
  newestCreated: Date | null;
}> {
  const stats = await prisma.operatorCredential.aggregate({
    _count: { id: true },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });

  return {
    total: stats._count.id,
    oldestCreated: stats._min.createdAt,
    newestCreated: stats._max.createdAt,
  };
}
