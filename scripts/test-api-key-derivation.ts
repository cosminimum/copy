/**
 * Diagnostic Script: Test API Key Derivation
 *
 * This script tests the Polymarket API key derivation process in isolation
 * to diagnose authentication issues.
 *
 * Usage: npx tsx scripts/test-api-key-derivation.ts
 */

import { ClobClient } from '@polymarket/clob-client'
import { ethers } from 'ethers'
import dotenv from 'dotenv'

dotenv.config()

const CLOB_HOST = process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com'
const POLYGON_CHAIN_ID = 137
const POLYGON_RPC_URL =
  process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/demo'

/**
 * Ethers v5 compatible wallet for Polymarket SDK
 */
class EthersV5CompatibleWallet extends ethers.Wallet {
  async _signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>
  ): Promise<string> {
    return this.signTypedData(domain, types, value)
  }
}

async function testApiKeyDerivation() {
  console.log('🔍 API Key Derivation Diagnostic Test')
  console.log('=' .repeat(60))
  console.log()

  // Step 1: Check environment variables
  console.log('📋 Step 1: Checking environment variables...')
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY
  const operatorAddress = process.env.OPERATOR_ADDRESS

  if (!operatorKey || operatorKey === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    console.error('❌ OPERATOR_PRIVATE_KEY not configured in .env')
    process.exit(1)
  }
  console.log('✅ OPERATOR_PRIVATE_KEY configured')

  if (!operatorAddress) {
    console.error('❌ OPERATOR_ADDRESS not configured in .env')
    process.exit(1)
  }
  console.log('✅ OPERATOR_ADDRESS configured:', operatorAddress)
  console.log()

  // Step 2: Initialize provider
  console.log('📋 Step 2: Initializing provider...')
  console.log('   RPC URL:', POLYGON_RPC_URL)

  let provider: ethers.Provider
  try {
    provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
    const network = await provider.getNetwork()
    console.log('✅ Provider connected to network:')
    console.log('   Name:', network.name)
    console.log('   Chain ID:', network.chainId.toString())

    if (network.chainId !== BigInt(POLYGON_CHAIN_ID)) {
      console.error(`❌ Wrong network! Expected Polygon (${POLYGON_CHAIN_ID}), got ${network.chainId}`)
      process.exit(1)
    }
  } catch (error: any) {
    console.error('❌ Failed to connect to provider:', error.message)
    process.exit(1)
  }
  console.log()

  // Step 3: Create operator wallet
  console.log('📋 Step 3: Creating operator wallet...')
  let operatorWallet: EthersV5CompatibleWallet
  try {
    operatorWallet = new EthersV5CompatibleWallet(operatorKey, provider)
    const walletAddress = await operatorWallet.getAddress()
    console.log('✅ Operator wallet created')
    console.log('   Address:', walletAddress)

    // Verify it matches the configured address
    if (walletAddress.toLowerCase() !== operatorAddress.toLowerCase()) {
      console.error('❌ Wallet address mismatch!')
      console.error('   Expected:', operatorAddress)
      console.error('   Got:', walletAddress)
      process.exit(1)
    }
    console.log('✅ Address matches configured OPERATOR_ADDRESS')
  } catch (error: any) {
    console.error('❌ Failed to create operator wallet:', error.message)
    process.exit(1)
  }
  console.log()

  // Step 4: Check wallet balance
  console.log('📋 Step 4: Checking operator wallet balance...')
  try {
    const balance = await provider.getBalance(operatorWallet.address)
    const balancePOL = ethers.formatEther(balance)
    console.log('   POL Balance:', balancePOL, 'POL')

    if (balance === 0n) {
      console.warn('⚠️  Operator wallet has 0 POL balance!')
      console.warn('   You need POL for gas fees on Polygon network')
      console.warn('   Please fund the operator wallet with some POL')
    } else {
      console.log('✅ Operator wallet has POL for gas fees')
    }
  } catch (error: any) {
    console.error('❌ Failed to check balance:', error.message)
  }
  console.log()

  // Step 5: Test EIP-712 signing capability
  console.log('📋 Step 5: Testing EIP-712 signing capability...')
  try {
    const testDomain = {
      name: 'TestDomain',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
    }
    const testTypes = {
      Test: [{ name: 'message', type: 'string' }],
    }
    const testValue = {
      message: 'Test message',
    }

    const signature = await operatorWallet._signTypedData(testDomain, testTypes, testValue)
    console.log('✅ EIP-712 signature capability confirmed')
    console.log('   Signature format:', signature.substring(0, 20) + '...')
    console.log('   Signature length:', signature.length, 'chars')

    if (!signature.startsWith('0x')) {
      console.error('❌ Signature does not start with 0x!')
    } else if (signature.length !== 132) {
      console.error('❌ Signature length is not 132 chars (0x + 130 hex chars)!')
    } else {
      console.log('✅ Signature format is correct')
    }
  } catch (error: any) {
    console.error('❌ Failed to sign test message:', error.message)
    process.exit(1)
  }
  console.log()

  // Step 6: Create CLOB client and derive API key
  console.log('📋 Step 6: Creating CLOB client and deriving API key...')
  console.log('   CLOB Host:', CLOB_HOST)
  console.log('   Chain ID:', POLYGON_CHAIN_ID)
  console.log('   Using server time: true')
  console.log()

  let clobClient: ClobClient
  try {
    clobClient = new ClobClient(
      CLOB_HOST,
      POLYGON_CHAIN_ID,
      operatorWallet as any,
      undefined, // no creds yet
      undefined, // no signature type
      undefined, // no funder
      undefined, // no geo token
      true // useServerTime: prevent timestamp mismatch
    )
    console.log('✅ CLOB client created')
  } catch (error: any) {
    console.error('❌ Failed to create CLOB client:', error.message)
    console.error('   Full error:', error)
    process.exit(1)
  }
  console.log()

  // Step 7: Derive API key
  console.log('📋 Step 7: Deriving API key from Polymarket...')
  console.log('   This will sign an EIP-712 message to authenticate with Polymarket')
  console.log()

  try {
    // Use deriveApiKey directly - operator should already have API keys from Polymarket.com
    console.log('   Calling deriveApiKey()...')
    const apiKeyCreds = await clobClient.deriveApiKey()

    // Validate the credentials (SDK returns 'key' not 'apiKey', and 'passphrase' not 'passPhrase')
    if (!apiKeyCreds || !apiKeyCreds.key || !apiKeyCreds.passphrase) {
      throw new Error(
        'Invalid API credentials returned:\n' +
        `  API Key: ${apiKeyCreds?.key || 'undefined'}\n` +
        `  Secret: ${apiKeyCreds?.secret || 'undefined'}\n` +
        `  Passphrase: ${apiKeyCreds?.passphrase || 'undefined'}`
      )
    }

    console.log()
    console.log('🎉 SUCCESS! API key derived successfully!')
    console.log('=' .repeat(60))
    console.log('   Method: deriveApiKey (existing key)')
    console.log('   API Key:', apiKeyCreds.key.substring(0, 30) + '...')
    console.log('   Secret:', apiKeyCreds.secret ? '***hidden***' : 'MISSING')
    console.log('   Passphrase:', apiKeyCreds.passphrase ? '***hidden***' : 'MISSING')
    console.log()
    console.log('✅ Authentication is working correctly!')
    console.log('   You can now execute trades with this operator wallet.')
    console.log()
  } catch (error: any) {
    console.error()
    console.error('❌ API KEY DERIVATION FAILED')
    console.error('=' .repeat(60))
    console.error('   Error type:', error.constructor.name)
    console.error('   Error message:', error.message)
    console.error()

    // Check for specific error types
    if (error.message?.includes('401')) {
      console.error('🔍 401 Unauthorized Error Detected')
      console.error('   This means the Polymarket API rejected the authentication.')
      console.error()
      console.error('   Possible causes:')
      console.error('   1. The operator wallet signature is not being accepted')
      console.error('   2. Rate limiting or IP blocking by Cloudflare')
      console.error('   3. Network connectivity issues')
      console.error('   4. Incorrect CLOB_HOST or API endpoint')
      console.error()
      console.error('   Debugging steps:')
      console.error('   - Verify OPERATOR_PRIVATE_KEY is correct')
      console.error('   - Check that operator has POL for gas fees')
      console.error('   - Try again in a few minutes (rate limiting)')
      console.error('   - Check network connectivity to Polymarket API')
      console.error()
    } else if (error.message?.includes('403')) {
      console.error('🔍 403 Forbidden Error Detected')
      console.error('   This could be Cloudflare blocking the request.')
      console.error()
      console.error('   Possible causes:')
      console.error('   1. IP address is blocked or rate limited')
      console.error('   2. Cloudflare security rules')
      console.error('   3. Geographic restrictions')
      console.error()
    } else if (error.message?.includes('timeout')) {
      console.error('🔍 Timeout Error Detected')
      console.error('   The request timed out waiting for a response.')
      console.error()
      console.error('   Possible causes:')
      console.error('   1. Network connectivity issues')
      console.error('   2. Polymarket API is down or slow')
      console.error('   3. RPC provider is slow')
      console.error()
    }

    console.error('   Full error details:')
    console.error(JSON.stringify(error, null, 2))
    console.error()
    process.exit(1)
  }
}

// Run the test
testApiKeyDerivation().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
