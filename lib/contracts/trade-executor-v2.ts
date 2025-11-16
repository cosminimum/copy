/**
 * Trade Executor V2 - SignatureType 2 Implementation
 *
 * Replaces TradeModule with direct CLOB API orders using SignatureType 2
 */

import { ethers } from 'ethers';
import prisma from '../db/prisma';
import { CalculatedTrade } from '../trading/position-calculator';
import { deriveOperatorWallet } from '../operators/wallet-derivation';
import { loadCLOBCredentialsByUserId } from '../polymarket/credential-manager';
import { marketBuy, marketSell, OrderResult, updateBalanceAllowance } from '../polymarket/signature-type2-signer';

export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  positionKey?: string;
  orderId?: string;
  error?: string;
  errorCode?: string;
  executedAt: Date;
  gasFee?: number;
  blockNumber?: number;
  gasUsed?: bigint;
  fillAmount?: number;
  actualCost?: number;
}

export class TradeExecutorV2 {
  /**
   * Execute trade via SignatureType 2 (direct CLOB API)
   *
   * @param trade Calculated trade from orchestrator
   * @param userId User ID from database
   * @returns Execution result
   */
  async executeTrade(trade: CalculatedTrade, userId: string): Promise<ExecutionResult> {
    try {
      // Get user with Safe address and operator info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          safeAddress: true,
          walletAddress: true,
          operatorAddress: true,
        },
      });

      if (!user?.safeAddress) {
        return {
          success: false,
          errorCode: 'NO_SAFE_DEPLOYED',
          error: 'User does not have a Safe deployed. Please deploy Safe first.',
          executedAt: new Date(),
        };
      }

      if (!user?.operatorAddress) {
        return {
          success: false,
          errorCode: 'NO_OPERATOR',
          error: 'Operator not configured for user. Run onboarding script.',
          executedAt: new Date(),
        };
      }

      // Load CLOB credentials
      const credentials = await loadCLOBCredentialsByUserId(userId);
      if (!credentials) {
        return {
          success: false,
          errorCode: 'NO_CREDENTIALS',
          error: 'CLOB API credentials not found. Run onboarding script.',
          executedAt: new Date(),
        };
      }

      // Derive operator wallet
      const operatorWallet = deriveOperatorWallet(user.walletAddress);

      console.log('[TradeExecutorV2] Executing trade via SignatureType 2:', {
        safeAddress: user.safeAddress,
        operatorAddress: operatorWallet.address,
        tokenId: trade.asset,
        side: trade.side,
        valueUSDC: trade.value.toFixed(6),
      });

      // CRITICAL: Update balance in CLOB before placing order
      // This syncs Safe's on-chain balance with CLOB backend
      console.log('[TradeExecutorV2] Updating CLOB balance before trade...');
      try {
        await updateBalanceAllowance(
          operatorWallet.privateKey,
          credentials,
          user.safeAddress,
          137
        );
        console.log('[TradeExecutorV2] ✅ CLOB balance updated');

        // Verify what CLOB actually knows about this Safe
        const { getCLOBBalance } = await import('../polymarket/signature-type2-signer.js');
        const clobBalance = await getCLOBBalance(
          operatorWallet.privateKey,
          credentials,
          user.safeAddress,
          137
        );
        console.log('[TradeExecutorV2] CLOB reported balance:', clobBalance);

        if (clobBalance === 0) {
          console.error('[TradeExecutorV2] ⚠️  WARNING: CLOB shows $0 balance even after update!');
          console.error('[TradeExecutorV2] This order will likely fail');
        } else if (clobBalance < trade.value) {
          console.error('[TradeExecutorV2] ⚠️  WARNING: CLOB balance ($' + clobBalance + ') < trade value ($' + trade.value + ')');
        }
      } catch (error: any) {
        console.warn('[TradeExecutorV2] Balance update/check failed:', error.message);
        // Continue anyway - order might still work
      }

      // Execute based on side
      let result: OrderResult;

      if (trade.side === 'BUY') {
        result = await marketBuy({
          tokenId: trade.asset,
          usdcAmount: trade.value,
          safeAddress: user.safeAddress,
          operatorPrivateKey: operatorWallet.privateKey,
          credentials,
          chainId: 137,
        });
      } else {
        // For SELL, we need shares count (from trade.size)
        result = await marketSell({
          tokenId: trade.asset,
          shares: trade.size,
          safeAddress: user.safeAddress,
          operatorPrivateKey: operatorWallet.privateKey,
          credentials,
          chainId: 137,
        });
      }

      console.log('[TradeExecutorV2] Order result:', {
        orderId: result.orderId,
        status: result.status,
        fillAmount: result.fillAmount,
        actualCost: result.actualCost,
        transactionHash: result.transactionHash,
      });

      // Check if order was matched
      if (result.status !== 'matched') {
        return {
          success: false,
          errorCode: 'ORDER_NOT_MATCHED',
          error: `Order posted but not matched. Order ID: ${result.orderId}`,
          orderId: result.orderId,
          executedAt: new Date(),
        };
      }

      // Generate position key
      const positionKey = `${user.safeAddress}-${trade.market}-${trade.outcome}`.toLowerCase();

      return {
        success: true,
        orderId: result.orderId,
        transactionHash: result.transactionHash || undefined,
        positionKey,
        fillAmount: result.fillAmount,
        actualCost: result.actualCost,
        executedAt: new Date(),
      };
    } catch (error: any) {
      console.error('[TradeExecutorV2] Trade execution error:', error);

      // Parse error message for known issues
      let errorCode = 'EXECUTION_ERROR';
      let errorMessage = error.message || 'Unknown execution error';

      if (errorMessage.includes('not enough balance')) {
        errorCode = 'INSUFFICIENT_BALANCE';
      } else if (errorMessage.includes('no asks available') || errorMessage.includes('no bids available')) {
        errorCode = 'NO_LIQUIDITY';
      } else if (errorMessage.includes('invalid amount')) {
        errorCode = 'INVALID_AMOUNT';
      }

      return {
        success: false,
        errorCode,
        error: errorMessage,
        executedAt: new Date(),
      };
    }
  }

  /**
   * Validate trade before execution
   *
   * @param trade Calculated trade
   * @param userId User ID
   * @returns Validation result
   */
  async validateTrade(trade: CalculatedTrade, userId: string): Promise<{
    valid: boolean;
    error?: string;
    errorCode?: string;
  }> {
    // Check user has Safe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { safeAddress: true, operatorAddress: true },
    });

    if (!user?.safeAddress) {
      return {
        valid: false,
        errorCode: 'NO_SAFE_DEPLOYED',
        error: 'User does not have a Safe deployed',
      };
    }

    if (!user?.operatorAddress) {
      return {
        valid: false,
        errorCode: 'NO_OPERATOR',
        error: 'Operator not configured for user',
      };
    }

    // Check credentials exist
    const credentials = await loadCLOBCredentialsByUserId(userId);
    if (!credentials) {
      return {
        valid: false,
        errorCode: 'NO_CREDENTIALS',
        error: 'CLOB API credentials not found',
      };
    }

    // Check minimum trade size ($1)
    if (trade.value < 1) {
      return {
        valid: false,
        errorCode: 'TRADE_TOO_SMALL',
        error: 'Trade value must be at least $1',
      };
    }

    return { valid: true };
  }

  /**
   * Estimate trade execution
   *
   * @param trade Calculated trade
   * @param userId User ID
   * @returns Estimated execution result
   */
  async estimateTrade(trade: CalculatedTrade, userId: string): Promise<{
    estimatedShares?: number;
    estimatedPrice?: number;
    estimatedCost?: number;
    error?: string;
  }> {
    try {
      // Validation check
      const validation = await this.validateTrade(trade, userId);
      if (!validation.valid) {
        return { error: validation.error };
      }

      // For estimates, we just return the calculated trade values
      return {
        estimatedShares: trade.size,
        estimatedPrice: trade.price,
        estimatedCost: trade.value,
      };
    } catch (error: any) {
      return {
        error: error.message || 'Failed to estimate trade',
      };
    }
  }
}

// Export singleton instance
export const tradeExecutorV2 = new TradeExecutorV2();
