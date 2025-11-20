import prisma from '@/lib/db/prisma';
import { PriceUpdater } from './price-updater';
import { Position } from '@prisma/client';

export interface PortfolioValue {
  totalValue: number;
  cashBalance: number;
  positionsValue: number;
  totalPnL: number;
  unrealizedPnL: number;
  realizedPnL: number;
  dailyPnL: number;
  activePositionsCount: number;
}

export class PortfolioCalculator {
  private priceUpdater: PriceUpdater;

  constructor() {
    this.priceUpdater = new PriceUpdater();
  }

  /**
   * Calculate current portfolio value for a user
   */
  async calculatePortfolioValue(userId: string): Promise<PortfolioValue> {
    // Get user's wallet info for cash balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });

    if (!user?.walletAddress) {
      throw new Error('User has no wallet address');
    }

    // Get all positions (open and closed)
    const [openPositions, closedPositions] = await Promise.all([
      prisma.position.findMany({
        where: { userId, status: 'OPEN' },
      }),
      prisma.position.findMany({
        where: { userId, status: 'CLOSED' },
      }),
    ]);

    // Calculate unrealized P&L from open positions
    const unrealizedPnL = openPositions.reduce(
      (sum: number, position: Position) => sum + (position.unrealizedPnL || 0),
      0
    );

    // Calculate realized P&L from closed positions
    const realizedPnL = closedPositions.reduce(
      (sum: number, position: Position) => sum + (position.realizedPnL || 0),
      0
    );

    // Calculate total P&L
    const totalPnL = unrealizedPnL + realizedPnL;

    // Calculate positions value (sum of current position values)
    const positionsValue = openPositions.reduce((sum: number, position: Position) => {
      const currentPrice = position.currentPrice || position.entryPrice;
      return sum + currentPrice * position.size;
    }, 0);

    // Get cash balance from Safe (if available)
    // For now, we'll use a placeholder or fetch from Safe API
    const cashBalance = await this.getCashBalance(user.walletAddress);

    // Total portfolio value = cash + positions value
    const totalValue = cashBalance + positionsValue;

    // Calculate daily P&L (compare with previous snapshot if available)
    const dailyPnL = await this.calculateDailyPnL(userId, totalValue);

    return {
      totalValue,
      cashBalance,
      positionsValue,
      totalPnL,
      unrealizedPnL,
      realizedPnL,
      dailyPnL,
      activePositionsCount: openPositions.length,
    };
  }

  /**
   * Create a portfolio snapshot
   */
  async createPortfolioSnapshot(userId: string): Promise<void> {
    const portfolioValue = await this.calculatePortfolioValue(userId);

    await prisma.portfolioSnapshot.create({
      data: {
        userId,
        totalValue: portfolioValue.totalValue,
        cashBalance: portfolioValue.cashBalance,
        positionsValue: portfolioValue.positionsValue,
        totalPnL: portfolioValue.totalPnL,
        dailyPnL: portfolioValue.dailyPnL,
        openPositions: portfolioValue.activePositionsCount,
        closedTrades: 0, // TODO: Calculate from closed positions
        winRate: 0, // TODO: Calculate from closed positions
        avgReturn: 0, // TODO: Calculate average return
      },
    });

    console.log(
      `[PortfolioCalculator] Created snapshot for user ${userId}: totalValue=${portfolioValue.totalValue}`
    );
  }

  /**
   * Calculate daily P&L by comparing with snapshot from 24 hours ago
   */
  private async calculateDailyPnL(userId: string, currentValue: number): Promise<number> {
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const previousSnapshot = await prisma.portfolioSnapshot.findFirst({
      where: {
        userId,
        createdAt: {
          lte: oneDayAgo,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!previousSnapshot) {
      return 0;
    }

    return currentValue - previousSnapshot.totalValue;
  }

  /**
   * Get cash balance from Safe wallet
   */
  private async getCashBalance(walletAddress: string): Promise<number> {
    try {
      // TODO: Implement actual Safe API call to get USDC balance
      // For now, we'll query from a balance table if it exists,
      // or return 0 as placeholder

      // Check if there's a wallet balance record
      const balance = await prisma.$queryRaw<Array<{ balance: number }>>`
        SELECT balance FROM wallet_balances
        WHERE wallet_address = ${walletAddress}
        ORDER BY updated_at DESC
        LIMIT 1
      `.catch(() => []);

      if (balance && balance.length > 0) {
        return balance[0].balance;
      }

      return 0;
    } catch (error) {
      console.error('[PortfolioCalculator] Error fetching cash balance:', error);
      return 0;
    }
  }

  /**
   * Update all positions and create snapshots for all users
   */
  async updateAllUsersPortfolios(): Promise<void> {
    // First, update all position prices
    await this.priceUpdater.updateAllPositionPrices();

    // Get all users with positions
    const users = await prisma.user.findMany({
      where: {
        positions: {
          some: {},
        },
      },
      select: {
        id: true,
      },
    });

    console.log(`[PortfolioCalculator] Creating snapshots for ${users.length} users`);

    for (const user of users) {
      try {
        await this.createPortfolioSnapshot(user.id);
      } catch (error) {
        console.error(`[PortfolioCalculator] Error creating snapshot for user ${user.id}:`, error);
      }
    }
  }
}
