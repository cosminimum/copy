#!/usr/bin/env tsx
/**
 * Check USDC balances for user Safes
 * Verifies both Native USDC and old bridged USDC.e
 */

import { PrismaClient } from '@prisma/client'
import { ethers } from 'ethers'

const prisma = new PrismaClient()

// USDC Token Addresses on Polygon
const NATIVE_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Official from Circle
const BRIDGED_USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // Old bridged (deprecated)

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
]

async function main() {
  console.log('💰 USDC BALANCE CHECK\n')
  console.log('═'.repeat(70))

  // Get RPC URL
  const rpcUrl = process.env.POLYGON_RPC_URL || process.env.NEXT_PUBLIC_POLYGON_RPC_URL
  if (!rpcUrl) {
    console.error('❌ POLYGON_RPC_URL not configured in .env')
    process.exit(1)
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  console.log('✅ Connected to Polygon RPC\n')

  // Get users with Safe addresses
  const users = await prisma.user.findMany({
    where: {
      safeAddress: {
        not: null,
      },
    },
    select: {
      id: true,
      email: true,
      walletAddress: true,
      safeAddress: true,
    },
  })

  if (users.length === 0) {
    console.log('⚠️  No users with deployed Safes found\n')
    return
  }

  console.log(`Found ${users.length} user(s) with deployed Safes\n`)

  for (const user of users) {
    console.log('─'.repeat(70))
    console.log(`User: ${user.walletAddress}`)
    console.log(`Safe: ${user.safeAddress}`)
    console.log()

    if (!user.safeAddress) continue

    try {
      // Check Native USDC balance
      const nativeUSDC = new ethers.Contract(NATIVE_USDC, ERC20_ABI, provider)
      const nativeBalance = await nativeUSDC.balanceOf(user.safeAddress)
      const nativeBalanceFormatted = Number(ethers.formatUnits(nativeBalance, 6))

      // Check Bridged USDC.e balance
      const bridgedUSDC = new ethers.Contract(BRIDGED_USDC_E, ERC20_ABI, provider)
      const bridgedBalance = await bridgedUSDC.balanceOf(user.safeAddress)
      const bridgedBalanceFormatted = Number(ethers.formatUnits(bridgedBalance, 6))

      console.log('💵 Native USDC (Circle - CURRENT):')
      console.log(`   Address: ${NATIVE_USDC}`)
      console.log(`   Balance: $${nativeBalanceFormatted.toFixed(6)} USDC`)

      if (nativeBalanceFormatted === 0) {
        console.log('   ⚠️  Zero balance - this Safe cannot execute trades!')
      } else if (nativeBalanceFormatted < 5) {
        console.log('   ⚠️  Low balance - can only execute small trades')
      } else {
        console.log('   ✅ Sufficient balance for trading')
      }

      console.log()
      console.log('💵 Bridged USDC.e (DEPRECATED):')
      console.log(`   Address: ${BRIDGED_USDC_E}`)
      console.log(`   Balance: $${bridgedBalanceFormatted.toFixed(6)} USDC.e`)

      if (bridgedBalanceFormatted > 0) {
        console.log('   ⚠️  You have old USDC.e tokens!')
        console.log('   ⚠️  These will NOT work with copy trading (code uses Native USDC)')
        console.log('   💡 Consider swapping to Native USDC on a DEX')
      } else {
        console.log('   ✅ No deprecated USDC.e tokens')
      }

      console.log()
      console.log('📊 SUMMARY:')
      console.log(`   Total USDC value: $${(nativeBalanceFormatted + bridgedBalanceFormatted).toFixed(2)}`)
      console.log(`   Usable for trading: $${nativeBalanceFormatted.toFixed(2)} (Native USDC only)`)
      console.log()

    } catch (error: any) {
      console.error('   ❌ Error checking balances:', error.message)
    }
  }

  console.log('─'.repeat(70))
  console.log()
  console.log('💡 IMPORTANT:')
  console.log('   • This system ONLY supports Native USDC (0x3c499c...)')
  console.log('   • Old bridged USDC.e (0x2791B...) is NOT supported')
  console.log('   • Make sure to send Native USDC to your Safe for trading')
  console.log()
  console.log('🔍 View Safe on Polygonscan:')
  for (const user of users) {
    if (user.safeAddress) {
      console.log(`   https://polygonscan.com/address/${user.safeAddress}`)
    }
  }
  console.log()
  console.log('═'.repeat(70))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
