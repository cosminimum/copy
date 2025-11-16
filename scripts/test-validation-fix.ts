#!/usr/bin/env tsx
/**
 * Test the validation fix - max position size should be in USD, not shares
 */

import { positionCalculator } from '../lib/trading/position-calculator'

console.log('🧪 Testing Position Size Validation Fix\n')
console.log('═'.repeat(70))

// Scenario: User has max position size of $100
const settings = {
  positionSizeType: 'PROPORTIONAL',
  positionSizeValue: 0.1,
  maxPositionSize: 100, // $100 USD limit
}

// Current position: 0.25 shares at $0.40 = $0.10 value
const currentPositions = [
  {
    market: 'atp-shelton-augeral-2025-11-11',
    size: 0.25,
    value: 0.10, // $0.10 USD
  },
]

// New trade: $0.10 worth at $0.001 per share = 100 shares
const calculatedTrade = {
  market: 'atp-shelton-augeral-2025-11-11',
  asset: 'token123',
  conditionId: 'cond123',
  outcome: 'Shelton',
  outcomeIndex: 0,
  side: 'BUY',
  price: 0.001,
  size: 100, // 100 shares
  value: 0.10, // $0.10 USD
}

console.log('\n📊 Test Scenario:')
console.log('─'.repeat(70))
console.log('Max Position Size Limit: $100.00')
console.log()
console.log('Current Position:')
console.log(`  Market: ${currentPositions[0].market}`)
console.log(`  Size: ${currentPositions[0].size} shares`)
console.log(`  Value: $${currentPositions[0].value.toFixed(2)}`)
console.log()
console.log('New Trade:')
console.log(`  Market: ${calculatedTrade.market}`)
console.log(`  Size: ${calculatedTrade.size} shares`)
console.log(`  Value: $${calculatedTrade.value.toFixed(2)}`)
console.log()
console.log('Total After Trade:')
console.log(`  Shares: ${currentPositions[0].size + calculatedTrade.size} shares`)
console.log(`  Value: $${(currentPositions[0].value + calculatedTrade.value).toFixed(2)}`)

console.log('\n🔍 Validation Result:')
console.log('─'.repeat(70))

const result = positionCalculator.validateTrade(
  calculatedTrade as any,
  currentPositions,
  settings as any
)

if (result.valid) {
  console.log('✅ PASS: Trade is allowed')
  console.log()
  console.log('   The total value ($0.20) is well below the limit ($100.00)')
  console.log('   This is correct! ✅')
} else {
  console.log('❌ FAIL: Trade was rejected')
  console.log(`   Reason: ${result.reason}`)
  console.log()
  console.log('   This should NOT have been rejected!')
  console.log('   The bug is NOT fixed yet! ❌')
}

console.log()
console.log('═'.repeat(70))
console.log()
console.log('💡 Explanation:')
console.log()
console.log('The max position size limit is in DOLLARS, not shares.')
console.log('We should compare:')
console.log('  - Current VALUE: $0.10')
console.log('  - New VALUE: $0.10')
console.log('  - Total: $0.20')
console.log('  - Limit: $100.00')
console.log()
console.log('Since $0.20 < $100.00, the trade should be ALLOWED.')
console.log()
console.log('═'.repeat(70))
