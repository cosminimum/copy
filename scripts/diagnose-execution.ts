#!/usr/bin/env tsx
/**
 * Comprehensive diagnostic tool for copy trading execution
 * Checks the entire flow and identifies what needs to be configured
 */

import { PrismaClient } from '@prisma/client'
import { safeManager } from '../lib/contracts/safe-manager'
import { tradeModuleV3 } from '../lib/contracts/trade-module-v3'

const prisma = new PrismaClient()

interface DiagnosticResult {
  status: 'ok' | 'warning' | 'error'
  message: string
  details?: any
}

async function main() {
  console.log('🔬 COPY TRADING EXECUTION DIAGNOSTIC\n')
  console.log('═'.repeat(70))
  console.log('Analyzing your copy trading setup...\n')

  const results: { [key: string]: DiagnosticResult } = {}

  // 1. Check execution mode
  console.log('📋 1. EXECUTION MODE')
  const useRealExecution = process.env.USE_REAL_EXECUTION === 'true'
  const mockSuccessRate = process.env.MOCK_TRADE_SUCCESS_RATE || '0.98'

  if (useRealExecution) {
    results.executionMode = {
      status: 'ok',
      message: '✅ Real execution enabled',
      details: { mode: 'REAL', useRealExecution }
    }
    console.log('   ✅ Mode: REAL EXECUTION')
  } else {
    results.executionMode = {
      status: 'warning',
      message: '⚠️  Mock execution enabled - trades are simulated',
      details: { mode: 'MOCK', useRealExecution, mockSuccessRate }
    }
    console.log('   ⚠️  Mode: MOCK EXECUTION (simulated)')
    console.log(`   Mock success rate: ${mockSuccessRate}`)
    console.log('   This is why you see "Insufficient balance" errors!')
  }
  console.log()

  // 2. Check users and Safe deployments
  console.log('👤 2. USER SAFES')
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      walletAddress: true,
      safeAddress: true,
    },
  })

  if (users.length === 0) {
    results.users = {
      status: 'error',
      message: '❌ No users found in database',
    }
    console.log('   ❌ No users found\n')
  } else {
    console.log(`   Found ${users.length} user(s)\n`)

    for (const user of users) {
      console.log('   ' + '─'.repeat(66))
      console.log(`   User: ${user.walletAddress}`)

      if (!user.safeAddress) {
        console.log(`   ❌ Safe: NOT DEPLOYED`)
        results[`user_${user.id}_safe`] = {
          status: 'error',
          message: 'Safe not deployed',
        }
        continue
      }

      console.log(`   ✅ Safe: ${user.safeAddress}`)

      // Check if Safe contract exists
      const isSafe = await safeManager.isSafe(user.safeAddress)
      if (!isSafe) {
        console.log(`   ❌ Warning: Address is not a valid Safe contract`)
        results[`user_${user.id}_safe`] = {
          status: 'error',
          message: 'Invalid Safe contract',
        }
        continue
      }

      // Get Safe info
      const safeInfo = await safeManager.getSafeInfo(user.safeAddress)
      if (!safeInfo) {
        console.log(`   ❌ Could not retrieve Safe info`)
        continue
      }

      console.log(`   Owners: ${safeInfo.owners.join(', ')}`)
      console.log(`   Threshold: ${safeInfo.threshold}`)

      // Check if TradeModule is enabled
      const isModuleEnabled = await tradeModuleV3.isEnabledOnSafe(user.safeAddress)
      if (isModuleEnabled) {
        console.log(`   ✅ TradeModule: ENABLED`)
        results[`user_${user.id}_module`] = {
          status: 'ok',
          message: 'TradeModule enabled',
        }
      } else {
        console.log(`   ❌ TradeModule: NOT ENABLED`)
        results[`user_${user.id}_module`] = {
          status: 'error',
          message: 'TradeModule not enabled - real trades will fail',
        }
      }

      // Check USDC balance
      const balance = await tradeModuleV3.getSafeBalance(user.safeAddress)
      console.log(`   💰 USDC Balance: $${balance.toFixed(2)}`)

      if (balance === 0) {
        console.log(`   ⚠️  Zero balance - cannot execute trades`)
        results[`user_${user.id}_balance`] = {
          status: 'warning',
          message: 'No USDC balance',
          details: { balance }
        }
      } else if (balance < 10) {
        console.log(`   ⚠️  Low balance - may only execute small trades`)
        results[`user_${user.id}_balance`] = {
          status: 'warning',
          message: 'Low USDC balance',
          details: { balance }
        }
      } else {
        results[`user_${user.id}_balance`] = {
          status: 'ok',
          message: 'Sufficient balance',
          details: { balance }
        }
      }

      console.log()
    }
  }

  // 3. Check operator wallet
  console.log('🔐 3. OPERATOR WALLET')
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY
  const operatorAddress = process.env.OPERATOR_ADDRESS

  if (!operatorKey || operatorKey === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    console.log('   ❌ OPERATOR_PRIVATE_KEY not configured')
    results.operator = {
      status: 'error',
      message: 'Operator wallet not configured',
    }
  } else {
    console.log('   ✅ OPERATOR_PRIVATE_KEY configured')
    if (operatorAddress) {
      console.log(`   Address: ${operatorAddress}`)
    }
    results.operator = {
      status: 'ok',
      message: 'Operator wallet configured',
    }
  }
  console.log()

  // 4. Check TradeModule contract
  console.log('📜 4. TRADEMODULE CONTRACT')
  const tradeModuleAddress = process.env.TRADE_MODULE_ADDRESS || '0xca9842b9c41b7edDDF8C162a35c9BA7097a6649b'
  console.log(`   Address: ${tradeModuleAddress}`)

  try {
    const isPaused = await tradeModuleV3.isPaused()
    if (isPaused) {
      console.log('   ⚠️  Status: PAUSED (trading disabled)')
      results.tradeModule = {
        status: 'warning',
        message: 'TradeModule is paused',
      }
    } else {
      console.log('   ✅ Status: ACTIVE')
      results.tradeModule = {
        status: 'ok',
        message: 'TradeModule is active',
      }
    }
  } catch (error) {
    console.log('   ❌ Could not check TradeModule status')
    results.tradeModule = {
      status: 'error',
      message: 'Could not connect to TradeModule',
    }
  }
  console.log()

  // 5. Check subscriptions
  console.log('👥 5. ACTIVE SUBSCRIPTIONS')
  const subscriptions = await prisma.subscription.findMany({
    where: { isActive: true },
    include: {
      user: {
        select: {
          walletAddress: true,
          safeAddress: true,
        },
      },
    },
  })

  if (subscriptions.length === 0) {
    console.log('   ⚠️  No active subscriptions')
    results.subscriptions = {
      status: 'warning',
      message: 'No traders being followed',
    }
  } else {
    console.log(`   ✅ ${subscriptions.length} active subscription(s)`)
    for (const sub of subscriptions) {
      console.log(`      → Following: ${sub.traderWalletAddress}`)
    }
    results.subscriptions = {
      status: 'ok',
      message: `${subscriptions.length} active subscriptions`,
    }
  }
  console.log()

  // 6. Summary and recommendations
  console.log('═'.repeat(70))
  console.log('📊 SUMMARY & RECOMMENDATIONS\n')

  const errors = Object.values(results).filter(r => r.status === 'error').length
  const warnings = Object.values(results).filter(r => r.status === 'warning').length

  if (errors === 0 && warnings === 0) {
    console.log('✅ All systems are ready for real execution!')
  } else {
    if (errors > 0) {
      console.log(`❌ ${errors} critical issue(s) found`)
    }
    if (warnings > 0) {
      console.log(`⚠️  ${warnings} warning(s) found`)
    }
  }

  console.log()

  // Provide actionable steps
  if (!useRealExecution) {
    console.log('🎯 TO ENABLE REAL EXECUTION:\n')
    console.log('1. Set USE_REAL_EXECUTION="true" in your .env file')
    console.log('2. Ensure your Safe has USDC balance:')
    console.log('   - Go to /dashboard')
    console.log('   - Use the "Deposit" button to fund your Safe')
    console.log('3. Ensure TradeModule is enabled on your Safe:')
    console.log('   - Go to /dashboard')
    console.log('   - Click "Enable Module" if not already enabled')
    console.log('4. Restart the websocket listener:')
    console.log('   npx tsx scripts/websocket-listener.ts')
    console.log()
    console.log('⚠️  CURRENT STATE: All trades are simulated!')
    console.log('   The "Insufficient balance" error is just a random mock failure.')
    console.log('   Your mock success rate is set to ' + mockSuccessRate)
  } else {
    if (errors > 0 || warnings > 0) {
      console.log('🔧 ISSUES TO FIX:\n')

      for (const [key, result] of Object.entries(results)) {
        if (result.status === 'error') {
          console.log(`❌ ${result.message}`)
        }
      }
      for (const [key, result] of Object.entries(results)) {
        if (result.status === 'warning') {
          console.log(`⚠️  ${result.message}`)
        }
      }
      console.log()
    }
  }

  console.log('═'.repeat(70))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
