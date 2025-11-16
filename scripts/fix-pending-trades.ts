#!/usr/bin/env tsx
/**
 * Fix PENDING trades - mark successful trades as COMPLETED
 *
 * Context: Trades were being marked as PENDING even though transactions
 * were already confirmed. This script updates them to COMPLETED.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Fixing PENDING trades...\n')

  // Find all PENDING trades that have a transaction hash (meaning they executed)
  const pendingTrades = await prisma.trade.findMany({
    where: {
      status: 'PENDING',
    },
  })

  if (pendingTrades.length === 0) {
    console.log('✅ No PENDING trades found. All good!')
    return
  }

  console.log(`Found ${pendingTrades.length} PENDING trade(s)\n`)

  let updated = 0
  let skipped = 0

  for (const trade of pendingTrades) {
    console.log(`Trade ${trade.id}:`)
    console.log(`  Market: ${trade.market}`)
    console.log(`  Side: ${trade.side} ${trade.size} @ $${trade.price}`)
    console.log(`  TxHash: ${trade.transactionHash || 'N/A'}`)
    console.log(`  Created: ${trade.timestamp.toLocaleString()}`)

    // If trade has a transaction hash and no error, it should be COMPLETED
    if (trade.transactionHash && !trade.errorMessage) {
      await prisma.trade.update({
        where: { id: trade.id },
        data: { status: 'COMPLETED' },
      })
      console.log(`  ✅ Updated to COMPLETED\n`)
      updated++
    } else {
      console.log(`  ⚠️  Skipped (no transaction hash or has error)\n`)
      skipped++
    }
  }

  console.log('─'.repeat(60))
  console.log(`\n📊 Results:`)
  console.log(`  ${updated} trade(s) updated to COMPLETED`)
  console.log(`  ${skipped} trade(s) skipped`)
  console.log('\n✅ Done!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
