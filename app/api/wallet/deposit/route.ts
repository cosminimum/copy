import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { deploySafeViaRelayer, isSafeDeployed, getSafeAddress } from '@/lib/contracts/safe-deployer-v2'
import { deriveOperatorWallet } from '@/lib/operators/wallet-derivation'
import { ethers } from 'ethers'

// CRITICAL: Polymarket uses USDC.e (bridged USDC), NOT native USDC!
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC.e (Bridged)
const NATIVE_USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Native USDC (NOT compatible with Polymarket!)

/**
 * GET /api/wallet/deposit
 *
 * Get deposit information for the current user
 * - Returns Safe address (deploys if needed)
 * - Returns current Safe balance
 * - Returns deposit instructions
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    let user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        walletAddress: true,
        safeAddress: true,
        safeDeployedAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let safeAddress = user.safeAddress
    let safeStatus: 'deployed' | 'deploying' | 'not_deployed' = 'not_deployed'

    // Check if Safe exists
    if (safeAddress) {
      const isDeployed = await isSafeDeployed(safeAddress)
      if (isDeployed) {
        safeStatus = 'deployed'
      } else {
        // Safe address in DB but not on-chain, might be deploying
        safeStatus = 'deploying'
      }
    }

    // Get Safe balance if deployed (check both USDC.e and native USDC)
    let balance = 0
    let nativeUsdcBalance = 0
    let hasWrongToken = false
    let operatorAddress: string | null = null
    let operatorPolBalance = 0

    if (safeStatus === 'deployed' && safeAddress) {
      const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!)

      // Check USDC.e balance (correct token for Polymarket)
      const usdcEContract = new ethers.Contract(
        USDC_E_ADDRESS,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      )
      const balanceWei = await usdcEContract.balanceOf(safeAddress)
      balance = parseFloat(ethers.formatUnits(balanceWei, 6))

      // Also check native USDC (to warn if user sent wrong token)
      const nativeUsdcContract = new ethers.Contract(
        NATIVE_USDC_ADDRESS,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      )
      const nativeBalanceWei = await nativeUsdcContract.balanceOf(safeAddress)
      nativeUsdcBalance = parseFloat(ethers.formatUnits(nativeBalanceWei, 6))

      hasWrongToken = nativeUsdcBalance > 0 && balance === 0

      // Get operator wallet address and balance
      if (user.walletAddress) {
        const operatorWallet = deriveOperatorWallet(user.walletAddress)
        operatorAddress = operatorWallet.address
        const operatorBalanceWei = await provider.getBalance(operatorAddress)
        operatorPolBalance = parseFloat(ethers.formatEther(operatorBalanceWei))
      }
    }

    return NextResponse.json({
      safeAddress,
      safeStatus,
      balance, // USDC.e balance (correct)
      nativeUsdcBalance, // Native USDC balance (wrong token!)
      hasWrongToken, // Warning flag
      operatorAddress,
      operatorPolBalance,
      usdcEAddress: USDC_E_ADDRESS,
      nativeUsdcAddress: NATIVE_USDC_ADDRESS,
      network: 'Polygon',
      chainId: 137,
      instructions: {
        step1: 'Send USDC.e (Bridged USDC) on Polygon to your Safe address',
        step2: 'IMPORTANT: Use USDC.e (0x2791...), NOT native USDC (0x3c49...)',
        step3: 'Wait for confirmation, balance updates every 10 seconds',
      },
    })
  } catch (error: any) {
    console.error('GET /api/wallet/deposit error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get deposit information' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/wallet/deposit
 *
 * Deploy a Safe for the user if they don't have one
 * Body: { useGasless?: boolean, userPrivateKey?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        walletAddress: true,
        safeAddress: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user already has a Safe
    if (user.safeAddress) {
      const isDeployed = await isSafeDeployed(user.safeAddress)
      if (isDeployed) {
        return NextResponse.json(
          { error: 'Safe already deployed', safeAddress: user.safeAddress },
          { status: 400 }
        )
      }
    }

    console.log(`[Deposit API] Deploying Safe for user ${user.id} via SignatureType 2`)

    // SignatureType 2: Deploy Safe with OPERATOR as owner (not user EOA)
    // This is critical - the operator must be the Safe owner to sign transactions
    const operatorWallet = deriveOperatorWallet(user.walletAddress)

    console.log(`[Deposit API] User EOA: ${user.walletAddress}`)
    console.log(`[Deposit API] Operator (Safe owner): ${operatorWallet.address}`)

    // Get the deterministic Safe address (works even if not deployed yet)
    const predictedSafeAddress = await getSafeAddress(operatorWallet.address)
    console.log(`[Deposit API] Predicted Safe address: ${predictedSafeAddress}`)

    // Check if Safe is already deployed on-chain
    const alreadyDeployed = await isSafeDeployed(predictedSafeAddress)
    console.log(`[Deposit API] Safe already deployed: ${alreadyDeployed}`)

    let deploymentMethod = 'predicted'
    let transactionHash: string | undefined = undefined

    if (!alreadyDeployed) {
      // Try to deploy via Polymarket Relayer (gasless)
      console.log('[Deposit API] Attempting gasless deployment via Polymarket Relayer...')
      const deployment = await deploySafeViaRelayer(operatorWallet.privateKey)

      if (deployment.success && deployment.safeAddress) {
        console.log(`[Deposit API] ✅ Safe deployed at: ${deployment.safeAddress}`)
        transactionHash = deployment.transactionHash
        deploymentMethod = 'polymarket-relayer'
      } else {
        console.warn(`[Deposit API] ⚠️  Relayer deployment failed: ${deployment.error}`)
        console.log('[Deposit API] Using predicted address. Safe will auto-deploy on first trade.')
        deploymentMethod = 'predicted-pending'
      }
    } else {
      console.log('[Deposit API] ✅ Safe already exists on-chain')
      deploymentMethod = 'already-deployed'
    }

    console.log(`[Deposit API] Owner: ${operatorWallet.address} (Operator)`)

    // Update user with Safe address (using predicted address even if deployment is pending)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        safeAddress: predictedSafeAddress,
        operatorAddress: operatorWallet.address,
        safeDeployedAt: new Date(),
      },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'SAFE_DEPLOYED',
        description: deploymentMethod === 'predicted-pending'
          ? `Safe address generated: ${predictedSafeAddress} (will deploy on first trade)`
          : `Gnosis Safe deployed at ${predictedSafeAddress}`,
        metadata: {
          safeAddress: predictedSafeAddress,
          operatorAddress: operatorWallet.address,
          transactionHash,
          deploymentMethod,
        },
      },
    })

    // Create notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'SAFE_DEPLOYED',
        title: deploymentMethod === 'predicted-pending' ? 'Safe Address Generated' : 'Safe Deployed',
        message: deploymentMethod === 'predicted-pending'
          ? `Your Safe address has been generated. The Safe will be deployed automatically when you make your first trade. You can deposit USDC.e now.`
          : `Your trading Safe has been deployed successfully. Owner: Operator wallet. You can now deposit USDC.e to start trading.`,
        metadata: {
          safeAddress: predictedSafeAddress,
          operatorAddress: operatorWallet.address,
        },
      },
    })

    return NextResponse.json({
      success: true,
      safeAddress: predictedSafeAddress,
      operatorAddress: operatorWallet.address,
      transactionHash,
      deploymentMethod,
      message: deploymentMethod === 'predicted-pending'
        ? 'Safe address generated. The Safe will auto-deploy on first trade. You can deposit USDC.e now.'
        : 'Safe deployed successfully. Operator is the Safe owner. You can now deposit USDC.e.',
    })
  } catch (error: any) {
    console.error('POST /api/wallet/deposit error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to deploy Safe' },
      { status: 500 }
    )
  }
}
