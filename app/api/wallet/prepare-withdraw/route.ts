import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { ethers } from 'ethers'
import { verifySecuritySetup } from '@/lib/contracts/safe-security-setup'

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, recipient } = body

    // Validate inputs
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    if (!recipient || !ethers.isAddress(recipient)) {
      return NextResponse.json(
        { error: 'Invalid recipient address' },
        { status: 400 }
      )
    }

    // Get user and their Safe address
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        walletAddress: true,
        safeAddress: true,
      },
    })

    if (!user?.safeAddress) {
      return NextResponse.json(
        { error: 'Safe wallet not found' },
        { status: 404 }
      )
    }

    if (!user.walletAddress) {
      return NextResponse.json(
        { error: 'User wallet address not found' },
        { status: 404 }
      )
    }

    // Verify security setup and authorization
    const securitySetup = await verifySecuritySetup(
      user.safeAddress,
      user.walletAddress
    )

    if (!securitySetup.isComplete || !securitySetup.userAuthorized) {
      return NextResponse.json(
        {
          error: 'Wallet not authorized to withdraw',
          details: 'Your wallet has not been authorized in the withdrawal module',
          isAuthorized: false,
        },
        { status: 403 }
      )
    }

    // Get current Safe USDC.e balance
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)
    const usdcEContract = new ethers.Contract(
      USDC_E_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    )
    const balanceWei = await usdcEContract.balanceOf(user.safeAddress)
    const currentBalance = parseFloat(ethers.formatUnits(balanceWei, 6))

    // Get locked funds from open positions
    const openPositions = await prisma.position.findMany({
      where: {
        userId: user.id,
        status: 'OPEN',
      },
      select: {
        value: true,
      },
    })

    const lockedFunds = openPositions.reduce(
      (total: number, position: { value: number }) => total + position.value,
      0
    )

    const availableToWithdraw = Math.max(0, currentBalance - lockedFunds)

    // Validate amount against available balance
    if (amount > availableToWithdraw) {
      return NextResponse.json(
        {
          error: 'Insufficient available balance',
          details: `You have $${availableToWithdraw.toFixed(2)} available to withdraw (${currentBalance.toFixed(2)} total - ${lockedFunds.toFixed(2)} locked)`,
          balance: currentBalance,
          lockedFunds,
          availableToWithdraw,
          requestedAmount: amount,
        },
        { status: 400 }
      )
    }

    // Calculate estimated gas fees
    // This is a rough estimate - actual gas will be calculated during execution
    const feeData = await provider.getFeeData()
    const estimatedGasUnits = 150000 // Estimate for Safe execTransaction with ERC20 transfer
    const estimatedGasCost = feeData.gasPrice
      ? (feeData.gasPrice * BigInt(estimatedGasUnits)) / BigInt(1e18)
      : BigInt(0)

    const estimatedGasCostNumber = parseFloat(
      ethers.formatEther(estimatedGasCost)
    )

    // Prepare successful response
    return NextResponse.json({
      success: true,
      validation: {
        isAuthorized: true,
        hasSufficientBalance: true,
        amount,
        recipient,
      },
      balanceInfo: {
        currentBalance,
        lockedFunds,
        availableToWithdraw,
      },
      estimatedFees: {
        gasCostMatic: estimatedGasCostNumber,
        note: 'Gas fees are paid in MATIC and will be deducted from the operator wallet',
      },
      token: {
        symbol: 'USDC.e',
        address: USDC_E_ADDRESS,
        decimals: 6,
      },
    })
  } catch (error) {
    console.error('Error preparing withdrawal:', error)
    return NextResponse.json(
      {
        error: 'Failed to prepare withdrawal',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
