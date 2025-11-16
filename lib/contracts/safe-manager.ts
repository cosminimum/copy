import { ethers } from 'ethers'
import { TRADE_MODULE_ADDRESS, POLYGON_RPC_URL } from './trade-module-v3'

// Gnosis Safe Configuration for Polygon
export const SAFE_SINGLETON_ADDRESS = process.env.SAFE_SINGLETON_ADDRESS || '0x3E5c63644E683549055b9Be8653de26E0B4CD36E' // Safe v1.3.0
export const SAFE_PROXY_FACTORY_ADDRESS = process.env.SAFE_PROXY_FACTORY_ADDRESS || '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2'
export const SAFE_FALLBACK_HANDLER = process.env.SAFE_FALLBACK_HANDLER || '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4'

// Safe Proxy Factory ABI
const SAFE_PROXY_FACTORY_ABI = [
  'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) public returns (address proxy)',
  'function proxyCreationCode() public pure returns (bytes memory)',
  'event ProxyCreation(address indexed proxy, address singleton)',
]

// Safe Contract ABI (for setup and module management)
const SAFE_ABI = [
  'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
  'function enableModule(address module) external',
  'function disableModule(address prevModule, address module) external',
  'function isModuleEnabled(address module) external view returns (bool)',
  'function getModules() external view returns (address[] memory)',
  'function getOwners() external view returns (address[] memory)',
  'function getThreshold() external view returns (uint256)',
  'function isOwner(address owner) external view returns (bool)',
  'event EnabledModule(address module)',
  'event DisabledModule(address module)',
]

export interface SafeDeployment {
  success: boolean
  safeAddress?: string
  transactionHash?: string
  error?: string
  blockNumber?: number
}

export interface SafeInfo {
  address: string
  owners: string[]
  threshold: number
  modulesEnabled: string[]
  isTradeModuleEnabled: boolean
}

export class SafeManager {
  private provider: ethers.JsonRpcProvider
  private proxyFactory: ethers.Contract
  private signer?: ethers.Wallet

  constructor() {
    this.provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
    this.proxyFactory = new ethers.Contract(
      SAFE_PROXY_FACTORY_ADDRESS,
      SAFE_PROXY_FACTORY_ABI,
      this.provider
    )

    // Initialize signer if private key is provided
    if (process.env.DEPLOYER_PRIVATE_KEY) {
      this.signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, this.provider)
    }
  }

  /**
   * Deploy a new Gnosis Safe for a user
   * The Safe will have the user AND operator as owners with threshold 1
   * This allows EIP-1271 signature creation for Polymarket trading
   * TradeModuleV3 will be automatically enabled
   */
  async deploySafe(ownerAddress: string, saltNonce?: bigint): Promise<SafeDeployment> {
    try {
      if (!this.signer) {
        throw new Error('Signer not configured. Set DEPLOYER_PRIVATE_KEY environment variable.')
      }

      console.log(`[SafeManager] Deploying Safe for owner: ${ownerAddress}`)

      // Get operator address from environment
      const operatorAddress = process.env.OPERATOR_ADDRESS

      // Prepare owners array
      let owners: string[]
      if (operatorAddress && operatorAddress !== ownerAddress) {
        // Include both user and operator as owners
        // Sort addresses (required by Safe)
        owners = [ownerAddress, operatorAddress].sort((a, b) =>
          a.toLowerCase() < b.toLowerCase() ? -1 : 1
        )
        console.log(`[SafeManager] Safe will have 2 owners:`)
        console.log(`[SafeManager]   1. User: ${ownerAddress}`)
        console.log(`[SafeManager]   2. Operator: ${operatorAddress}`)
        console.log(`[SafeManager] Threshold: 1 (either can sign for EIP-1271)`)
      } else {
        // Single owner (fallback if operator not configured)
        owners = [ownerAddress]
        console.log(`[SafeManager] ⚠️  OPERATOR_ADDRESS not configured - Safe will have single owner`)
        console.log(`[SafeManager] EIP-1271 signing will not work until operator is added as owner`)
      }

      // Generate salt nonce if not provided (use timestamp + random)
      const nonce = saltNonce || BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1000000))

      // Encode the Safe setup call with multiple owners
      const setupData = this.encodeSafeSetup(owners, 1, TRADE_MODULE_ADDRESS)

      // Predict the Safe address before deployment
      const predictedAddress = await this.predictSafeAddress(owners, nonce)

      // Deploy Safe proxy
      const factoryWithSigner = this.proxyFactory.connect(this.signer) as any
      const tx = await factoryWithSigner.createProxyWithNonce(
        SAFE_SINGLETON_ADDRESS,
        setupData,
        nonce
      )

      console.log(`[SafeManager] Safe deployment tx sent: ${tx.hash}`)

      const receipt = await tx.wait()

      // Parse ProxyCreation event to get actual Safe address
      const event = receipt.logs
        .map((log: any) => {
          try {
            return this.proxyFactory.interface.parseLog(log)
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === 'ProxyCreation')

      const safeAddress = event ? event.args.proxy : predictedAddress

      console.log(`[SafeManager] ✅ Safe deployed at: ${safeAddress}`)
      console.log(`[SafeManager] Owners: ${owners.length}`)
      console.log(`[SafeManager] TradeModule must be enabled by Safe owner before trading`)

      return {
        success: true,
        safeAddress,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      }
    } catch (error: any) {
      console.error('[SafeManager] deploySafe error:', error)
      return {
        success: false,
        error: error.message || 'Unknown error during Safe deployment',
      }
    }
  }

  /**
   * Encode Safe setup data
   * Note: Module enabling happens post-deployment via separate transaction
   */
  private encodeSafeSetup(owners: string[], threshold: number, moduleToEnable: string): string {
    const safeInterface = new ethers.Interface(SAFE_ABI)

    // Encode the full setup call WITHOUT module enabling during setup
    // Module will be enabled in a separate transaction after deployment
    return safeInterface.encodeFunctionData('setup', [
      owners, // _owners
      threshold, // _threshold
      ethers.ZeroAddress, // to (no delegatecall during setup)
      '0x', // data (no additional setup call)
      SAFE_FALLBACK_HANDLER, // fallbackHandler
      ethers.ZeroAddress, // paymentToken (no payment)
      0, // payment (no payment)
      ethers.ZeroAddress, // paymentReceiver
    ])
  }

  /**
   * Predict Safe address before deployment
   */
  async predictSafeAddress(owners: string[], saltNonce: bigint): Promise<string> {
    try {
      const setupData = this.encodeSafeSetup(owners, 1, TRADE_MODULE_ADDRESS)
      const proxyCreationCode = await this.proxyFactory.proxyCreationCode()

      // Calculate create2 address
      const initCode = ethers.concat([
        proxyCreationCode,
        AbiCoder.defaultAbiCoder().encode(['address'], [SAFE_SINGLETON_ADDRESS]),
      ])

      const salt = ethers.keccak256(
        ethers.concat([
          ethers.keccak256(setupData),
          AbiCoder.defaultAbiCoder().encode(['uint256'], [saltNonce]),
        ])
      )

      const hash = ethers.keccak256(
        ethers.concat([
          '0xff',
          SAFE_PROXY_FACTORY_ADDRESS,
          salt,
          ethers.keccak256(initCode),
        ])
      )

      return ethers.getAddress('0x' + hash.slice(-40))
    } catch (error: any) {
      console.error('[SafeManager] predictSafeAddress error:', error)
      throw error
    }
  }

  /**
   * Check if a module is enabled on a Safe
   */
  async isModuleEnabled(safeAddress: string, moduleAddress: string): Promise<boolean> {
    try {
      const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, this.provider)
      return await safeContract.isModuleEnabled(moduleAddress)
    } catch (error: any) {
      console.error('[SafeManager] isModuleEnabled error:', error)
      return false
    }
  }

  /**
   * Enable a module on an existing Safe (requires Safe owner signature)
   */
  async enableModule(safeAddress: string, moduleAddress: string): Promise<boolean> {
    try {
      if (!this.signer) {
        throw new Error('Signer not configured.')
      }

      const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, this.signer)

      // Check if already enabled
      const isEnabled = await safeContract.isModuleEnabled(moduleAddress)
      if (isEnabled) {
        console.log(`[SafeManager] Module ${moduleAddress} already enabled on ${safeAddress}`)
        return true
      }

      const tx = await safeContract.enableModule(moduleAddress)
      console.log(`[SafeManager] enableModule tx sent: ${tx.hash}`)

      await tx.wait()
      console.log(`[SafeManager] Module ${moduleAddress} enabled on ${safeAddress}`)

      return true
    } catch (error: any) {
      console.error('[SafeManager] enableModule error:', error)
      return false
    }
  }

  /**
   * Add operator as owner to an existing Safe
   * This is used for gasless-deployed Safes that were created with only the user as owner
   * Requires the user's private key to sign the transaction
   *
   * @param safeAddress - The Safe contract address
   * @param userPrivateKey - User's private key (must be current Safe owner)
   * @param newThreshold - Optional new threshold (defaults to 1)
   */
  async addOperatorAsOwner(
    safeAddress: string,
    userPrivateKey: string,
    newThreshold: number = 1
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      const operatorAddress = process.env.OPERATOR_ADDRESS
      if (!operatorAddress) {
        return {
          success: false,
          error: 'OPERATOR_ADDRESS not configured in environment variables',
        }
      }

      console.log(`[SafeManager] Adding operator as owner to Safe ${safeAddress}`)

      // Create signer from user's private key
      const userWallet = new ethers.Wallet(userPrivateKey, this.provider)

      // Connect to Safe contract with user's wallet
      const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, userWallet)

      // Get current owners
      const currentOwners: string[] = await safeContract.getOwners()
      const currentThreshold = await safeContract.getThreshold()

      // Check if operator is already an owner
      const isAlreadyOwner = currentOwners.some(
        (owner) => owner.toLowerCase() === operatorAddress.toLowerCase()
      )

      if (isAlreadyOwner) {
        console.log(`[SafeManager] Operator ${operatorAddress} is already an owner`)
        return { success: true }
      }

      console.log(`[SafeManager] Current owners: ${currentOwners.length}`)
      console.log(`[SafeManager] Current threshold: ${currentThreshold}`)
      console.log(`[SafeManager] Adding: ${operatorAddress}`)
      console.log(`[SafeManager] New threshold: ${newThreshold}`)

      // Safe requires addOwnerWithThreshold to be called
      // addOwnerWithThreshold(address owner, uint256 _threshold)
      const safeInterface = new ethers.Interface([
        'function addOwnerWithThreshold(address owner, uint256 _threshold) external',
      ])

      const addOwnerData = safeInterface.encodeFunctionData('addOwnerWithThreshold', [
        operatorAddress,
        newThreshold,
      ])

      // Execute the transaction through Safe
      // For a 1-of-1 Safe, we can call directly
      // Note: This assumes the Safe can execute transactions directly
      const tx = await userWallet.sendTransaction({
        to: safeAddress,
        data: addOwnerData,
        gasLimit: 200000,
      })

      console.log(`[SafeManager] addOwner tx sent: ${tx.hash}`)

      const receipt = await tx.wait()

      console.log(`[SafeManager] ✅ Operator added as owner`)
      console.log(`[SafeManager] New owners: ${currentOwners.length + 1}`)
      console.log(`[SafeManager] Threshold: ${newThreshold}`)

      return {
        success: true,
        transactionHash: receipt!.hash,
      }
    } catch (error: any) {
      console.error('[SafeManager] addOperatorAsOwner error:', error)
      return {
        success: false,
        error: error.message || 'Failed to add operator as owner',
      }
    }
  }

  /**
   * Get Safe information
   */
  async getSafeInfo(safeAddress: string): Promise<SafeInfo | null> {
    try {
      const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, this.provider)

      const [owners, threshold, modules] = await Promise.all([
        safeContract.getOwners(),
        safeContract.getThreshold(),
        safeContract.getModules().catch(() => []),
      ])

      const isTradeModuleEnabled = modules.includes(TRADE_MODULE_ADDRESS)

      return {
        address: safeAddress,
        owners,
        threshold: Number(threshold),
        modulesEnabled: modules,
        isTradeModuleEnabled,
      }
    } catch (error: any) {
      console.error('[SafeManager] getSafeInfo error:', error)
      return null
    }
  }

  /**
   * Check if an address is a Safe contract
   */
  async isSafe(address: string): Promise<boolean> {
    try {
      const code = await this.provider.getCode(address)
      // If contract has code, check if it has Safe methods
      if (code === '0x' || code === '0x0') {
        return false
      }

      const safeContract = new ethers.Contract(address, SAFE_ABI, this.provider)
      // Try calling a Safe-specific method
      await safeContract.getOwners()
      return true
    } catch {
      return false
    }
  }

  /**
   * Get Safe deployment cost estimate
   */
  async estimateDeploymentCost(): Promise<{ gasEstimate: bigint; estimatedCostInMATIC: number } | null> {
    try {
      if (!this.signer) {
        throw new Error('Signer not configured.')
      }

      // Create a dummy setup to estimate gas (with 2 owners like production)
      const dummyOwner1 = ethers.Wallet.createRandom().address
      const dummyOwner2 = ethers.Wallet.createRandom().address
      const owners = [dummyOwner1, dummyOwner2].sort((a, b) =>
        a.toLowerCase() < b.toLowerCase() ? -1 : 1
      )
      const setupData = this.encodeSafeSetup(owners, 1, TRADE_MODULE_ADDRESS)
      const nonce = BigInt(Date.now())

      const factoryWithSigner = this.proxyFactory.connect(this.signer) as any

      const gasEstimate = await factoryWithSigner.createProxyWithNonce.estimateGas(
        SAFE_SINGLETON_ADDRESS,
        setupData,
        nonce
      )

      // Get current gas price
      const feeData = await this.provider.getFeeData()
      const gasPrice = feeData.gasPrice || 0n

      const estimatedCost = gasEstimate * gasPrice
      const estimatedCostInMATIC = Number(ethers.formatEther(estimatedCost))

      return {
        gasEstimate,
        estimatedCostInMATIC,
      }
    } catch (error: any) {
      console.error('[SafeManager] estimateDeploymentCost error:', error)
      return null
    }
  }
}

// Fix: Import AbiCoder properly
const { AbiCoder } = ethers

// Singleton instance
export const safeManager = new SafeManager()
