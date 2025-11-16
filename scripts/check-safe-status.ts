#!/usr/bin/env tsx
/**
 * Check Safe deployment and module status for users
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Checking Safe deployment and module status...\n')

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      walletAddress: true,
      safeAddress: true,
      createdAt: true,
    },
  })

  if (users.length === 0) {
    console.log('❌ No users found in database')
    return
  }

  console.log(`Found ${users.length} user(s):\n`)

  for (const user of users) {
    console.log('─'.repeat(60))
    console.log(`User ID: ${user.id}`)
    console.log(`Email: ${user.email || 'N/A'}`)
    console.log(`Wallet: ${user.walletAddress}`)
    console.log(`Safe: ${user.safeAddress || '❌ NOT DEPLOYED'}`)
    console.log(`Created: ${user.createdAt.toLocaleString()}`)

    if (user.safeAddress) {
      // TODO: Check if TradeModule is enabled on Safe
      console.log('Status: ✅ Safe deployed (Module status: check manually)')
    } else {
      console.log('Status: ⚠️  Safe not deployed - user cannot execute real trades')
    }
    console.log()
  }

  console.log('─'.repeat(60))
  console.log('\n📋 Summary:')
  const safesDeployed = users.filter(u => u.safeAddress).length
  console.log(`  ${safesDeployed}/${users.length} users have Safes deployed`)
  console.log(`  ${users.length - safesDeployed}/${users.length} users need to deploy Safes`)

  console.log('\n💡 To enable real execution:')
  console.log('  1. Deploy a Safe for each user (via /dashboard)')
  console.log('  2. Enable TradeModule on the Safe')
  console.log('  3. Fund the Safe with USDC')
  console.log('  4. Set USE_REAL_EXECUTION="true" in .env')
  console.log('  5. Restart the websocket listener')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
