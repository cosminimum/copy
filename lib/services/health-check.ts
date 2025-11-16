/**
 * System Health Check Service
 * Monitors critical system components and sends alerts when issues are detected
 */

import { ethers } from 'ethers'
import { tradeModuleV3, POLYGON_RPC_URL } from '../contracts/trade-module-v3'

export interface HealthCheckResult {
  healthy: boolean
  checks: {
    operatorBalance: {
      healthy: boolean
      balance?: number
      threshold: number
      message?: string
    }
    moduleNotPaused: {
      healthy: boolean
      paused?: boolean
      message?: string
    }
    rpcConnected: {
      healthy: boolean
      blockNumber?: number
      message?: string
    }
    operatorIsOwner: {
      healthy: boolean
      currentOwner?: string
      expectedOwner?: string
      message?: string
    }
  }
  timestamp: Date
}

export class HealthCheckService {
  private checkIntervalMs: number
  private intervalId?: NodeJS.Timeout
  private isRunning: boolean = false
  private lastResult?: HealthCheckResult

  // Thresholds
  private minOperatorBalance: number = 0.05 // POL (lowered for test environment)
  private criticalOperatorBalance: number = 0.01 // POL

  constructor(checkIntervalMs: number = 60000) {
    this.checkIntervalMs = checkIntervalMs
  }

  /**
   * Start health check monitoring
   */
  start(): void {
    if (this.isRunning) {
      console.log('[HealthCheck] Already running')
      return
    }

    console.log('[HealthCheck] Starting health check service...')
    this.isRunning = true

    // Run immediately
    this.performHealthCheck()

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.performHealthCheck()
    }, this.checkIntervalMs)
  }

  /**
   * Stop health check monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    console.log('[HealthCheck] Stopping health check service...')
    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }

  /**
   * Get last health check result
   */
  getLastResult(): HealthCheckResult | undefined {
    return this.lastResult
  }

  /**
   * Perform complete health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      healthy: true,
      checks: {
        operatorBalance: {
          healthy: false,
          threshold: this.minOperatorBalance,
        },
        moduleNotPaused: {
          healthy: false,
        },
        rpcConnected: {
          healthy: false,
        },
        operatorIsOwner: {
          healthy: false,
        },
      },
      timestamp: new Date(),
    }

    try {
      const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
      const operatorAddress = process.env.OPERATOR_ADDRESS

      // 1. Check RPC connection
      try {
        const blockNumber = await provider.getBlockNumber()
        result.checks.rpcConnected.healthy = blockNumber > 0
        result.checks.rpcConnected.blockNumber = blockNumber

        if (!result.checks.rpcConnected.healthy) {
          result.checks.rpcConnected.message = 'Unable to fetch block number'
          result.healthy = false
        }
      } catch (error: any) {
        result.checks.rpcConnected.healthy = false
        result.checks.rpcConnected.message = `RPC connection failed: ${error.message}`
        result.healthy = false
        this.sendAlert('RPC_CONNECTION_FAILED', { error: error.message })
      }

      // 2. Check operator balance
      if (operatorAddress) {
        try {
          const balance = await provider.getBalance(operatorAddress)
          const balanceInPOL = parseFloat(ethers.formatEther(balance))

          result.checks.operatorBalance.balance = balanceInPOL
          result.checks.operatorBalance.healthy = balanceInPOL >= this.minOperatorBalance

          if (balanceInPOL < this.criticalOperatorBalance) {
            result.checks.operatorBalance.message = `CRITICAL: Operator balance very low (${balanceInPOL.toFixed(4)} POL)`
            result.healthy = false
            this.sendAlert('CRITICAL_LOW_OPERATOR_BALANCE', { balance: balanceInPOL })
          } else if (balanceInPOL < this.minOperatorBalance) {
            result.checks.operatorBalance.message = `WARNING: Operator balance low (${balanceInPOL.toFixed(4)} POL)`
            result.healthy = false
            this.sendAlert('LOW_OPERATOR_BALANCE', { balance: balanceInPOL })
          }
        } catch (error: any) {
          result.checks.operatorBalance.healthy = false
          result.checks.operatorBalance.message = `Failed to check operator balance: ${error.message}`
          result.healthy = false
        }
      } else {
        result.checks.operatorBalance.healthy = false
        result.checks.operatorBalance.message = 'OPERATOR_ADDRESS not configured'
        result.healthy = false
      }

      // 3. Check module not paused
      try {
        const paused = await tradeModuleV3.isPaused()
        result.checks.moduleNotPaused.paused = paused
        result.checks.moduleNotPaused.healthy = !paused

        if (paused) {
          result.checks.moduleNotPaused.message = 'TradeModule is paused - trading disabled'
          result.healthy = false
          this.sendAlert('MODULE_PAUSED', {})
        }
      } catch (error: any) {
        result.checks.moduleNotPaused.healthy = false
        result.checks.moduleNotPaused.message = `Failed to check pause status: ${error.message}`
        result.healthy = false
      }

      // 4. Check operator is owner of TradeModule
      if (operatorAddress) {
        try {
          const currentOwner = await tradeModuleV3.getOwner()
          result.checks.operatorIsOwner.currentOwner = currentOwner || undefined
          result.checks.operatorIsOwner.expectedOwner = operatorAddress
          result.checks.operatorIsOwner.healthy =
            currentOwner?.toLowerCase() === operatorAddress.toLowerCase()

          if (!result.checks.operatorIsOwner.healthy) {
            result.checks.operatorIsOwner.message = `Ownership mismatch! Current: ${currentOwner}, Expected: ${operatorAddress}`
            result.healthy = false
            this.sendAlert('OWNERSHIP_MISMATCH', { currentOwner, expectedOwner: operatorAddress })
          }
        } catch (error: any) {
          result.checks.operatorIsOwner.healthy = false
          result.checks.operatorIsOwner.message = `Failed to check ownership: ${error.message}`
          result.healthy = false
        }
      }

      // Log results
      if (!result.healthy) {
        console.error('[HealthCheck] ❌ System unhealthy:', JSON.stringify(result, null, 2))
      } else {
        console.log('[HealthCheck] ✅ System healthy')
      }

      this.lastResult = result
      return result
    } catch (error: any) {
      console.error('[HealthCheck] Error performing health check:', error)
      result.healthy = false
      this.lastResult = result
      return result
    }
  }

  /**
   * Send alert (implement with your alerting system)
   */
  private sendAlert(alertType: string, data: any): void {
    // TODO: Implement alerting (PagerDuty, Slack, email, etc.)
    console.error(`[HealthCheck] 🚨 ALERT: ${alertType}`, data)

    // Example: Send to Slack webhook
    // await fetch(process.env.SLACK_WEBHOOK_URL, {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     text: `🚨 Health Check Alert: ${alertType}`,
    //     attachments: [{ text: JSON.stringify(data, null, 2) }]
    //   })
    // })
  }

  /**
   * Check specific component
   */
  async checkOperatorBalance(): Promise<{ healthy: boolean; balance: number }> {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
    const operatorAddress = process.env.OPERATOR_ADDRESS

    if (!operatorAddress) {
      return { healthy: false, balance: 0 }
    }

    try {
      const balance = await provider.getBalance(operatorAddress)
      const balanceInPOL = parseFloat(ethers.formatEther(balance))

      return {
        healthy: balanceInPOL >= this.minOperatorBalance,
        balance: balanceInPOL,
      }
    } catch {
      return { healthy: false, balance: 0 }
    }
  }

  /**
   * Check if TradeModule is paused
   */
  async checkModulePaused(): Promise<{ healthy: boolean; paused: boolean }> {
    try {
      const paused = await tradeModuleV3.isPaused()
      return {
        healthy: !paused,
        paused,
      }
    } catch {
      return { healthy: false, paused: true }
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean
    checkIntervalMs: number
    lastCheck?: Date
    lastResult?: HealthCheckResult
  } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      lastCheck: this.lastResult?.timestamp,
      lastResult: this.lastResult,
    }
  }
}

// Singleton instance
export const healthCheckService = new HealthCheckService()

// Auto-start in production (if configured)
if (process.env.NODE_ENV === 'production' && process.env.AUTO_START_HEALTH_CHECK === 'true') {
  healthCheckService.start()
}
