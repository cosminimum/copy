import { TradeMessage } from '../polymarket/types'
import { positionCalculator, CopySettings } from '../trading/position-calculator'
import { tradeExecutorV2 } from '../contracts/trade-executor-v2'
import prisma from '../db/prisma'

export class TradeOrchestrator {
  private logLevel: 'debug' | 'info' | 'warn' | 'error' =
    (process.env.ORCHESTRATOR_LOG_LEVEL as any) || 'info'

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 }
    if (levels[level] >= levels[this.logLevel]) {
      console.log(`[Orchestrator] [${level.toUpperCase()}] ${message}`, ...args)
    }
  }

  async processTradeEvent(trade: TradeMessage): Promise<void> {
    try {
      // Normalize wallet address to lowercase for case-insensitive matching
      const traderWallet = trade.proxyWallet.toLowerCase()
      const traderName = trade.name || trade.pseudonym || `${traderWallet.slice(0, 6)}...${traderWallet.slice(-4)}`

      // Find active subscriptions for this wallet address (no Trader table lookup needed)
      const subscriptions = await prisma.subscription.findMany({
        where: {
          traderWalletAddress: traderWallet,
          isActive: true,
        },
        include: {
          user: true,
        },
      })

      // Only log detailed info if there are followers
      if (subscriptions.length === 0) {
        this.log('debug', `No followers for ${traderName}`)
        return
      }

      // Followed trader - log detailed info
      this.log('info', '━'.repeat(60))
      this.log('info', `📊 Trade from followed trader: ${traderName}`)
      this.log('info', `  Market: ${trade.title}`)
      this.log('info', `  Side: ${trade.side} ${trade.outcome}`)
      this.log('info', `  Price: $${trade.price.toFixed(4)} | Size: ${trade.size}`)
      this.log('info', `  Value: $${(trade.price * trade.size).toFixed(2)}`)
      this.log('info', `👥 Copying trade to ${subscriptions.length} follower(s)...`)

      let successCount = 0
      let failCount = 0

      for (const subscription of subscriptions) {
        try {
          await this.executeCopyTrade(
            trade,
            subscription.user.id,
            subscription.user.walletAddress,
            traderWallet,
            traderName
          )
          successCount++
        } catch (error) {
          failCount++
          this.log('error', `Failed to copy trade for user ${subscription.user.id}:`, error)
        }
      }

      this.log('info', `✅ Copy complete: ${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ''}`)
      this.log('info', '━'.repeat(60))
    } catch (error) {
      this.log('error', 'Error processing trade event:', error)
      throw error
    }
  }

  private async executeCopyTrade(
    originalTrade: TradeMessage,
    userId: string,
    userWalletAddress: string,
    traderWalletAddress: string,
    traderName: string
  ): Promise<void> {
    try {
      this.log('debug', `Processing copy trade for user ${userId.slice(0, 8)}...`)

      // Find copy settings for this trader
      let copySettings = await prisma.copySetting.findFirst({
        where: {
          userId,
          traderWalletAddress,
          isActive: true,
        },
      })

      if (!copySettings) {
        // Fall back to global settings
        copySettings = await prisma.copySetting.findFirst({
          where: {
            userId,
            isGlobal: true,
            isActive: true,
          },
        })
      }

      if (!copySettings) {
        this.log('warn', `No copy settings found for user ${userId.slice(0, 8)}, skipping`)
        return
      }

      this.log('debug', `Using ${copySettings.positionSizeType} sizing strategy with value ${copySettings.positionSizeValue}`)

      // Get user balance
      const userBalance = await this.getUserBalance(userId)
      this.log('debug', `User balance: $${userBalance.toFixed(2)}`)

      // For SELL orders, get user's current position to ensure they have shares to sell
      let userPosition = null
      if (originalTrade.side === 'SELL') {
        userPosition = await prisma.position.findFirst({
          where: {
            userId,
            market: originalTrade.slug,
            asset: originalTrade.asset,
            outcome: originalTrade.outcome,
            status: 'OPEN',
          },
          select: {
            size: true,
          },
        })
        this.log('debug', `User position for ${originalTrade.outcome}: ${userPosition?.size || 0} shares`)
      }

      // Calculate trade size
      const calculatedTrade = positionCalculator.calculateTradeSize(
        originalTrade,
        copySettings as CopySettings,
        userBalance,
        userPosition
      )

      if (!calculatedTrade) {
        this.log('warn', 'Trade calculation returned null, skipping')
        return
      }

      this.log('debug', `Calculated trade size: ${calculatedTrade.size} (value: $${calculatedTrade.value.toFixed(2)})`)

      // Get current positions (for future validation needs)
      const currentPositions = await prisma.position.findMany({
        where: {
          userId,
          status: 'OPEN',
        },
        select: {
          market: true,
          size: true,
          value: true,
        },
      })

      // Validate trade
      const validation = positionCalculator.validateTrade(
        calculatedTrade,
        currentPositions,
        copySettings as CopySettings
      )

      if (!validation.valid) {
        const errorMsg = `Trade validation failed: ${validation.reason}`
        this.log('warn', errorMsg)
        throw new Error(errorMsg) // Throw so outer catch counts it as failed
      }

      // Execute trade
      this.log('debug', `Executing ${calculatedTrade.side} trade via SignatureType 2...`)
      const executionResult = await tradeExecutorV2.executeTrade(
        calculatedTrade,
        userId
      )

      if (executionResult.success) {
        this.log('info', `✅ Trade executed successfully: ${calculatedTrade.side} ${calculatedTrade.size} @ $${calculatedTrade.price}`)
      } else {
        this.log('error', `❌ Trade execution failed: ${executionResult.error}`)
        throw new Error(executionResult.error || 'Trade execution failed')
      }

      // Use actual filled amount from execution result (not calculated size)
      // This handles partial fills correctly
      const actualSize = executionResult.fillAmount || calculatedTrade.size;
      const actualValue = executionResult.actualCost || calculatedTrade.value;

      // Serialize execution result to handle BigInt values
      const serializeExecutionResult = (result: any) => {
        return {
          ...result,
          gasUsed: result.gasUsed ? result.gasUsed.toString() : undefined,
          blockNumber: result.blockNumber ? result.blockNumber.toString() : undefined,
        }
      }

      // Wrap all database operations in a transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        const tradeRecord = await tx.trade.create({
          data: {
            userId,
            traderWalletAddress,
            traderName,
            market: calculatedTrade.market,
            asset: calculatedTrade.asset,
            conditionId: calculatedTrade.conditionId,
            outcome: calculatedTrade.outcome,
            outcomeIndex: calculatedTrade.outcomeIndex,
            side: calculatedTrade.side,
            price: calculatedTrade.price,
            size: actualSize, // Use actual filled amount, not requested amount
            value: actualValue, // Use actual cost, not calculated value
            fee: executionResult.gasFee || 0,
            transactionHash: executionResult.transactionHash,
            positionKey: executionResult.positionKey,
            blockNumber: executionResult.blockNumber ? BigInt(executionResult.blockNumber) : null,
            gasUsed: executionResult.gasUsed,
            gasPaid: executionResult.gasFee,
            // COMPLETED: trade executed successfully (tx already confirmed in executor)
            // FAILED: trade execution failed
            status: executionResult.success ? 'COMPLETED' : 'FAILED',
            executionType: 'COPY',
            errorMessage: executionResult.error
              ? `[${executionResult.errorCode || 'ERROR'}] ${executionResult.error}`
              : null,
            timestamp: executionResult.executedAt,
          },
        })

        if (executionResult.success) {
          // Create trade object with actual filled amounts for position tracking
          const actualTrade = {
            ...calculatedTrade,
            size: actualSize,
            value: actualValue,
          };
          await this.updateOrCreatePositionInTransaction(tx, userId, actualTrade, tradeRecord.id)

          await this.createNotificationInTransaction(
            tx,
            userId,
            'TRADE_EXECUTED',
            'Trade Executed',
            `${calculatedTrade.side} ${calculatedTrade.size} @ $${calculatedTrade.price}`,
            { tradeId: tradeRecord.id }
          )
        }

        await tx.activityLog.create({
          data: {
            userId,
            action: 'COPY_TRADE_EXECUTED',
            description: `Copy trade ${executionResult.success ? 'succeeded' : 'failed'}: ${calculatedTrade.side} ${calculatedTrade.size} in ${calculatedTrade.market}`,
            metadata: JSON.parse(JSON.stringify({
              tradeId: tradeRecord.id,
              originalTrade,
              executionResult: serializeExecutionResult(executionResult),
            })),
          },
        })
      })
    } catch (error) {
      console.error('Error executing copy trade:', error)
      throw error // Re-throw so outer catch can count it as failed
    }
  }

  private async updateOrCreatePositionInTransaction(
    tx: any,
    userId: string,
    trade: any,
    tradeId: string
  ): Promise<void> {
    // Use FOR UPDATE to lock the row and prevent race conditions
    const existingPosition = await tx.$queryRaw`
      SELECT * FROM "Position"
      WHERE "userId" = ${userId}
        AND "market" = ${trade.market}
        AND "asset" = ${trade.asset}
        AND "outcome" = ${trade.outcome}
        AND "status" = 'OPEN'
      FOR UPDATE
      LIMIT 1
    `.then((rows: any[]) => rows[0] || null)

    if (existingPosition) {
      const newSize = existingPosition.size + (trade.side === 'BUY' ? trade.size : -trade.size)

      if (newSize <= 0) {
        await tx.position.update({
          where: { id: existingPosition.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            size: 0,
          },
        })
      } else {
        const newAvgPrice = (
          (existingPosition.entryPrice * existingPosition.size + trade.price * trade.size) /
          (existingPosition.size + trade.size)
        )

        await tx.position.update({
          where: { id: existingPosition.id },
          data: {
            size: newSize,
            entryPrice: newAvgPrice,
            currentPrice: trade.price,
            value: newSize * trade.price,
            unrealizedPnL: (trade.price - newAvgPrice) * newSize,
          },
        })
      }
    } else {
      await tx.position.create({
        data: {
          userId,
          market: trade.market,
          asset: trade.asset,
          conditionId: trade.conditionId,
          outcome: trade.outcome,
          outcomeIndex: trade.outcomeIndex,
          side: trade.side,
          entryPrice: trade.price,
          currentPrice: trade.price,
          size: trade.size,
          value: trade.value,
          unrealizedPnL: 0,
          status: 'OPEN',
        },
      })
    }
  }

  private async updateOrCreatePosition(
    userId: string,
    trade: any,
    tradeId: string
  ): Promise<void> {
    const existingPosition = await prisma.position.findFirst({
      where: {
        userId,
        market: trade.market,
        asset: trade.asset,
        outcome: trade.outcome,
        status: 'OPEN',
      },
    })

    if (existingPosition) {
      const newSize = existingPosition.size + (trade.side === 'BUY' ? trade.size : -trade.size)

      if (newSize <= 0) {
        await prisma.position.update({
          where: { id: existingPosition.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            size: 0,
          },
        })
      } else {
        const newAvgPrice = (
          (existingPosition.entryPrice * existingPosition.size + trade.price * trade.size) /
          (existingPosition.size + trade.size)
        )

        await prisma.position.update({
          where: { id: existingPosition.id },
          data: {
            size: newSize,
            entryPrice: newAvgPrice,
            currentPrice: trade.price,
            value: newSize * trade.price,
            unrealizedPnL: (trade.price - newAvgPrice) * newSize,
          },
        })
      }
    } else {
      await prisma.position.create({
        data: {
          userId,
          market: trade.market,
          asset: trade.asset,
          conditionId: trade.conditionId,
          outcome: trade.outcome,
          outcomeIndex: trade.outcomeIndex,
          side: trade.side,
          entryPrice: trade.price,
          currentPrice: trade.price,
          size: trade.size,
          value: trade.value,
          unrealizedPnL: 0,
          status: 'OPEN',
        },
      })
    }
  }

  private async getUserBalance(userId: string): Promise<number> {
    // With TradeModule architecture, get real USDC balance from Safe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { safeAddress: true },
    })

    if (user?.safeAddress) {
      try {
        // Import dynamically to avoid circular dependencies
        const { tradeModuleV3 } = await import('../contracts/trade-module-v3')
        const safeBalance = await tradeModuleV3.getSafeBalance(user.safeAddress)
        this.log('debug', `Real Safe balance: $${safeBalance.toFixed(2)}`)
        return safeBalance
      } catch (error) {
        this.log('warn', `Could not fetch Safe balance, falling back to snapshot: ${error}`)
      }
    }

    // Fallback to portfolio snapshot or default
    const snapshot = await prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    return snapshot?.cashBalance || 10000
  }

  private async createNotificationInTransaction(
    tx: any,
    userId: string,
    type: string,
    title: string,
    message: string,
    metadata?: any
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    })
  }

  private async createNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    metadata?: any
  ): Promise<void> {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    })
  }
}

export const tradeOrchestrator = new TradeOrchestrator()
