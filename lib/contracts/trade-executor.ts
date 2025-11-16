import { CalculatedTrade } from '../trading/position-calculator'
import { polymarketCLOB } from '../polymarket/clob-api-client'
import { tradeModuleV3 } from './trade-module-v3'
import type { PolymarketOrder } from './trade-module-v3'
import { ethers } from 'ethers'
import prisma from '../db/prisma'

export interface ExecutionResult {
  success: boolean
  transactionHash?: string
  positionKey?: string
  error?: string
  errorCode?: string
  executedAt: Date
  gasFee?: number
  blockNumber?: number
  gasUsed?: bigint
}

export class TradeExecutor {
  private mockDelayMin = 500 // ms
  private mockDelayMax = 2000 // ms
  private mockSuccessRate = parseFloat(process.env.MOCK_TRADE_SUCCESS_RATE || '0.98')
  private useRealExecution = process.env.USE_REAL_EXECUTION === 'true'

  private errorMessages = [
    'Insufficient balance',
    'Slippage tolerance exceeded',
    'Market temporarily unavailable',
    'Gas price too high',
    'Transaction timeout',
    'Network congestion',
  ]

  async executeTrade(
    trade: CalculatedTrade,
    userWalletAddress: string,
    userId?: string
  ): Promise<ExecutionResult> {
    // Use real execution if enabled and Safe is available
    if (this.useRealExecution && userId) {
      return this.executeRealTrade(trade, userId)
    }

    // Fall back to mock execution
    return this.executeMockTrade(trade, userWalletAddress)
  }

  /**
   * Execute real trade on-chain via TradeModule smart contract
   */
  private async executeRealTrade(
    trade: CalculatedTrade,
    userId: string
  ): Promise<ExecutionResult> {
    try {
      // Get user's Safe address
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { safeAddress: true, walletAddress: true },
      })

      if (!user?.safeAddress) {
        return {
          success: false,
          errorCode: 'NO_SAFE_DEPLOYED',
          error: 'User does not have a Safe deployed. Please deploy a Safe first.',
          executedAt: new Date(),
        }
      }

      // Get tokenId from trade
      const tokenId = trade.asset

      console.log(`[TradeExecutor] Executing real trade via TradeModule:`, {
        safeAddress: user.safeAddress,
        tokenId,
        side: trade.side,
        valueUSDC: trade.value.toFixed(6),
      })

      // 1. Verify TradeModule is enabled on Safe
      const isEnabled = await tradeModuleV3.isEnabledOnSafe(user.safeAddress)
      if (!isEnabled) {
        return {
          success: false,
          errorCode: 'MODULE_NOT_ENABLED',
          error: 'TradeModule not enabled on this Safe. Please enable the module first.',
          executedAt: new Date(),
        }
      }

      // 2. Check liquidity
      const liquidityCheck = await polymarketCLOB.checkLiquidity(tokenId, trade.side, trade.value)
      if (!liquidityCheck.hasLiquidity) {
        return {
          success: false,
          errorCode: 'INSUFFICIENT_LIQUIDITY',
          error: `Insufficient liquidity. Requested: ${trade.value.toFixed(2)} USDC, Available: ${liquidityCheck.availableSize.toFixed(2)} USDC`,
          executedAt: new Date(),
        }
      }

      // 3. Fetch best order from CLOB API
      const order = trade.side === 'BUY'
        ? await polymarketCLOB.getBestAsk(tokenId)
        : await polymarketCLOB.getBestBid(tokenId)

      if (!order) {
        return {
          success: false,
          errorCode: 'NO_ORDERS_AVAILABLE',
          error: 'No orders available in the order book',
          executedAt: new Date(),
        }
      }

      // 4. Calculate fill amount in shares
      // Convert USDC value to shares based on order price
      const orderPrice = parseFloat(order.price)
      const shareSize = trade.value / orderPrice
      const fillAmount = ethers.parseUnits(shareSize.toFixed(6), 6) // USDC has 6 decimals

      console.log(`[TradeExecutor] Calculated fill:`, {
        orderPrice: orderPrice.toFixed(4),
        shareSize: shareSize.toFixed(6),
        fillAmount: ethers.formatUnits(fillAmount, 6),
      })

      // 5. Convert CLOB API order to PolymarketOrder format
      // First, validate all required fields are present
      const requiredFields = [
        'salt', 'maker', 'signer', 'tokenId', 'makerAmount',
        'takerAmount', 'expiration', 'nonce', 'feeRateBps', 'signatureType', 'signature'
      ]

      const missingFields = requiredFields.filter(field =>
        order[field as keyof typeof order] === undefined || order[field as keyof typeof order] === null
      )

      if (missingFields.length > 0) {
        console.error(`[TradeExecutor] Order missing fields:`, missingFields)
        console.error(`[TradeExecutor] Full order data:`, JSON.stringify(order, null, 2))
        return {
          success: false,
          errorCode: 'INVALID_ORDER',
          error: `Order missing required fields: ${missingFields.join(', ')}`,
          executedAt: new Date(),
        }
      }

      const polymarketOrder: PolymarketOrder = {
        salt: order.salt,
        maker: order.maker,
        signer: order.signer,
        taker: order.taker || ethers.ZeroAddress,
        tokenId: order.tokenId,
        makerAmount: order.makerAmount,
        takerAmount: order.takerAmount,
        expiration: order.expiration,
        nonce: order.nonce,
        feeRateBps: order.feeRateBps,
        side: trade.side === 'BUY' ? 0 : 1,
        signatureType: order.signatureType,
        signature: order.signature,
      }

      // 6. Execute trade via TradeModule contract
      console.log(`[TradeExecutor] Executing via TradeModule...`)
      const result = await tradeModuleV3.executeTrade(
        user.safeAddress,
        polymarketOrder,
        fillAmount
      )

      if (!result.success) {
        return {
          success: false,
          errorCode: result.errorCode,
          error: result.error,
          executedAt: new Date(),
        }
      }

      console.log(`[TradeExecutor] ✅ Real trade executed via TradeModule`)
      console.log(`[TradeExecutor] 🔍 View on Polygonscan: https://polygonscan.com/tx/${result.transactionHash}`)

      return {
        success: true,
        transactionHash: result.transactionHash,
        executedAt: new Date(),
        positionKey: `${user.safeAddress}-${trade.asset}`,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
      }
    } catch (error: any) {
      console.error('[TradeExecutor] Real execution error:', error)
      return {
        success: false,
        errorCode: 'EXECUTION_ERROR',
        error: error.message,
        executedAt: new Date(),
      }
    }
  }

  /**
   * Execute mock trade (for testing without real transactions)
   */
  private async executeMockTrade(
    trade: CalculatedTrade,
    userWalletAddress: string
  ): Promise<ExecutionResult> {
    // Simulate realistic network delay
    await this.simulateNetworkDelay()

    // Determine if trade should succeed
    const shouldSucceed = Math.random() < this.mockSuccessRate

    if (!shouldSucceed) {
      const randomError = this.errorMessages[Math.floor(Math.random() * this.errorMessages.length)]
      console.log(`[TradeExecutor] ❌ Simulated failure: ${randomError}`)
      return {
        success: false,
        error: randomError,
        executedAt: new Date(),
      }
    }

    // Generate realistic mock data
    const mockTxHash = this.generateMockTransactionHash()
    const mockGasFee = this.calculateMockGasFee(trade.value)

    console.log(`[TradeExecutor] ✅ Simulated trade execution:`, {
      wallet: userWalletAddress.slice(0, 10) + '...',
      market: trade.market?.slice(0, 40) + '...' || 'Unknown',
      side: trade.side,
      size: trade.size,
      price: `$${trade.price.toFixed(4)}`,
      value: `$${trade.value.toFixed(2)}`,
      txHash: mockTxHash.slice(0, 10) + '...',
      gasFee: `$${mockGasFee.toFixed(4)}`,
    })

    return {
      success: true,
      transactionHash: mockTxHash,
      executedAt: new Date(),
      gasFee: mockGasFee,
    }
  }

  async estimateGas(trade: CalculatedTrade): Promise<number> {
    await this.simulateNetworkDelay()
    return this.calculateMockGasFee(trade.value)
  }

  private simulateNetworkDelay(): Promise<void> {
    // Random delay between min and max
    const delay = Math.random() * (this.mockDelayMax - this.mockDelayMin) + this.mockDelayMin
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  private generateMockTransactionHash(): string {
    // Generate realistic Polygon transaction hash
    return '0x' + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
  }

  private calculateMockGasFee(tradeValue: number): number {
    // Gas fee scales slightly with trade value
    // Typical Polygon gas fees: $0.001 - $0.05
    const baseFee = 0.001
    const variableFee = (tradeValue / 10000) * 0.01 // 0.01% of trade value
    return baseFee + variableFee + (Math.random() * 0.01)
  }

  setMockDelayRange(min: number, max: number): void {
    this.mockDelayMin = Math.max(0, min)
    this.mockDelayMax = Math.max(this.mockDelayMin, max)
  }

  setMockSuccessRate(rate: number): void {
    this.mockSuccessRate = Math.max(0, Math.min(1, rate))
  }

  getMockSuccessRate(): number {
    return this.mockSuccessRate
  }

  addErrorMessage(message: string): void {
    if (!this.errorMessages.includes(message)) {
      this.errorMessages.push(message)
    }
  }

  setUseRealExecution(enabled: boolean): void {
    this.useRealExecution = enabled
  }

  isUsingRealExecution(): boolean {
    return this.useRealExecution
  }
}

export const tradeExecutor = new TradeExecutor()
