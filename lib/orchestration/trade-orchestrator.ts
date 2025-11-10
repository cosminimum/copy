import { TradeMessage } from '../polymarket/types'
import { positionCalculator, CopySettings } from '../trading/position-calculator'
import { tradeExecutor } from '../contracts/trade-executor'
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

      // Calculate trade size
      const calculatedTrade = positionCalculator.calculateTradeSize(
        originalTrade,
        copySettings as CopySettings,
        userBalance
      )

      if (!calculatedTrade) {
        this.log('warn', 'Trade calculation returned null, skipping')
        return
      }

      this.log('debug', `Calculated trade size: ${calculatedTrade.size} (value: $${calculatedTrade.value.toFixed(2)})`)

      // Get current positions
      const currentPositions = await prisma.position.findMany({
        where: {
          userId,
          status: 'OPEN',
        },
        select: {
          market: true,
          size: true,
        },
      })

      // Validate trade
      const isValid = positionCalculator.validateTrade(
        calculatedTrade,
        currentPositions,
        copySettings as CopySettings
      )

      if (!isValid) {
        this.log('warn', 'Trade validation failed (limits exceeded), skipping')
        return
      }

      // Execute trade (simulated)
      this.log('debug', `Executing ${calculatedTrade.side} trade...`)
      const executionResult = await tradeExecutor.executeTrade(
        calculatedTrade,
        userWalletAddress
      )

      if (executionResult.success) {
        this.log('info', `✅ Trade executed successfully: ${calculatedTrade.side} ${calculatedTrade.size} @ $${calculatedTrade.price}`)
      } else {
        this.log('error', `❌ Trade execution failed: ${executionResult.error}`)
      }

      const tradeRecord = await prisma.trade.create({
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
          size: calculatedTrade.size,
          value: calculatedTrade.value,
          fee: executionResult.gasFee || 0,
          transactionHash: executionResult.transactionHash,
          status: executionResult.success ? 'COMPLETED' : 'FAILED',
          executionType: 'COPY',
          errorMessage: executionResult.error,
          timestamp: executionResult.executedAt,
        },
      })

      if (executionResult.success) {
        await this.updateOrCreatePosition(userId, calculatedTrade, tradeRecord.id)

        await this.createNotification(
          userId,
          'TRADE_EXECUTED',
          'Trade Executed',
          `${calculatedTrade.side} ${calculatedTrade.size} @ $${calculatedTrade.price}`,
          { tradeId: tradeRecord.id }
        )
      }

      await prisma.activityLog.create({
        data: {
          userId,
          action: 'COPY_TRADE_EXECUTED',
          description: `Copy trade ${executionResult.success ? 'succeeded' : 'failed'}: ${calculatedTrade.side} ${calculatedTrade.size} in ${calculatedTrade.market}`,
          metadata: JSON.parse(JSON.stringify({
            tradeId: tradeRecord.id,
            originalTrade,
            executionResult,
          })),
        },
      })
    } catch (error) {
      console.error('Error executing copy trade:', error)
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
            value: newSize * trade.price,
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
    const snapshot = await prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    return snapshot?.cashBalance || 10000
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
