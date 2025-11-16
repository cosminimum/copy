/**
 * Safe Security Setup
 *
 * Handles configuration of PolymarketTradeGuard and UserWithdrawalModule
 * for Gnosis Safe wallets in the SignatureType 2 architecture
 */

import { ethers } from 'ethers';

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

// Deployed contract addresses (from your documentation)
const POLYMARKET_TRADE_GUARD = process.env.POLYMARKET_TRADE_GUARD || '0x134291aF031d151831b81C742C675D9047bBE8A8';
const USER_WITHDRAWAL_MODULE = process.env.USER_WITHDRAWAL_MODULE || '0x9C4d41503aCbF6433f7D73a1507FDF8845Be4e49';

// Guard storage slot (for reading current guard)
const GUARD_STORAGE_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8';

const SAFE_ABI = [
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)',
  'function isModuleEnabled(address) view returns (bool)',
  'function getOwners() view returns (address[])',
  'function setGuard(address)',
  'function enableModule(address)',
];

const WITHDRAWAL_MODULE_ABI = [
  'function authorizeUser(address) external',
  'function isAuthorized(address,address) view returns (bool)',
];

/**
 * Execute a Safe transaction signed by operator
 *
 * @param safe Safe contract instance
 * @param operatorWallet Operator wallet (signer)
 * @param to Target contract address
 * @param data Encoded function call
 * @returns Transaction receipt
 */
async function executeSafeTransaction(
  safe: ethers.Contract,
  operatorWallet: ethers.Wallet,
  to: string,
  data: string
): Promise<ethers.TransactionReceipt> {
  const nonce = await safe.nonce();
  const txHash = await safe.getTransactionHash(
    to,
    0, // value
    data,
    0, // operation (call)
    0, // safeTxGas
    0, // baseGas
    0, // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    nonce
  );

  // Sign transaction
  const signature = await operatorWallet.signMessage(ethers.getBytes(txHash));
  const sigBytes = ethers.getBytes(signature);
  sigBytes[64] += 4; // eth_sign adjustment for Safe

  // Execute transaction
  const tx = await safe.execTransaction(
    to,
    0,
    data,
    0,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.hexlify(sigBytes)
  );

  return await tx.wait();
}

/**
 * Enable UserWithdrawalModule on Safe
 *
 * @param safeAddress Safe address
 * @param operatorWallet Operator wallet (must be Safe owner)
 * @returns True if successful
 */
export async function enableWithdrawalModule(
  safeAddress: string,
  operatorWallet: ethers.Wallet
): Promise<boolean> {
  try {
    const provider = operatorWallet.provider || new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider).connect(operatorWallet) as any;

    // Check if module is already enabled
    const isEnabled = await safe.isModuleEnabled(USER_WITHDRAWAL_MODULE);
    if (isEnabled) {
      console.log('[SafeSecurity] WithdrawalModule already enabled');
      return true;
    }

    // Encode enableModule call
    const enableModuleData = safe.interface.encodeFunctionData('enableModule', [USER_WITHDRAWAL_MODULE]);

    console.log('[SafeSecurity] Enabling UserWithdrawalModule...');
    const receipt = await executeSafeTransaction(safe, operatorWallet, safeAddress, enableModuleData);

    console.log(`[SafeSecurity] ✅ Module enabled (tx: ${receipt.hash})`);
    return true;
  } catch (error: any) {
    console.error('[SafeSecurity] enableWithdrawalModule error:', error);
    return false;
  }
}

/**
 * Authorize user in UserWithdrawalModule
 *
 * @param safeAddress Safe address
 * @param userEOA User's EOA address
 * @param operatorWallet Operator wallet (must be Safe owner)
 * @returns True if successful
 */
export async function authorizeUserForWithdrawal(
  safeAddress: string,
  userEOA: string,
  operatorWallet: ethers.Wallet
): Promise<boolean> {
  try {
    const provider = operatorWallet.provider || new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider).connect(operatorWallet) as any;
    const module = new ethers.Contract(USER_WITHDRAWAL_MODULE, WITHDRAWAL_MODULE_ABI, provider);

    // Check if user is already authorized
    const isAuthorized = await module.isAuthorized(safeAddress, userEOA);
    if (isAuthorized) {
      console.log('[SafeSecurity] User already authorized');
      return true;
    }

    // Encode authorizeUser call
    const authorizeData = module.interface.encodeFunctionData('authorizeUser', [userEOA]);

    console.log('[SafeSecurity] Authorizing user for withdrawals...');
    const receipt = await executeSafeTransaction(safe, operatorWallet, USER_WITHDRAWAL_MODULE, authorizeData);

    console.log(`[SafeSecurity] ✅ User authorized (tx: ${receipt.hash})`);
    return true;
  } catch (error: any) {
    console.error('[SafeSecurity] authorizeUserForWithdrawal error:', error);
    return false;
  }
}

/**
 * Set PolymarketTradeGuard on Safe
 *
 * @param safeAddress Safe address
 * @param operatorWallet Operator wallet (must be Safe owner)
 * @returns True if successful
 */
export async function setTradeGuard(
  safeAddress: string,
  operatorWallet: ethers.Wallet
): Promise<boolean> {
  try {
    const provider = operatorWallet.provider || new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider).connect(operatorWallet) as any;

    // Check current guard
    const storage = await provider.getStorage(safeAddress, GUARD_STORAGE_SLOT);
    const currentGuard = '0x' + storage.slice(-40);

    if (currentGuard.toLowerCase() === POLYMARKET_TRADE_GUARD.toLowerCase()) {
      console.log('[SafeSecurity] TradeGuard already set');
      return true;
    }

    // Encode setGuard call
    const setGuardData = safe.interface.encodeFunctionData('setGuard', [POLYMARKET_TRADE_GUARD]);

    console.log('[SafeSecurity] Setting PolymarketTradeGuard...');
    const receipt = await executeSafeTransaction(safe, operatorWallet, safeAddress, setGuardData);

    console.log(`[SafeSecurity] ✅ Guard set (tx: ${receipt.hash})`);
    return true;
  } catch (error: any) {
    console.error('[SafeSecurity] setTradeGuard error:', error);
    return false;
  }
}

/**
 * Complete security setup (module + authorization + guard)
 *
 * @param safeAddress Safe address
 * @param userEOA User's EOA address
 * @param operatorWallet Operator wallet (must be Safe owner)
 * @returns Setup result
 */
export async function setupCompleteSecurity(
  safeAddress: string,
  userEOA: string,
  operatorWallet: ethers.Wallet
): Promise<{
  success: boolean;
  moduleEnabled: boolean;
  userAuthorized: boolean;
  guardSet: boolean;
  error?: string;
}> {
  try {
    console.log('[SafeSecurity] Starting complete security setup...');
    console.log(`[SafeSecurity] Safe: ${safeAddress}`);
    console.log(`[SafeSecurity] User: ${userEOA}`);
    console.log(`[SafeSecurity] Operator: ${operatorWallet.address}`);

    // Step 1: Enable module
    const moduleEnabled = await enableWithdrawalModule(safeAddress, operatorWallet);
    if (!moduleEnabled) {
      return {
        success: false,
        moduleEnabled: false,
        userAuthorized: false,
        guardSet: false,
        error: 'Failed to enable withdrawal module',
      };
    }

    // Step 2: Authorize user
    const userAuthorized = await authorizeUserForWithdrawal(safeAddress, userEOA, operatorWallet);
    if (!userAuthorized) {
      return {
        success: false,
        moduleEnabled: true,
        userAuthorized: false,
        guardSet: false,
        error: 'Failed to authorize user',
      };
    }

    // Step 3: Set guard
    const guardSet = await setTradeGuard(safeAddress, operatorWallet);
    if (!guardSet) {
      return {
        success: false,
        moduleEnabled: true,
        userAuthorized: true,
        guardSet: false,
        error: 'Failed to set guard',
      };
    }

    console.log('[SafeSecurity] ✅ Complete security setup finished');
    return {
      success: true,
      moduleEnabled: true,
      userAuthorized: true,
      guardSet: true,
    };
  } catch (error: any) {
    console.error('[SafeSecurity] setupCompleteSecurity error:', error);
    return {
      success: false,
      moduleEnabled: false,
      userAuthorized: false,
      guardSet: false,
      error: error.message,
    };
  }
}

/**
 * Verify security setup is complete
 *
 * @param safeAddress Safe address
 * @param userEOA User's EOA address
 * @returns Verification result
 */
export async function verifySecuritySetup(
  safeAddress: string,
  userEOA: string
): Promise<{
  isComplete: boolean;
  moduleEnabled: boolean;
  userAuthorized: boolean;
  guardSet: boolean;
}> {
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);
  const module = new ethers.Contract(USER_WITHDRAWAL_MODULE, WITHDRAWAL_MODULE_ABI, provider);

  // Check module
  const moduleEnabled = await safe.isModuleEnabled(USER_WITHDRAWAL_MODULE);

  // Check authorization
  const userAuthorized = await module.isAuthorized(safeAddress, userEOA);

  // Check guard
  const storage = await provider.getStorage(safeAddress, GUARD_STORAGE_SLOT);
  const currentGuard = '0x' + storage.slice(-40);
  const guardSet = currentGuard.toLowerCase() === POLYMARKET_TRADE_GUARD.toLowerCase();

  return {
    isComplete: moduleEnabled && userAuthorized && guardSet,
    moduleEnabled,
    userAuthorized,
    guardSet,
  };
}
