#!/usr/bin/env tsx
/**
 * Check Safe owners on-chain
 */

import { ethers } from 'ethers'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/demo'
const OPERATOR_ADDRESS = process.env.OPERATOR_ADDRESS

// Safe ABI - just the methods we need
const SAFE_ABI = [
  'function getOwners() external view returns (address[])',
  'function getThreshold() external view returns (uint256)',
  'function isOwner(address owner) external view returns (bool)',
]

async function main() {
  console.log('🔍 Checking Safe Owners\n')
  console.log('═'.repeat(70))

  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)

  // Get user with Safe
  const user = await prisma.user.findFirst({
    where: {
      safeAddress: { not: null },
      safeDeployedAt: { not: null },
    },
  })

  if (!user || !user.safeAddress) {
    console.error('\n❌ No user with deployed Safe found')
    return
  }

  console.log(`\n👤 User: ${user.walletAddress}`)
  console.log(`🔐 Safe: ${user.safeAddress}`)
  console.log(`⚙️  Operator: ${OPERATOR_ADDRESS || 'Not configured'}`)
  console.log('─'.repeat(70))

  // Connect to Safe contract
  const safeContract = new ethers.Contract(user.safeAddress, SAFE_ABI, provider)

  try {
    // Get owners
    const owners = await safeContract.getOwners()
    const threshold = await safeContract.getThreshold()

    console.log(`\n📋 Safe Configuration:`)
    console.log(`   Threshold: ${threshold} of ${owners.length} owners required`)
    console.log()
    console.log(`👥 Owners (${owners.length}):`)

    for (let i = 0; i < owners.length; i++) {
      const owner = owners[i]
      const isUser = owner.toLowerCase() === user.walletAddress.toLowerCase()
      const isOperator = OPERATOR_ADDRESS && owner.toLowerCase() === OPERATOR_ADDRESS.toLowerCase()

      let label = ''
      if (isUser) label = ' ← User wallet'
      if (isOperator) label = ' ← Operator'

      console.log(`   ${i + 1}. ${owner}${label}`)
    }

    // Check if operator is an owner
    if (OPERATOR_ADDRESS) {
      console.log('\n🔍 Operator Status:')
      const operatorIsOwner = owners.some(
        (owner: string) => owner.toLowerCase() === OPERATOR_ADDRESS.toLowerCase()
      )

      if (operatorIsOwner) {
        console.log(`   ✅ Operator IS a Safe owner`)
        console.log(`   ✅ Can sign messages for EIP-1271`)
      } else {
        console.log(`   ❌ Operator IS NOT a Safe owner`)
        console.log(`   ❌ CANNOT sign messages for EIP-1271`)
        console.log()
        console.log(`   ⚠️  ACTION REQUIRED:`)
        console.log(`   Add operator as Safe owner:`)
        console.log(`   1. Go to https://app.safe.global`)
        console.log(`   2. Connect wallet: ${user.walletAddress}`)
        console.log(`   3. Select Safe: ${user.safeAddress}`)
        console.log(`   4. Settings → Owners → Add new owner`)
        console.log(`   5. Add operator: ${OPERATOR_ADDRESS}`)
      }
    } else {
      console.log('\n⚠️  OPERATOR_ADDRESS not configured in .env')
    }

    console.log('\n' + '═'.repeat(70))
  } catch (error: any) {
    console.error(`\n❌ Error reading Safe: ${error.message}`)
    console.log('   Safe may not be deployed correctly')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
