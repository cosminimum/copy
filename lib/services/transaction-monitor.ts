import { ethers } from 'ethers'
import prisma from '../db/prisma'
import { POLYGON_RPC_URL } from '../contracts/trade-module-v3'

export class TransactionMonitor {
  private provider: ethers.JsonRpcProvider
  private isRunning: boolean = false
  private intervalId?: NodeJS.Timeout
  private checkIntervalMs: number
  private maxRetries: number

  constructor(
    checkIntervalMs: number = 30000, // Check every 30 seconds
    maxRetries: number = 20 // After 20 retries (~10 min), consider transaction stale
  ) {
    this.provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
    this.checkIntervalMs = checkIntervalMs
    this.maxRetries = maxRetries
  }

  /**
   * Start monitoring pending transactions
   */
  start(): void {
    if (this.isRunning) {
      console.log('[TransactionMonitor] Already running')
      return
    }

    console.log('[TransactionMonitor] Starting transaction monitor...')
    this.isRunning = true

    // Run immediately
    this.checkPendingTransactions()

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.checkPendingTransactions()
    }, this.checkIntervalMs)
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    console.log('[TransactionMonitor] Stopping transaction monitor...')
    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }

  /**
   * Check all pending transactions and update their status
   */
  private async checkPendingTransactions(): Promise<void> {
    try {
      // Get all pending trades
      const pendingTrades = await prisma.trade.findMany({
        where: {
          status: 'PENDING',
          transactionHash: { not: null },
        },
        select: {
          id: true,
          userId: true,
          transactionHash: true,
          timestamp: true,
          market: true,
          side: true,
          size: true,
        },
      })

      if (pendingTrades.length === 0) {
        console.log('[TransactionMonitor] No pending transactions')
        return
      }

      console.log(`[TransactionMonitor] Checking ${pendingTrades.length} pending transaction(s)`)

      for (const trade of pendingTrades) {
        try {
          await this.checkTransaction(trade.id, trade.transactionHash!)
        } catch (error: any) {
          console.error(
            `[TransactionMonitor] Error checking transaction ${trade.transactionHash}:`,
            error.message
          )
        }
      }
    } catch (error: any) {
      console.error('[TransactionMonitor] Error in checkPendingTransactions:', error)
    }
  }

  /**
   * Check a specific transaction and update status
   */
  private async checkTransaction(tradeId: string, txHash: string): Promise<void> {
    try {
      // Get transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash)

      if (!receipt) {
        // Transaction not yet mined
        // Check if it's been too long (mark as stale/failed)
        const trade = await prisma.trade.findUnique({
          where: { id: tradeId },
          select: { timestamp: true },
        })

        if (trade) {
          const ageMinutes = (Date.now() - trade.timestamp.getTime()) / 1000 / 60
          if (ageMinutes > this.maxRetries * (this.checkIntervalMs / 1000 / 60)) {
            console.warn(
              `[TransactionMonitor] Transaction ${txHash} is stale (${ageMinutes.toFixed(1)}min old), marking as failed`
            )
            await this.markTransactionFailed(
              tradeId,
              'Transaction not confirmed after extended wait time'
            )
          }
        }
        return
      }

      // Transaction mined - check status
      if (receipt.status === 1) {
        // Success
        console.log(`[TransactionMonitor] ✅ Transaction ${txHash} confirmed`)
        await this.markTransactionCompleted(tradeId, receipt)
      } else {
        // Failed
        console.log(`[TransactionMonitor] ❌ Transaction ${txHash} failed`)
        await this.markTransactionFailed(tradeId, 'Transaction reverted on-chain')
      }
    } catch (error: any) {
      console.error(`[TransactionMonitor] Error checking transaction ${txHash}:`, error.message)
    }
  }

  /**
   * Mark transaction as completed
   */
  private async markTransactionCompleted(
    tradeId: string,
    receipt: ethers.TransactionReceipt
  ): Promise<void> {
    try {
      // Calculate gas cost
      const tx = await this.provider.getTransaction(receipt.hash)
      const gasCost = tx ? receipt.gasUsed * (tx.gasPrice || 0n) : 0n
      const gasCostInUSD = Number(ethers.formatEther(gasCost)) * 0.8 // Rough MATIC to USD conversion

      // Update trade status
      await prisma.trade.update({
        where: { id: tradeId },
        data: {
          status: 'COMPLETED',
          blockNumber: BigInt(receipt.blockNumber),
          gasUsed: receipt.gasUsed,
          gasPaid: gasCostInUSD,
        },
      })

      // Get trade details for notification
      const trade = await prisma.trade.findUnique({
        where: { id: tradeId },
        select: {
          userId: true,
          market: true,
          side: true,
          size: true,
          price: true,
        },
      })

      if (trade) {
        // Create notification
        await prisma.notification.create({
          data: {
            userId: trade.userId,
            type: 'TRADE_CONFIRMED',
            title: 'Trade Confirmed',
            message: `Your ${trade.side} trade for ${trade.size} shares has been confirmed on-chain.`,
            metadata: {
              tradeId,
              transactionHash: receipt.hash,
              blockNumber: receipt.blockNumber,
            },
          },
        })
      }

      console.log(`[TransactionMonitor] Trade ${tradeId} marked as COMPLETED`)
    } catch (error: any) {
      console.error(`[TransactionMonitor] Error marking trade ${tradeId} as completed:`, error)
    }
  }

  /**
   * Mark transaction as failed
   */
  private async markTransactionFailed(tradeId: string, reason: string): Promise<void> {
    try {
      await prisma.trade.update({
        where: { id: tradeId },
        data: {
          status: 'FAILED',
          errorMessage: reason,
        },
      })

      // Get trade details
      const trade = await prisma.trade.findUnique({
        where: { id: tradeId },
        select: {
          userId: true,
          transactionHash: true,
        },
      })

      if (trade) {
        // Create notification
        await prisma.notification.create({
          data: {
            userId: trade.userId,
            type: 'TRADE_FAILED',
            title: 'Trade Failed',
            message: `Your trade failed: ${reason}`,
            metadata: {
              tradeId,
              transactionHash: trade.transactionHash,
              reason,
            },
          },
        })
      }

      console.log(`[TransactionMonitor] Trade ${tradeId} marked as FAILED: ${reason}`)
    } catch (error: any) {
      console.error(`[TransactionMonitor] Error marking trade ${tradeId} as failed:`, error)
    }
  }

  /**
   * Manually check a specific trade's transaction
   */
  async checkTrade(tradeId: string): Promise<void> {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        transactionHash: true,
        status: true,
      },
    })

    if (!trade) {
      throw new Error('Trade not found')
    }

    if (trade.status !== 'PENDING') {
      console.log(`[TransactionMonitor] Trade ${tradeId} is not pending (status: ${trade.status})`)
      return
    }

    if (!trade.transactionHash) {
      throw new Error('Trade has no transaction hash')
    }

    await this.checkTransaction(tradeId, trade.transactionHash)
  }

  /**
   * Get monitor status
   */
  getStatus(): { isRunning: boolean; checkIntervalMs: number } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
    }
  }
}

// Singleton instance
export const transactionMonitor = new TransactionMonitor()

// Auto-start in production (if not already started)
if (process.env.NODE_ENV === 'production' && process.env.AUTO_START_MONITOR === 'true') {
  transactionMonitor.start()
}
