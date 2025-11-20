#!/usr/bin/env tsx

import { PriceUpdater } from '@/lib/services/price-updater';
import { PortfolioCalculator } from '@/lib/services/portfolio-calculator';

const PRICE_UPDATE_INTERVAL = 30 * 1000; // 30 seconds
const SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 minutes

class PriceUpdateService {
  private priceUpdater: PriceUpdater;
  private portfolioCalculator: PortfolioCalculator;
  private isRunning = false;
  private priceUpdateTimer: NodeJS.Timeout | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.priceUpdater = new PriceUpdater();
    this.portfolioCalculator = new PortfolioCalculator();
  }

  async start() {
    if (this.isRunning) {
      console.log('[PriceUpdateService] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[PriceUpdateService] Starting price update service...');
    console.log(`[PriceUpdateService] Price updates every ${PRICE_UPDATE_INTERVAL / 1000}s`);
    console.log(`[PriceUpdateService] Portfolio snapshots every ${SNAPSHOT_INTERVAL / 1000}s`);

    // Initial update
    await this.updatePrices();
    await this.createSnapshots();

    // Schedule periodic updates
    this.priceUpdateTimer = setInterval(async () => {
      await this.updatePrices();
    }, PRICE_UPDATE_INTERVAL);

    this.snapshotTimer = setInterval(async () => {
      await this.createSnapshots();
    }, SNAPSHOT_INTERVAL);

    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    console.log('[PriceUpdateService] Service started successfully');
  }

  async updatePrices() {
    try {
      console.log('[PriceUpdateService] Updating position prices...');
      const result = await this.priceUpdater.updateAllPositionPrices();
      console.log(
        `[PriceUpdateService] Price update complete: ${result.updated} updated, ${result.failed} failed`
      );

      if (result.errors.length > 0) {
        console.error('[PriceUpdateService] Errors during price update:');
        result.errors.forEach((err) => {
          console.error(`  Position ${err.positionId}: ${err.error}`);
        });
      }
    } catch (error) {
      console.error('[PriceUpdateService] Error updating prices:', error);
    }
  }

  async createSnapshots() {
    try {
      console.log('[PriceUpdateService] Creating portfolio snapshots...');
      await this.portfolioCalculator.updateAllUsersPortfolios();
      console.log('[PriceUpdateService] Portfolio snapshots created');
    } catch (error) {
      console.error('[PriceUpdateService] Error creating snapshots:', error);
    }
  }

  stop() {
    console.log('[PriceUpdateService] Stopping service...');
    this.isRunning = false;

    if (this.priceUpdateTimer) {
      clearInterval(this.priceUpdateTimer);
      this.priceUpdateTimer = null;
    }

    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }

    console.log('[PriceUpdateService] Service stopped');
    process.exit(0);
  }
}

// Start the service
const service = new PriceUpdateService();
service.start().catch((error) => {
  console.error('[PriceUpdateService] Fatal error:', error);
  process.exit(1);
});
