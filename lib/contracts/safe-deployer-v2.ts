/**
 * Safe Deployer V2 - Polymarket Relayer Integration
 *
 * Uses Polymarket's Builder Relayer for gasless Safe deployment
 * Replaces direct deployment with simplified Relayer-based approach
 */

import { ethers } from 'ethers';
import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { RelayClient } from '@polymarket/builder-relayer-client';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

export interface SafeDeploymentResult {
  success: boolean;
  safeAddress?: string;
  transactionHash?: string;
  error?: string;
}

/**
 * Deploy Safe via Polymarket Relayer (gasless)
 *
 * @param operatorPrivateKey Operator private key (Safe owner)
 * @returns Deployment result with Safe address
 */
export async function deploySafeViaRelayer(
  operatorPrivateKey: string
): Promise<SafeDeploymentResult> {
  try {
    const operatorAccount = privateKeyToAccount(operatorPrivateKey as `0x${string}`);

    const walletClient = createWalletClient({
      account: operatorAccount,
      chain: polygon,
      transport: http(POLYGON_RPC_URL),
    });

    const builderConfig = new BuilderConfig({
      localBuilderCreds: {
        key: process.env.BUILDER_API_KEY!,
        secret: process.env.BUILDER_SECRET!,
        passphrase: process.env.BUILDER_PASS_PHRASE!,
      },
    });

    const relayClient = new RelayClient(
      'https://relayer-v2.polymarket.com/',
      polygon.id,
      walletClient,
      builderConfig
    );

    console.log('[SafeDeployer] Deploying Safe via Polymarket Relayer...');
    console.log(`[SafeDeployer] Operator: ${operatorAccount.address}`);

    const response = await relayClient.deploy();
    const result = await response.wait();

    if (!result) {
      throw new Error('Deployment failed - no result returned');
    }

    console.log(`[SafeDeployer] ✅ Safe deployed at: ${result.proxyAddress}`);
    console.log(`[SafeDeployer] Transaction: ${result.transactionHash || 'N/A'}`);

    return {
      success: true,
      safeAddress: result.proxyAddress,
      transactionHash: result.transactionHash,
    };
  } catch (error: any) {
    console.error('[SafeDeployer] Error:', error);
    return {
      success: false,
      error: error.message || 'Unknown deployment error',
    };
  }
}

/**
 * Get Safe address deterministically without deploying
 *
 * @param operatorAddress Operator wallet address
 * @returns Safe address (deterministic based on CTF Exchange mapping)
 */
export async function getSafeAddress(operatorAddress: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const ctfExchange = new ethers.Contract(
    CTF_EXCHANGE,
    ['function getSafeAddress(address) view returns (address)'],
    provider
  );

  return await ctfExchange.getSafeAddress(operatorAddress);
}

/**
 * Check if Safe is deployed
 *
 * @param safeAddress Safe address to check
 * @returns True if Safe exists on-chain
 */
export async function isSafeDeployed(safeAddress: string): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const code = await provider.getCode(safeAddress);
  return code !== '0x' && code.length > 2;
}

/**
 * Get Safe info (owners, threshold, modules)
 *
 * @param safeAddress Safe address
 * @returns Safe configuration
 */
export async function getSafeInfo(safeAddress: string) {
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const safeContract = new ethers.Contract(
    safeAddress,
    [
      'function getOwners() view returns (address[])',
      'function getThreshold() view returns (uint256)',
      'function isModuleEnabled(address) view returns (bool)',
      'function getGuard() view returns (address)',
    ],
    provider
  );

  const [owners, threshold] = await Promise.all([
    safeContract.getOwners(),
    safeContract.getThreshold(),
  ]);

  // Check guard (storage slot)
  const guardStorageSlot = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8';
  const guardStorage = await provider.getStorage(safeAddress, guardStorageSlot);
  const guard = guardStorage !== '0x0000000000000000000000000000000000000000000000000000000000000000'
    ? '0x' + guardStorage.slice(-40)
    : ethers.ZeroAddress;

  return {
    owners,
    threshold: Number(threshold),
    guard,
  };
}
