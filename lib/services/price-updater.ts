import prisma from '@/lib/db/prisma';
import { polymarketCLOB } from '@/lib/polymarket/clob-api-client';
import { Position } from '@prisma/client';

export class PriceUpdater {
  private clobClient: typeof polymarketCLOB;

  constructor() {
    this.clobClient = polymarketCLOB;
  }

  /**
   * Update prices for all open positions
   */
  async updateAllPositionPrices(): Promise<{
    updated: number;
    failed: number;
    errors: Array<{ positionId: string; error: string }>;
  }> {
    const positions = await prisma.position.findMany({
      where: { status: 'OPEN' },
    });

    let updated = 0;
    let failed = 0;
    const errors: Array<{ positionId: string; error: string }> = [];

    console.log(`[PriceUpdater] Updating prices for ${positions.length} open positions`);

    for (const position of positions) {
      try {
        const priceUpdate = await this.updatePositionPrice(position);
        if (priceUpdate) {
          updated++;
        }
      } catch (error) {
        failed++;
        errors.push({
          positionId: position.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`[PriceUpdater] Failed to update position ${position.id}:`, error);
      }
    }

    console.log(`[PriceUpdater] Updated ${updated} positions, ${failed} failed`);
    return { updated, failed, errors };
  }

  /**
   * Update price for a single position
   */
  async updatePositionPrice(position: Position): Promise<boolean> {
    if (!position.asset) {
      console.warn(`[PriceUpdater] Position ${position.id} has no asset/tokenId, skipping`);
      return false;
    }

    try {
      // Get current market price
      const currentPrice = await this.clobClient.getMidMarketPrice(position.asset);

      if (!currentPrice || currentPrice === 0) {
        console.warn(`[PriceUpdater] No valid price for token ${position.asset}, skipping`);
        return false;
      }

      // Calculate unrealized P&L
      const unrealizedPnL = this.calculateUnrealizedPnL(
        position.size,
        position.entryPrice,
        currentPrice,
        position.side
      );

      // Update position in database
      await prisma.position.update({
        where: { id: position.id },
        data: {
          currentPrice,
          unrealizedPnL,
          updatedAt: new Date(),
        },
      });

      console.log(
        `[PriceUpdater] Updated position ${position.id}: price=${currentPrice}, unrealizedPnL=${unrealizedPnL}`
      );

      return true;
    } catch (error) {
      console.error(`[PriceUpdater] Error updating position ${position.id}:`, error);
      throw error;
    }
  }

  /**
   * Calculate unrealized P&L for a position
   */
  private calculateUnrealizedPnL(
    size: number,
    entryPrice: number,
    currentPrice: number,
    side: string
  ): number {
    if (side === 'BUY') {
      // Long position: profit when price goes up
      return (currentPrice - entryPrice) * size;
    } else {
      // Short position: profit when price goes down
      return (entryPrice - currentPrice) * size;
    }
  }

  /**
   * Update prices for positions of a specific user
   */
  async updateUserPositionPrices(userId: string): Promise<number> {
    const positions = await prisma.position.findMany({
      where: {
        userId,
        status: 'OPEN',
      },
    });

    let updated = 0;

    for (const position of positions) {
      try {
        const success = await this.updatePositionPrice(position);
        if (success) updated++;
      } catch (error) {
        console.error(`[PriceUpdater] Failed to update position ${position.id}:`, error);
      }
    }

    return updated;
  }

  /**
   * Get current price for a token
   */
  async getCurrentPrice(tokenId: string): Promise<number> {
    const price = await this.clobClient.getMidMarketPrice(tokenId);
    return price || 0;
  }
}
