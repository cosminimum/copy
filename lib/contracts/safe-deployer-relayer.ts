/**
 * Polymarket Builder Relayer Integration
 * Deploy Gnosis Safe wallets gaslessly using Polymarket's relayer service
 *
 * Note: This requires the following dependencies:
 * npm install @polymarket/builder-relayer-client@0.0.6 @polymarket/builder-signing-sdk viem@2
 */

import { createWalletClient, http, type WalletClient } from 'viem'
import { polygon } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

// Types for optional dependencies
type RelayClient = any
type BuilderConfig = any

// Environment variables
const RELAYER_URL = process.env.RELAYER_URL || 'https://relayer-v2.polymarket.com/'
const BUILDER_API_KEY = process.env.BUILDER_API_KEY
const BUILDER_SECRET = process.env.BUILDER_SECRET
const BUILDER_PASS_PHRASE = process.env.BUILDER_PASS_PHRASE

export interface SafeDeploymentResult {
  success: boolean
  proxyAddress?: string
  transactionHash?: string
  error?: string
}

export class SafeDeployerRelayer {
  private relayerUrl: string

  constructor() {
    this.relayerUrl = RELAYER_URL
  }

  /**
   * Check if Polymarket Builder credentials are configured
   */
  isConfigured(): boolean {
    return !!(BUILDER_API_KEY && BUILDER_SECRET && BUILDER_PASS_PHRASE)
  }

  /**
   * Deploy a Safe wallet gaslessly for a user using Polymarket's relayer
   *
   * @param userPrivateKey - The user's private key (will be sole owner of the Safe)
   * @returns Deployment result with Safe address
   */
  async deploySafeGasless(userPrivateKey: string): Promise<SafeDeploymentResult> {
    try {
      // Check if dependencies are available
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'Polymarket Builder credentials not configured. Set BUILDER_API_KEY, BUILDER_SECRET, and BUILDER_PASS_PHRASE environment variables.',
        }
      }

      // Dynamically import Polymarket packages (optional dependencies)
      let RelayClient: any
      let BuilderConfig: any

      try {
        const relayerModule = await import('@polymarket/builder-relayer-client')
        const signingModule = await import('@polymarket/builder-signing-sdk')

        RelayClient = relayerModule.RelayClient
        BuilderConfig = signingModule.BuilderConfig
      } catch (error: any) {
        return {
          success: false,
          error: 'Polymarket Builder packages not installed. Run: npm install @polymarket/builder-relayer-client@0.0.6 @polymarket/builder-signing-sdk viem@2',
        }
      }

      console.log('[SafeDeployerRelayer] Deploying Safe gaslessly via Polymarket...')

      // 1. Create user's wallet client
      const account = privateKeyToAccount(userPrivateKey as `0x${string}`)
      const wallet: WalletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(process.env.POLYGON_RPC_URL),
      })

      // 2. Configure Polymarket Builder credentials
      const builderConfig = new BuilderConfig({
        localBuilderCreds: {
          key: BUILDER_API_KEY!,
          secret: BUILDER_SECRET!,
          passphrase: BUILDER_PASS_PHRASE!,
        },
      })

      // 3. Create relay client
      const relayClient = new RelayClient(
        this.relayerUrl,
        137, // Polygon mainnet
        wallet,
        builderConfig
      )

      // 4. Deploy Safe (gasless - Polymarket pays gas)
      const response = await relayClient.deploy()
      const result = await response.wait()

      if (!result || !result.proxyAddress) {
        return {
          success: false,
          error: 'Safe deployment failed - no proxy address returned',
        }
      }

      console.log('[SafeDeployerRelayer] ✅ Safe deployed!')
      console.log('[SafeDeployerRelayer] Transaction:', result.transactionHash)
      console.log('[SafeDeployerRelayer] Safe Address:', result.proxyAddress)

      return {
        success: true,
        proxyAddress: result.proxyAddress as string,
        transactionHash: result.transactionHash as string,
      }
    } catch (error: any) {
      console.error('[SafeDeployerRelayer] Deployment error:', error)
      return {
        success: false,
        error: error.message || 'Unknown error during gasless Safe deployment',
      }
    }
  }

  /**
   * Estimate cost savings from gasless deployment
   * Returns the approximate gas cost that would be paid without the relayer
   */
  async estimateGasSavings(): Promise<{
    estimatedGasUnits: bigint
    estimatedCostPOL: string
    estimatedCostUSD: string
  }> {
    // Safe deployment typically costs ~250,000-300,000 gas
    const gasEstimate = 275000n

    // Get current gas price (requires ethers or viem provider)
    try {
      const { ethers } = await import('ethers')
      const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)
      const feeData = await provider.getFeeData()

      const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('100', 'gwei')
      const totalCostWei = gasEstimate * maxFeePerGas
      const costInPOL = ethers.formatEther(totalCostWei)

      // Approximate POL to USD
      const polPriceUSD = 0.65
      const costInUSD = (parseFloat(costInPOL) * polPriceUSD).toFixed(4)

      return {
        estimatedGasUnits: gasEstimate,
        estimatedCostPOL: costInPOL,
        estimatedCostUSD: costInUSD,
      }
    } catch (error) {
      // Fallback estimation
      return {
        estimatedGasUnits: gasEstimate,
        estimatedCostPOL: '0.055', // ~55 gwei * 275k gas
        estimatedCostUSD: '0.036', // ~$0.04
      }
    }
  }
}

// Singleton instance
export const safeDeployerRelayer = new SafeDeployerRelayer()
