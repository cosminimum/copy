#!/usr/bin/env tsx
/**
 * Test Polymarket CLOB API to see what the /book endpoint actually returns
 */

const tokenId = '87799116847875103478187928629916244342473925209287684667136064599163447151038'
const apiUrl = 'https://clob.polymarket.com'

async function main() {
  console.log('🔍 Testing Polymarket CLOB API\n')
  console.log(`Token ID: ${tokenId}\n`)
  console.log(`Fetching order book from: ${apiUrl}/book?token_id=${tokenId}\n`)

  try {
    const response = await fetch(`${apiUrl}/book?token_id=${tokenId}`)

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`)
      return
    }

    const data = await response.json()

    console.log('✅ Response received\n')
    console.log('=' .repeat(70))
    console.log('FULL RESPONSE:')
    console.log('='.repeat(70))
    console.log(JSON.stringify(data, null, 2))
    console.log('='.repeat(70))

    if (data.asks && data.asks.length > 0) {
      console.log('\n📊 BEST ASK (for buying):')
      console.log(JSON.stringify(data.asks[0], null, 2))
      console.log('\nFields present:', Object.keys(data.asks[0]))
    }

    if (data.bids && data.bids.length > 0) {
      console.log('\n📊 BEST BID (for selling):')
      console.log(JSON.stringify(data.bids[0], null, 2))
      console.log('\nFields present:', Object.keys(data.bids[0]))
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

main()
