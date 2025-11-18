#!/usr/bin/env tsx

/**
 * Polymarket WebSocket Listener
 *
 * This script listens to real-time Polymarket trade events and processes them
 * through the copy trading orchestrator to simulate trade copying.
 *
 * Usage:
 *   npx tsx scripts/websocket-listener.ts
 *
 * Prerequisites:
 *   1. Add real traders to database using scripts/add-traders.ts
 *   2. Users must follow traders via the /traders page
 *   3. Configure copy settings for each followed trader
 */

import { PrismaClient } from '@prisma/client'
import { PolymarketWebSocketService } from '../lib/polymarket/websocket-client.js'
import { TradeOrchestrator } from '../lib/orchestration/trade-orchestrator.js'
import { TradeMessage } from '../lib/polymarket/types.js'

const prisma = new PrismaClient()
const wsService = new PolymarketWebSocketService()
const orchestrator = new TradeOrchestrator()

// Configuration
const CONFIG = {
  logLevel: (process.env.WEBSOCKET_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
  reconnectDelay: 5000, // ms
  maxReconnectAttempts: 10,
}

// Statistics
let stats = {
  tradesReceived: 0,
  tradesProcessed: 0,
  tradesFailed: 0,
  lastTradeTime: null as Date | null,
  startTime: new Date(),
}

// Logging utilities
function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 }
  if (levels[level] >= levels[CONFIG.logLevel]) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args)
  }
}

// Subscribe to all trades (filtering happens in orchestrator)
function subscribeToAllTrades() {
  wsService.subscribeToAllTrades()
  log('info', '✓ Subscribed to all Polymarket trades')
}

// Handle incoming trades
async function handleTrade(trade: TradeMessage) {
  stats.tradesReceived++
  stats.lastTradeTime = new Date()

  // Only log detailed info at debug level initially
  log('debug', '━'.repeat(60))
  log('debug', `📊 Trade from ${trade.name || trade.pseudonym}: ${trade.side} ${trade.size} ${trade.outcome} @ $${trade.price.toFixed(4)}`)

  try {
    await orchestrator.processTradeEvent(trade)
    stats.tradesProcessed++
  } catch (error) {
    stats.tradesFailed++
    log('error', '✗ Failed to process trade:', error)
  }
}

// Print statistics
function printStats() {
  const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
  const hours = Math.floor(uptime / 3600)
  const minutes = Math.floor((uptime % 3600) / 60)
  const seconds = uptime % 60

  log('info', '\n' + '═'.repeat(60))
  log('info', 'STATISTICS')
  log('info', '═'.repeat(60))
  log('info', `Uptime: ${hours}h ${minutes}m ${seconds}s`)
  log('info', `Trades Received: ${stats.tradesReceived}`)
  log('info', `Trades Processed: ${stats.tradesProcessed}`)
  log('info', `Trades Failed: ${stats.tradesFailed}`)
  if (stats.lastTradeTime) {
    log('info', `Last Trade: ${stats.lastTradeTime.toLocaleString()}`)
  }
  log('info', '═'.repeat(60) + '\n')
}

// Main function
async function main() {
  log('info', '🚀 Polymarket WebSocket Listener Starting...')
  log('info', `Log Level: ${CONFIG.logLevel}`)
  log('info', '')

  let reconnectAttempts = 0

  async function connect() {
    try {
      log('info', '🔌 Connecting to Polymarket WebSocket...')
      await wsService.connect()
      log('info', '✓ Connected to Polymarket WebSocket')

      // Reset reconnect attempts on successful connection
      reconnectAttempts = 0

      // Subscribe to all trades
      log('info', 'Subscribing to all trades...')
      subscribeToAllTrades()

      // Register trade handler
      wsService.onTrade(handleTrade)

      log('info', '\n✓ Listener is now active and monitoring all trades')
      log('info', '  Orchestrator will filter for followed traders')
      log('info', '  Press Ctrl+C to stop\n')

      // Print stats every 5 minutes
      setInterval(printStats, 5 * 60 * 1000)
    } catch (error) {
      log('error', '✗ Connection error:', error)

      reconnectAttempts++
      if (reconnectAttempts <= CONFIG.maxReconnectAttempts) {
        log('warn', `Reconnect attempt ${reconnectAttempts}/${CONFIG.maxReconnectAttempts} in ${CONFIG.reconnectDelay / 1000}s...`)
        setTimeout(connect, CONFIG.reconnectDelay)
      } else {
        log('error', 'Max reconnection attempts reached. Exiting.')
        process.exit(1)
      }
    }
  }

  await connect()

  // Graceful shutdown
  process.on('SIGINT', async () => {
    log('info', '\n\n🛑 Shutting down gracefully...')
    printStats()

    wsService.disconnect()
    await prisma.$disconnect()

    log('info', '✓ Disconnected. Goodbye!')
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    log('info', '\n\n🛑 Shutting down gracefully...')
    printStats()

    wsService.disconnect()
    await prisma.$disconnect()

    log('info', '✓ Disconnected. Goodbye!')
    process.exit(0)
  })

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    log('error', 'Uncaught exception:', error)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason, promise) => {
    log('error', 'Unhandled rejection at:', promise, 'reason:', reason)
  })
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
