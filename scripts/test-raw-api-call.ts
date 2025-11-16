/**
 * Manual API Call Test
 *
 * Directly calls Polymarket's API to see the raw response
 */

import { ethers } from 'ethers'
import dotenv from 'dotenv'
import fetch from 'node-fetch'

dotenv.config()

const CLOB_HOST = 'https://clob.polymarket.com'
const POLYGON_CHAIN_ID = 137
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/demo'

class EthersV5CompatibleWallet extends ethers.Wallet {
  async _signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>
  ): Promise<string> {
    return this.signTypedData(domain, types, value)
  }
}

async function testRawApiCall() {
  console.log('🔍 Testing Raw Polymarket API Call')
  console.log('=' .repeat(60))
  console.log()

  // Get operator wallet
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY
  if (!operatorKey) {
    console.error('❌ OPERATOR_PRIVATE_KEY not configured')
    process.exit(1)
  }

  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
  const wallet = new EthersV5CompatibleWallet(operatorKey, provider)
  const address = await wallet.getAddress()

  console.log('Operator Address:', address)
  console.log()

  // Get server time first
  console.log('📋 Step 1: Getting server time...')
  const timeResponse = await fetch(`${CLOB_HOST}/time`)
  const timeData = await timeResponse.json()
  console.log('Server time:', timeData)
  const timestamp = Math.floor(Date.now() / 1000)
  console.log('Using timestamp:', timestamp)
  console.log()

  // Create EIP-712 signature for API authentication
  console.log('📋 Step 2: Creating EIP-712 signature...')

  const domain = {
    name: 'ClobAuthDomain',
    version: '1',
    chainId: POLYGON_CHAIN_ID,
  }

  const types = {
    ClobAuth: [
      { name: 'address', type: 'address' },
      { name: 'timestamp', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'message', type: 'string' },
    ],
  }

  const nonce = 0
  const value = {
    address: address,
    timestamp: timestamp.toString(),
    nonce: nonce,
    message: 'This message attests that I control the given wallet',
  }

  console.log('Signing message:', JSON.stringify(value, null, 2))

  const signature = await wallet._signTypedData(domain, types, value)
  console.log('Signature:', signature)
  console.log('Signature length:', signature.length)
  console.log()

  // Try CREATE API KEY endpoint
  console.log('📋 Step 3: Calling CREATE API KEY endpoint...')
  console.log('POST', `${CLOB_HOST}/auth/api-key`)

  const createHeaders = {
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'POLY_ADDRESS': address,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp.toString(),
    'POLY_NONCE': nonce.toString(),
  }

  console.log('Headers:', JSON.stringify(createHeaders, null, 2))
  console.log()

  try {
    const createResponse = await fetch(`${CLOB_HOST}/auth/api-key`, {
      method: 'POST',
      headers: createHeaders,
    })

    console.log('Response Status:', createResponse.status, createResponse.statusText)
    console.log('Response Headers:', Object.fromEntries(createResponse.headers.entries()))

    const createText = await createResponse.text()
    console.log('Response Body (raw):', createText)

    try {
      const createData = JSON.parse(createText)
      console.log('Response Body (parsed):', JSON.stringify(createData, null, 2))
    } catch (e) {
      console.log('Could not parse as JSON')
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message)
  }

  console.log()
  console.log('=' .repeat(60))

  // Try DERIVE API KEY endpoint
  console.log('📋 Step 4: Calling DERIVE API KEY endpoint...')
  console.log('GET', `${CLOB_HOST}/auth/derive-api-key`)

  try {
    const deriveResponse = await fetch(`${CLOB_HOST}/auth/derive-api-key`, {
      method: 'GET',
      headers: createHeaders,
    })

    console.log('Response Status:', deriveResponse.status, deriveResponse.statusText)
    console.log('Response Headers:', Object.fromEntries(deriveResponse.headers.entries()))

    const deriveText = await deriveResponse.text()
    console.log('Response Body (raw):', deriveText)

    try {
      const deriveData = JSON.parse(deriveText)
      console.log('Response Body (parsed):', JSON.stringify(deriveData, null, 2))
    } catch (e) {
      console.log('Could not parse as JSON')
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message)
  }

  console.log()
}

testRawApiCall().catch(console.error)
