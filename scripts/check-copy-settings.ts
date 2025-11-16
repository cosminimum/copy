#!/usr/bin/env tsx
/**
 * Check user's copy settings to understand validation rules
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('📋 Checking Copy Settings\n')
  console.log('═'.repeat(70))

  const users = await prisma.user.findMany({
    include: {
      subscriptions: true,
      copySettings: true,
    },
  })

  for (const user of users) {
    console.log(`\n👤 User: ${user.walletAddress}`)
    console.log(`   Safe: ${user.safeAddress || 'Not deployed'}`)

    console.log('\n📊 Copy Settings:')

    if (user.copySettings.length === 0) {
      console.log('   ⚠️  No copy settings found')
      continue
    }

    for (const setting of user.copySettings) {
      console.log('\n   ' + '─'.repeat(66))
      console.log(`   ${setting.isGlobal ? '🌐 Global Settings' : `📍 Trader-Specific: ${setting.traderWalletAddress}`}`)
      console.log(`   Active: ${setting.isActive ? '✅' : '❌'}`)
      console.log()
      console.log(`   Position Sizing:`)
      console.log(`     Type: ${setting.positionSizeType}`)
      console.log(`     Value: ${setting.positionSizeValue}`)
      console.log()
      console.log(`   Risk Limits:`)
      console.log(`     Max Position Size: ${setting.maxPositionSize || 'Unlimited'}`)
      console.log(`     Max Total Exposure: ${setting.maxTotalExposure || 'Unlimited'}`)
      console.log()
      console.log(`   Trade Filters:`)
      console.log(`     Min Trade Size: ${setting.minTradeSize || 'None'}`)
      console.log(`     Max Trade Size: ${setting.maxTradeSize || 'None'}`)
      console.log(`     Min Odds: ${setting.minOdds || 'None'}`)
      console.log(`     Max Odds: ${setting.maxOdds || 'None'}`)
    }

    // Check current positions
    console.log('\n\n📈 Current Positions:')
    const positions = await prisma.position.findMany({
      where: {
        userId: user.id,
        status: 'OPEN',
      },
    })

    if (positions.length === 0) {
      console.log('   No open positions')
    } else {
      for (const pos of positions) {
        console.log(`\n   Market: ${pos.market}`)
        console.log(`   Side: ${pos.side} ${pos.outcome}`)
        console.log(`   Size: ${pos.size} shares`)
        console.log(`   Entry: $${pos.entryPrice.toFixed(4)}`)
        console.log(`   Value: $${pos.value.toFixed(2)}`)
      }
    }

    console.log('\n')
  }

  console.log('═'.repeat(70))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
