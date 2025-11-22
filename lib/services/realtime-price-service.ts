import prisma from '@/lib/db/prisma'
import { PriceChanges, LastTradePrice } from '@/lib/polymarket/types'
import { EventEmitter } from 'events'

interface PriceUpdate {
  assetId: string
  conditionId: string
  price: number
  bestBid?: number
  bestAsk?: number
  timestamp: number
}

export class RealtimePriceService extends EventEmitter {
  private priceCache: Map<string, PriceUpdate> = new Map()
  private updateQueue: PriceUpdate[] = []
  private isProcessing = false
  private batchInterval = 1000 // Process updates every 1 second

  constructor() {
    super()
    this.startBatchProcessor()
  }

  async handlePriceChange(priceChanges: PriceChanges): Promise<void> {
    try {
      const conditionId = priceChanges.m
      const timestamp = parseInt(priceChanges.t)

      for (const priceChange of priceChanges.pc) {
        const assetId = priceChange.a
        const price = parseFloat(priceChange.p)
        const bestBid = priceChange.bb ? parseFloat(priceChange.bb) : undefined
        const bestAsk = priceChange.ba ? parseFloat(priceChange.ba) : undefined

        // Calculate mid-market price if both bid and ask are available
        const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : price

        const priceUpdate: PriceUpdate = {
          assetId,
          conditionId,
          price: midPrice,
          bestBid,
          bestAsk,
          timestamp,
        }

        // Update cache
        this.priceCache.set(assetId, priceUpdate)

        // Add to update queue for batch processing
        this.updateQueue.push(priceUpdate)

        // Emit event for SSE subscribers
        this.emit('price-update', priceUpdate)
      }
    } catch (error) {
      console.error('[RealtimePriceService] Error handling price change:', error)
    }
  }

  async handleLastTradePrice(lastTradePrice: LastTradePrice): Promise<void> {
    try {
      const assetId = lastTradePrice.asset_id
      const price = parseFloat(lastTradePrice.price)
      const conditionId = lastTradePrice.market

      const priceUpdate: PriceUpdate = {
        assetId,
        conditionId,
        price,
        timestamp: Date.now(),
      }

      // Update cache
      this.priceCache.set(assetId, priceUpdate)

      // Add to update queue
      this.updateQueue.push(priceUpdate)

      // Emit event for SSE subscribers
      this.emit('price-update', priceUpdate)
    } catch (error) {
      console.error('[RealtimePriceService] Error handling last trade price:', error)
    }
  }

  private startBatchProcessor(): void {
    setInterval(() => {
      if (this.updateQueue.length > 0 && !this.isProcessing) {
        this.processBatch()
      }
    }, this.batchInterval)
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.updateQueue.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      const updates = [...this.updateQueue]
      this.updateQueue = []

      // Group updates by asset ID to avoid duplicate updates
      const uniqueUpdates = new Map<string, PriceUpdate>()
      for (const update of updates) {
        uniqueUpdates.set(update.assetId, update)
      }

      // Update positions in database
      await this.updatePositionPrices(Array.from(uniqueUpdates.values()))
    } catch (error) {
      console.error('[RealtimePriceService] Error processing batch:', error)
    } finally {
      this.isProcessing = false
    }
  }

  private async updatePositionPrices(priceUpdates: PriceUpdate[]): Promise<void> {
    try {
      const assetIds = priceUpdates.map(u => u.assetId)

      // Find all open positions for these assets
      const positions = await prisma.position.findMany({
        where: {
          asset: { in: assetIds },
          status: 'OPEN',
        },
      })

      if (positions.length === 0) {
        return
      }

      // Update positions with new prices
      const updatePromises = positions.map(async (position) => {
        const priceUpdate = priceUpdates.find(u => u.assetId === position.asset)
        if (!priceUpdate) return

        const currentPrice = priceUpdate.price

        // Calculate unrealized P&L
        const unrealizedPnL = this.calculateUnrealizedPnL(
          position.size,
          position.entryPrice,
          currentPrice,
          position.side
        )

        // Update position
        return prisma.position.update({
          where: { id: position.id },
          data: {
            currentPrice,
            unrealizedPnL,
            updatedAt: new Date(),
          },
        })
      })

      await Promise.all(updatePromises)

      console.log(`[RealtimePriceService] Updated ${positions.length} positions with new prices`)
    } catch (error) {
      console.error('[RealtimePriceService] Error updating position prices:', error)
    }
  }

  private calculateUnrealizedPnL(
    size: number,
    entryPrice: number,
    currentPrice: number,
    side: string
  ): number {
    if (side === 'BUY') {
      // Long position: profit when price goes up
      return (currentPrice - entryPrice) * size
    } else {
      // Short position: profit when price goes down
      return (entryPrice - currentPrice) * size
    }
  }

  async subscribeToActiveMarkets(): Promise<string[]> {
    try {
      // Get all unique condition IDs from open positions
      const positions = await prisma.position.findMany({
        where: { status: 'OPEN' },
        select: { conditionId: true },
        distinct: ['conditionId'],
      })

      const conditionIds = positions
        .map(p => p.conditionId)
        .filter((id): id is string => id !== null && id !== undefined)

      console.log(`[RealtimePriceService] Subscribing to ${conditionIds.length} active markets`)

      return conditionIds
    } catch (error) {
      console.error('[RealtimePriceService] Error getting active markets:', error)
      return []
    }
  }

  getCachedPrice(assetId: string): PriceUpdate | undefined {
    return this.priceCache.get(assetId)
  }

  getAllCachedPrices(): Map<string, PriceUpdate> {
    return new Map(this.priceCache)
  }

  clearCache(): void {
    this.priceCache.clear()
    this.updateQueue = []
  }
}

// Singleton instance
export const realtimePriceService = new RealtimePriceService()
