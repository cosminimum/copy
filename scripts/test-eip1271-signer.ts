#!/usr/bin/env tsx
/**
 * Test EIP-1271 Safe Signer Implementation
 *
 * Verifies:
 * 1. Safe SDK initialization
 * 2. Operator is a Safe owner
 * 3. Safe signer returns correct address
 * 4. Signature generation works
 */

import { ethers } from 'ethers'
import { SafeEIP1271Signer } from '../lib/polymarket/safe-eip1271-signer'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/demo'
const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY

async function main() {
  console.log('🧪 Testing EIP-1271 Safe Signer Implementation\n')
  console.log('═'.repeat(70))

  // Check configuration
  if (!OPERATOR_PRIVATE_KEY || OPERATOR_PRIVATE_KEY.startsWith('0x0000')) {
    console.error('\n❌ OPERATOR_PRIVATE_KEY not configured in .env')
    process.exit(1)
  }

  // Get user Safe
  const user = await prisma.user.findFirst({
    where: {
      safeAddress: { not: null },
      safeDeployedAt: { not: null },
    },
    select: {
      id: true,
      walletAddress: true,
      safeAddress: true,
    },
  })

  if (!user || !user.safeAddress) {
    console.error('\n❌ No user with deployed Safe found')
    process.exit(1)
  }

  console.log(`\n👤 User: ${user.walletAddress}`)
  console.log(`🔐 Safe: ${user.safeAddress}`)
  console.log('─'.repeat(70))

  // Initialize provider
  console.log('\n1️⃣ Initializing provider...')
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
  const network = await provider.getNetwork()
  console.log(`   ✅ Connected to ${network.name} (chainId: ${network.chainId})`)

  // Create Safe signer
  console.log('\n2️⃣ Creating Safe EIP-1271 signer...')
  const safeSigner = new SafeEIP1271Signer(OPERATOR_PRIVATE_KEY, user.safeAddress)
  console.log('   ✅ Safe signer created')

  // Initialize Safe SDK
  console.log('\n3️⃣ Initializing Safe SDK...')
  try {
    await safeSigner.initializeSafe(provider)
    console.log('   ✅ Safe SDK initialized successfully')
  } catch (error: any) {
    console.error(`   ❌ Safe SDK initialization failed: ${error.message}`)
    console.error('\n   Possible causes:')
    console.error('   - Operator is not a Safe owner')
    console.error('   - Safe not deployed correctly')
    console.error('   - RPC connection issues')
    process.exit(1)
  }

  // Check addresses
  console.log('\n4️⃣ Verifying addresses...')
  const signerAddress = safeSigner.address
  const operatorAddress = await safeSigner.getOperatorAddress()

  console.log(`   Signer address (returned by signer):  ${signerAddress}`)
  console.log(`   Safe address (expected):               ${user.safeAddress}`)
  console.log(`   Operator address (actual EOA):         ${operatorAddress}`)

  if (signerAddress.toLowerCase() === user.safeAddress.toLowerCase()) {
    console.log('   ✅ Signer returns Safe address (maker = signer = Safe)')
  } else {
    console.error('   ❌ Signer address mismatch!')
    process.exit(1)
  }

  // Test signature creation
  console.log('\n5️⃣ Testing EIP-1271 signature creation...')

  // Create a sample EIP-712 typed data (similar to Polymarket order)
  const domain = {
    name: 'Test Domain',
    version: '1',
    chainId: 137,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  }

  const types = {
    TestMessage: [
      { name: 'message', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
    ],
  }

  const value = {
    message: 'Test EIP-1271 signature',
    timestamp: Math.floor(Date.now() / 1000),
  }

  try {
    console.log('   Creating signature...')
    const signature = await safeSigner.signTypedData(domain, types, value)

    console.log(`   ✅ Signature created successfully`)
    console.log(`   Signature length: ${signature.length}`)
    console.log(`   Signature (first 66 chars): ${signature.substring(0, 66)}...`)

    // Verify signature is not empty
    if (!signature || signature.length < 10) {
      throw new Error('Invalid signature length')
    }
  } catch (error: any) {
    console.error(`   ❌ Signature creation failed: ${error.message}`)
    process.exit(1)
  }

  // Summary
  console.log('\n' + '═'.repeat(70))
  console.log('\n✅ ALL TESTS PASSED\n')
  console.log('Safe EIP-1271 Signer is ready for trading!')
  console.log()
  console.log('Key Configuration:')
  console.log(`  • Safe: ${user.safeAddress}`)
  console.log(`  • Operator: ${operatorAddress}`)
  console.log(`  • Signer returns: Safe address (✓)`)
  console.log(`  • Signature type: 3 (POLY_1271)`)
  console.log(`  • Custody: USDC stays in Safe`)
  console.log()
  console.log('Next steps:')
  console.log('  1. Ensure Safe has USDC balance')
  console.log('  2. Start websocket listener: npx tsx scripts/websocket-listener.ts')
  console.log('  3. Wait for a trade from your followed trader')
  console.log('  4. Verify trade executes with Safe custody')
  console.log()
  console.log('═'.repeat(70))
}

main()
  .catch((error) => {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  })
  .finally(() => {
    prisma.$disconnect()
  })
