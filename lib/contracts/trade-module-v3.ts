import { ethers } from 'ethers'

// Production TradeModule Contract Configuration
export const TRADE_MODULE_ADDRESS = process.env.TRADE_MODULE_ADDRESS || '0xca9842b9c41b7edDDF8C162a35c9BA7097a6649b'
export const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/srWXkJvSinNUHYbVJc9lf'
// Native USDC (new official version from Circle)
export const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Polygon Native USDC
// Old bridged USDC.e: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 (deprecated)
export const POLYMARKET_ROUTER_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'

// TradeModule ABI (Production - Verified on Polygonscan)
const TRADE_MODULE_ABI = [
  'function executeTrade(address _safe, bytes _tradeData) external',
  'function isEnabledOnSafe(address _safe) external view returns (bool)',
  'function paused() external view returns (bool)',
  'function owner() external view returns (address)',
  'function POLYMARKET_ROUTER() external view returns (address)',
  'function pause() external',
  'function unpause() external',
  'function transferOwnership(address newOwner) external',
  'event TradeExecuted(address indexed safe, address indexed target, bytes data, bool success)',
  'event Paused(address indexed operator)',
  'event Unpaused(address indexed operator)',
]

// Polymarket CTF Exchange ABI
const POLYMARKET_ROUTER_ABI = [
  `function fillOrder(
    tuple(
      uint256 salt,
      address maker,
      address signer,
      address taker,
      uint256 tokenId,
      uint256 makerAmount,
      uint256 takerAmount,
      uint256 expiration,
      uint256 nonce,
      uint256 feeRateBps,
      uint8 side,
      uint8 signatureType,
      bytes signature
    ) order,
    uint256 fillAmount
  ) external`,
]

// USDC ERC20 ABI
const USDC_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]

// Polymarket Order Structure (from CLOB API)
export interface PolymarketOrder {
  salt: string | bigint
  maker: string
  signer: string
  taker: string
  tokenId: string | bigint
  makerAmount: string | bigint
  takerAmount: string | bigint
  expiration: string | bigint
  nonce: string | bigint
  feeRateBps: string | bigint
  side: 0 | 1 // 0 = BUY, 1 = SELL
  signatureType: number
  signature: string
}

export interface ExecuteTradeResult {
  success: boolean
  transactionHash?: string
  error?: string
  errorCode?: string
  gasUsed?: bigint
  blockNumber?: number
}

export class TradeModuleV3 {
  private provider: ethers.JsonRpcProvider
  private contract: ethers.Contract
  private usdcContract: ethers.Contract
  private operatorWallet?: ethers.Wallet

  constructor() {
    this.provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
    this.contract = new ethers.Contract(TRADE_MODULE_ADDRESS, TRADE_MODULE_ABI, this.provider)
    this.usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, this.provider)

    // Initialize operator wallet (only operator can call executeTrade)
    // Skip initialization if private key is placeholder/invalid
    const operatorKey = process.env.OPERATOR_PRIVATE_KEY
    if (operatorKey && operatorKey !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      try {
        this.operatorWallet = new ethers.Wallet(operatorKey, this.provider)
      } catch (error) {
        console.warn('[TradeModule] Invalid OPERATOR_PRIVATE_KEY - operator functions disabled')
      }
    }
  }

  /**
   * Encode Polymarket fillOrder call for CTF Exchange
   */
  encodePolymarketFillOrder(order: PolymarketOrder, fillAmount: bigint): string {
    const polymarketInterface = new ethers.Interface(POLYMARKET_ROUTER_ABI)

    return polymarketInterface.encodeFunctionData('fillOrder', [
      {
        salt: BigInt(order.salt),
        maker: order.maker,
        signer: order.signer,
        taker: order.taker || ethers.ZeroAddress,
        tokenId: BigInt(order.tokenId),
        makerAmount: BigInt(order.makerAmount),
        takerAmount: BigInt(order.takerAmount),
        expiration: BigInt(order.expiration),
        nonce: BigInt(order.nonce),
        feeRateBps: BigInt(order.feeRateBps),
        side: order.side,
        signatureType: order.signatureType,
        signature: order.signature,
      },
      fillAmount,
    ])
  }

  /**
   * Execute a copy trade on behalf of user's Safe
   * Only callable by operator
   */
  async executeTrade(
    safeAddress: string,
    order: PolymarketOrder,
    fillAmount: bigint
  ): Promise<ExecuteTradeResult> {
    try {
      if (!this.operatorWallet) {
        return {
          success: false,
          errorCode: 'NO_OPERATOR_WALLET',
          error: 'Operator wallet not configured. Set OPERATOR_PRIVATE_KEY environment variable.',
        }
      }

      // 1. Verify module is enabled
      const isEnabled = await this.contract.isEnabledOnSafe(safeAddress)
      if (!isEnabled) {
        return {
          success: false,
          errorCode: 'MODULE_NOT_ENABLED',
          error: 'TradeModule not enabled on this Safe',
        }
      }

      // 2. Check if paused
      const paused = await this.contract.paused()
      if (paused) {
        return {
          success: false,
          errorCode: 'TRADING_PAUSED',
          error: 'Trading is currently paused',
        }
      }

      // 3. Encode trade data
      const tradeData = this.encodePolymarketFillOrder(order, fillAmount)

      // 4. Connect contract with operator wallet
      const contractWithOperator = this.contract.connect(this.operatorWallet) as any

      // 5. Estimate gas
      const gasEstimate = await contractWithOperator.executeTrade.estimateGas(
        safeAddress,
        tradeData
      )

      // 6. Get fee data
      const feeData = await this.provider.getFeeData()

      // 7. Execute trade
      const tx = await contractWithOperator.executeTrade(safeAddress, tradeData, {
        gasLimit: (gasEstimate * 130n) / 100n, // 30% buffer
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      })

      console.log(`[TradeModule] Trade executed! TX: ${tx.hash}`)
      console.log(`[TradeModule] 🔍 View on Polygonscan: https://polygonscan.com/tx/${tx.hash}`)

      // 8. Wait for confirmation
      const receipt = await tx.wait()

      if (!receipt || receipt.status !== 1) {
        console.log(`[TradeModule] ❌ Transaction reverted on-chain`)
        return {
          success: false,
          errorCode: 'TRANSACTION_FAILED',
          error: 'Transaction was reverted',
          transactionHash: tx.hash,
        }
      }

      console.log(`[TradeModule] ✅ Transaction confirmed in block ${receipt.blockNumber}`)

      return {
        success: true,
        transactionHash: receipt.hash,
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
      }
    } catch (error: any) {
      console.error('[TradeModule] executeTrade error:', error)

      // Parse known error codes
      let errorCode = 'UNKNOWN_ERROR'
      if (error.message.includes('SafeModuleNotEnabled')) {
        errorCode = 'MODULE_NOT_ENABLED'
      } else if (error.message.includes('ContractPaused')) {
        errorCode = 'TRADING_PAUSED'
      } else if (error.message.includes('TradeExecutionFailed')) {
        errorCode = 'TRADE_FAILED'
      } else if (error.message.includes('insufficient funds')) {
        errorCode = 'INSUFFICIENT_GAS'
      }

      return {
        success: false,
        errorCode,
        error: error.message || 'Unknown error during trade execution',
      }
    }
  }

  /**
   * Check if module is enabled on a Safe
   */
  async isEnabledOnSafe(safeAddress: string): Promise<boolean> {
    try {
      return await this.contract.isEnabledOnSafe(safeAddress)
    } catch (error: any) {
      console.error('[TradeModule] isEnabledOnSafe error:', error)
      return false
    }
  }

  /**
   * Check if trading is paused
   */
  async isPaused(): Promise<boolean> {
    try {
      return await this.contract.paused()
    } catch (error: any) {
      console.error('[TradeModule] isPaused error:', error)
      return true // Assume paused on error for safety
    }
  }

  /**
   * Get operator/owner address
   */
  async getOwner(): Promise<string | null> {
    try {
      return await this.contract.owner()
    } catch (error: any) {
      console.error('[TradeModule] getOwner error:', error)
      return null
    }
  }

  /**
   * Get whitelisted Polymarket router address
   */
  async getPolymarketRouter(): Promise<string | null> {
    try {
      return await this.contract.POLYMARKET_ROUTER()
    } catch (error: any) {
      console.error('[TradeModule] getPolymarketRouter error:', error)
      return null
    }
  }

  /**
   * Get USDC balance of a Safe
   */
  async getSafeBalance(safeAddress: string): Promise<number> {
    try {
      const balance = await this.usdcContract.balanceOf(safeAddress)
      return Number(ethers.formatUnits(balance, 6)) // USDC has 6 decimals
    } catch (error: any) {
      console.error('[TradeModule] getSafeBalance error:', error)
      return 0
    }
  }

  /**
   * Emergency pause trading (operator only)
   */
  async pause(): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (!this.operatorWallet) {
        return { success: false, error: 'Operator wallet not configured' }
      }

      const contractWithOperator = this.contract.connect(this.operatorWallet) as any
      const tx = await contractWithOperator.pause({ gasLimit: 100000 })

      console.log(`[TradeModule] Paused! TX: ${tx.hash}`)
      await tx.wait()

      return { success: true, txHash: tx.hash }
    } catch (error: any) {
      console.error('[TradeModule] pause error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Resume trading (operator only)
   */
  async unpause(): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (!this.operatorWallet) {
        return { success: false, error: 'Operator wallet not configured' }
      }

      const contractWithOperator = this.contract.connect(this.operatorWallet) as any
      const tx = await contractWithOperator.unpause({ gasLimit: 100000 })

      console.log(`[TradeModule] Unpaused! TX: ${tx.hash}`)
      await tx.wait()

      return { success: true, txHash: tx.hash }
    } catch (error: any) {
      console.error('[TradeModule] unpause error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Transfer ownership (operator only)
   */
  async transferOwnership(
    newOwner: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (!this.operatorWallet) {
        return { success: false, error: 'Operator wallet not configured' }
      }

      const contractWithOperator = this.contract.connect(this.operatorWallet) as any
      const tx = await contractWithOperator.transferOwnership(newOwner, { gasLimit: 100000 })

      console.log(`[TradeModule] Ownership transferred! TX: ${tx.hash}`)
      await tx.wait()

      return { success: true, txHash: tx.hash }
    } catch (error: any) {
      console.error('[TradeModule] transferOwnership error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Estimate gas cost for a trade
   */
  async estimateTradeGasCost(): Promise<{ gasLimit: bigint; estimatedCostPOL: string; estimatedCostUSD: string }> {
    const feeData = await this.provider.getFeeData()
    const gasLimit = 55000n // Average gas for executeTrade
    const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('100', 'gwei')

    const totalCostWei = gasLimit * maxFeePerGas
    const costInPOL = ethers.formatEther(totalCostWei)

    // Approximate POL to USD (should be fetched from price oracle in production)
    const polPriceUSD = 0.65
    const costInUSD = (parseFloat(costInPOL) * polPriceUSD).toFixed(4)

    return {
      gasLimit,
      estimatedCostPOL: costInPOL,
      estimatedCostUSD: costInUSD,
    }
  }

  /**
   * Listen for TradeExecuted events
   */
  onTradeExecuted(callback: (event: any) => void) {
    this.contract.on('TradeExecuted', (safe, target, data, success, event) => {
      callback({
        safe,
        target,
        data,
        success,
        transactionHash: event.log.transactionHash,
        blockNumber: event.log.blockNumber,
      })
    })
  }

  /**
   * Listen for Paused events
   */
  onPaused(callback: (operator: string) => void) {
    this.contract.on('Paused', callback)
  }

  /**
   * Listen for Unpaused events
   */
  onUnpaused(callback: (operator: string) => void) {
    this.contract.on('Unpaused', callback)
  }

  /**
   * Stop listening to all events
   */
  removeAllListeners() {
    this.contract.removeAllListeners()
  }
}

// Singleton instance
export const tradeModuleV3 = new TradeModuleV3()
