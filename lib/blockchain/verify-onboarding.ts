/**
 * Blockchain Verification Utilities for Onboarding
 *
 * Server-side utilities to verify on-chain state during the onboarding process.
 * These functions query the blockchain to confirm:
 * - Safe deployment status
 * - Token balances (POL, USDC.e)
 * - Token approvals
 * - Security module configuration
 */

import { ethers } from 'ethers'
import { ONBOARDING_CONSTANTS } from '@/lib/constants/onboarding'

const POLYGON_RPC_URL =
  process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'

// Contract addresses on Polygon
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // Bridged USDC
const NATIVE_USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Native USDC
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
const NEG_RISK_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a'
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'

// ABIs
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
]

const ERC1155_ABI = [
  'function isApprovedForAll(address,address) view returns (bool)',
]

const SAFE_ABI = [
  'function nonce() view returns (uint256)',
  'function getOwners() view returns (address[])',
]

/**
 * Get a provider instance
 */
function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(POLYGON_RPC_URL)
}

/**
 * Check if an address has contract code (is deployed)
 */
export async function isContractDeployed(
  address: string
): Promise<boolean> {
  try {
    const provider = getProvider()
    const code = await provider.getCode(address)
    return code !== '0x'
  } catch (error) {
    console.error('[BlockchainVerify] isContractDeployed error:', error)
    return false
  }
}

/**
 * Get POL (native token) balance for an address
 */
export async function getPolBalance(address: string): Promise<bigint> {
  try {
    const provider = getProvider()
    const balance = await provider.getBalance(address)
    return balance
  } catch (error) {
    console.error('[BlockchainVerify] getPolBalance error:', error)
    return BigInt(0)
  }
}

/**
 * Get USDC.e (bridged USDC) balance for an address
 */
export async function getUsdcEBalance(address: string): Promise<bigint> {
  try {
    const provider = getProvider()
    const usdcContract = new ethers.Contract(
      USDC_E_ADDRESS,
      ERC20_ABI,
      provider
    )
    const balance = await usdcContract.balanceOf(address)
    return balance
  } catch (error) {
    console.error('[BlockchainVerify] getUsdcEBalance error:', error)
    return BigInt(0)
  }
}

/**
 * Get native USDC balance for an address
 */
export async function getNativeUsdcBalance(address: string): Promise<bigint> {
  try {
    const provider = getProvider()
    const usdcContract = new ethers.Contract(
      NATIVE_USDC_ADDRESS,
      ERC20_ABI,
      provider
    )
    const balance = await usdcContract.balanceOf(address)
    return balance
  } catch (error) {
    console.error('[BlockchainVerify] getNativeUsdcBalance error:', error)
    return BigInt(0)
  }
}

/**
 * Check if Safe has sufficient balances
 */
export async function checkSafeBalances(safeAddress: string): Promise<{
  polBalance: bigint
  usdcEBalance: bigint
  nativeUsdcBalance: bigint
  hasSufficientPol: boolean
  hasSufficientUsdc: boolean
  hasWrongToken: boolean
}> {
  try {
    const [polBalance, usdcEBalance, nativeUsdcBalance] = await Promise.all([
      getPolBalance(safeAddress),
      getUsdcEBalance(safeAddress),
      getNativeUsdcBalance(safeAddress),
    ])

    return {
      polBalance,
      usdcEBalance,
      nativeUsdcBalance,
      hasSufficientPol:
        polBalance >= BigInt(Math.floor(ONBOARDING_CONSTANTS.MIN_POL_BALANCE)),
      hasSufficientUsdc:
        usdcEBalance >= BigInt(Math.floor(ONBOARDING_CONSTANTS.MIN_USDC_BALANCE)),
      hasWrongToken: nativeUsdcBalance > BigInt(0),
    }
  } catch (error) {
    console.error('[BlockchainVerify] checkSafeBalances error:', error)
    throw error
  }
}

/**
 * Check if operator has sufficient POL for gas
 */
export async function checkOperatorBalance(
  operatorAddress: string
): Promise<{
  polBalance: bigint
  hasSufficientPol: boolean
}> {
  try {
    const polBalance = await getPolBalance(operatorAddress)

    return {
      polBalance,
      hasSufficientPol:
        polBalance >= BigInt(Math.floor(ONBOARDING_CONSTANTS.MIN_POL_BALANCE)),
    }
  } catch (error) {
    console.error('[BlockchainVerify] checkOperatorBalance error:', error)
    throw error
  }
}

/**
 * Check if all required token approvals are set
 */
export async function checkTokenApprovals(safeAddress: string): Promise<{
  usdcToCTF: boolean
  usdcToNegRisk: boolean
  ctToCTF: boolean
  ctToNegRisk: boolean
  allApproved: boolean
}> {
  try {
    const provider = getProvider()
    const usdcContract = new ethers.Contract(
      USDC_E_ADDRESS,
      ERC20_ABI,
      provider
    )
    const ctContract = new ethers.Contract(
      CONDITIONAL_TOKENS,
      ERC1155_ABI,
      provider
    )

    const minApproval = ethers.parseUnits('1000000', 6) // 1M USDC

    // Check USDC (ERC20) approvals and CT (ERC1155) approvals
    const [
      usdcToCTFAmount,
      usdcToNegRiskAmount,
      ctToCTFApproved,
      ctToNegRiskApproved,
    ] = await Promise.all([
      usdcContract.allowance(safeAddress, CTF_EXCHANGE),
      usdcContract.allowance(safeAddress, NEG_RISK_EXCHANGE),
      ctContract.isApprovedForAll(safeAddress, CTF_EXCHANGE),
      ctContract.isApprovedForAll(safeAddress, NEG_RISK_EXCHANGE),
    ])

    const result = {
      usdcToCTF: usdcToCTFAmount >= minApproval,
      usdcToNegRisk: usdcToNegRiskAmount >= minApproval,
      ctToCTF: ctToCTFApproved,
      ctToNegRisk: ctToNegRiskApproved,
      allApproved: false,
    }

    result.allApproved =
      result.usdcToCTF &&
      result.usdcToNegRisk &&
      result.ctToCTF &&
      result.ctToNegRisk

    return result
  } catch (error) {
    console.error('[BlockchainVerify] checkTokenApprovals error:', error)
    throw error
  }
}

/**
 * Verify Safe is deployed and owned by operator
 */
export async function verifySafeDeployment(
  safeAddress: string,
  expectedOperator: string
): Promise<{
  isDeployed: boolean
  isOwnedByOperator: boolean
  owners: string[]
}> {
  try {
    const provider = getProvider()

    // Check if Safe is deployed
    const isDeployed = await isContractDeployed(safeAddress)
    if (!isDeployed) {
      return {
        isDeployed: false,
        isOwnedByOperator: false,
        owners: [],
      }
    }

    // Check if operator is an owner
    const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider)
    const owners = await safeContract.getOwners()

    const isOwnedByOperator = owners.some(
      (owner: string) =>
        owner.toLowerCase() === expectedOperator.toLowerCase()
    )

    return {
      isDeployed: true,
      isOwnedByOperator,
      owners,
    }
  } catch (error) {
    console.error('[BlockchainVerify] verifySafeDeployment error:', error)
    throw error
  }
}

/**
 * Comprehensive onboarding verification
 * Checks all requirements for a completed onboarding
 */
export async function verifyOnboardingComplete(params: {
  safeAddress: string
  operatorAddress: string
  guardEnabled: boolean
  withdrawalModuleEnabled: boolean
}): Promise<{
  isComplete: boolean
  errors: string[]
  details: {
    safeDeployed: boolean
    operatorFunded: boolean
    safeFunded: boolean
    approvalsSet: boolean
    guardEnabled: boolean
    withdrawalModuleEnabled: boolean
  }
}> {
  const errors: string[] = []
  const details = {
    safeDeployed: false,
    operatorFunded: false,
    safeFunded: false,
    approvalsSet: false,
    guardEnabled: params.guardEnabled,
    withdrawalModuleEnabled: params.withdrawalModuleEnabled,
  }

  try {
    // Check 1: Safe is deployed
    const safeDeployment = await verifySafeDeployment(
      params.safeAddress,
      params.operatorAddress
    )
    details.safeDeployed = safeDeployment.isDeployed

    if (!safeDeployment.isDeployed) {
      errors.push('Safe is not deployed')
    } else if (!safeDeployment.isOwnedByOperator) {
      errors.push('Safe is not owned by operator')
    }

    // Check 2: Operator has sufficient POL
    const operatorBalance = await checkOperatorBalance(params.operatorAddress)
    details.operatorFunded = operatorBalance.hasSufficientPol

    if (!operatorBalance.hasSufficientPol) {
      const currentPol = Number(operatorBalance.polBalance) / 1e18
      const minPol = ONBOARDING_CONSTANTS.MIN_POL_BALANCE / 1e18
      errors.push(
        `Operator POL balance too low (${currentPol.toFixed(2)} POL < ${minPol.toFixed(2)} POL)`
      )
    }

    // Check 3: Safe has sufficient USDC.e
    const safeBalances = await checkSafeBalances(params.safeAddress)
    details.safeFunded = safeBalances.hasSufficientUsdc

    if (!safeBalances.hasSufficientUsdc) {
      const currentUsdc = Number(safeBalances.usdcEBalance) / 1e6
      const minUsdc = ONBOARDING_CONSTANTS.MIN_USDC_BALANCE / 1e6
      errors.push(
        `Safe USDC.e balance too low ($${currentUsdc.toFixed(2)} < $${minUsdc})`
      )
    }

    // Check 4: Token approvals are set
    const approvals = await checkTokenApprovals(params.safeAddress)
    details.approvalsSet = approvals.allApproved

    if (!approvals.allApproved) {
      const missing: string[] = []
      if (!approvals.usdcToCTF) missing.push('USDC→CTF Exchange')
      if (!approvals.usdcToNegRisk) missing.push('USDC→Neg Risk Exchange')
      if (!approvals.ctToCTF) missing.push('CT→CTF Exchange')
      if (!approvals.ctToNegRisk) missing.push('CT→Neg Risk Exchange')
      errors.push(`Token approvals missing: ${missing.join(', ')}`)
    }

    // Check 5: Security features enabled (from database)
    if (!params.guardEnabled) {
      errors.push('TradeGuard not enabled')
    }

    if (!params.withdrawalModuleEnabled) {
      errors.push('Withdrawal module not enabled')
    }

    return {
      isComplete: errors.length === 0,
      errors,
      details,
    }
  } catch (error: any) {
    console.error('[BlockchainVerify] verifyOnboardingComplete error:', error)
    errors.push(`Verification failed: ${error.message}`)
    return {
      isComplete: false,
      errors,
      details,
    }
  }
}
