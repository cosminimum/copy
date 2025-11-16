#!/usr/bin/env tsx
/**
 * Check operator wallet balances (USDC and POL)
 */

import { ethers } from 'ethers'

const OPERATOR_ADDRESS = process.env.OPERATOR_ADDRESS || '0xCbDE9686C88dc090C0F0CCe732d98ECADc06AF31'
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/srWXkJvSinNUHYbVJc9lf'
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Native USDC

const USDC_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]

async function main() {
  console.log('💰 OPERATOR WALLET BALANCE CHECK\n')
  console.log('═'.repeat(70))

  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
  const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider)

  console.log(`\n🔐 Operator Wallet: ${OPERATOR_ADDRESS}`)
  console.log('─'.repeat(70))

  try {
    // Get POL balance
    const polBalance = await provider.getBalance(OPERATOR_ADDRESS)
    const polFormatted = Number(ethers.formatEther(polBalance))

    // Get USDC balance
    const usdcBalance = await usdcContract.balanceOf(OPERATOR_ADDRESS)
    const usdcFormatted = Number(ethers.formatUnits(usdcBalance, 6))

    console.log('\n📊 Balances:')
    console.log(`   POL:  ${polFormatted.toFixed(4)} POL`)
    console.log(`   USDC: $${usdcFormatted.toFixed(2)} USDC`)

    console.log('\n📋 Status:')

    // Check POL
    if (polFormatted >= 1) {
      console.log('   ✅ POL: Sufficient for gas fees')
    } else if (polFormatted >= 0.1) {
      console.log('   ⚠️  POL: Low balance (consider adding more)')
    } else {
      console.log('   ❌ POL: Insufficient for gas fees!')
    }

    // Check USDC (operator doesn't need USDC in TradeModule architecture)
    console.log('   ℹ️  USDC: $' + usdcFormatted.toFixed(2) + ' (not required for TradeModule)')

    console.log('\n🔗 View on Polygonscan:')
    console.log(`   https://polygonscan.com/address/${OPERATOR_ADDRESS}`)

    console.log('\n📝 Note:')
    console.log('─'.repeat(70))
    console.log('   With TradeModule architecture:')
    console.log('   - Operator wallet only needs POL for gas ✅')
    console.log('   - User Safes hold USDC for trading')
    console.log('   - Run "npx tsx scripts/diagnose-execution.ts" to check user Safes')

    if (polFormatted < 0.1) {
      console.log('\n⚠️  ACTION REQUIRED:')
      console.log('─'.repeat(70))
      console.log('   Operator wallet needs POL for gas fees!')
      console.log()
      console.log(`   Transfer POL to: ${OPERATOR_ADDRESS}`)
      console.log(`   Recommended amount: 1-5 POL`)
      console.log(`   Network: Polygon`)
    } else {
      console.log('\n✅ Operator wallet is ready! (has sufficient POL for gas)')
    }

    console.log('\n═'.repeat(70))
  } catch (error: any) {
    console.error('\n❌ Error checking balances:', error.message)
    console.log('\nMake sure POLYGON_RPC_URL is configured correctly in .env')
  }
}

main().catch(console.error)
