import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { verifySecuritySetup } from '@/lib/contracts/safe-security-setup'
import { ethers } from 'ethers'

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC.e (Bridged USDC for Polymarket)

/**
 * POST /api/wallet/withdraw
 *
 * Withdraw USDC from Safe to personal wallet
 *
 * Body: { amount: number, recipientAddress?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { amount, recipientAddress } = body

    // Validate amount
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be greater than 0.' },
        { status: 400 }
      )
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

    if (!user.safeAddress) {
      return NextResponse.json(
        { error: 'No Safe deployed. Please deploy a Safe first.' },
        { status: 400 }
      )
    }

    // Default recipient to user's wallet if not specified
    const recipient = recipientAddress || user.walletAddress

    // Validate recipient address
    if (!ethers.isAddress(recipient)) {
      return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
    }

    // Check Safe USDC.e balance
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)
    const usdcEContract = new ethers.Contract(
      USDC_E_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    )
    const balanceWei = await usdcEContract.balanceOf(user.safeAddress)
    const balance = parseFloat(ethers.formatUnits(balanceWei, 6))

    if (balance < amount) {
      return NextResponse.json(
        { error: `Insufficient balance. Available: ${balance.toFixed(2)} USDC.e` },
        { status: 400 }
      )
    }

    // Convert amount to USDC wei (6 decimals)
    const amountInWei = ethers.parseUnits(amount.toString(), 6)

    console.log(`[Withdraw API] Withdrawing ${amount} USDC from ${user.safeAddress} to ${recipient}`)

    // TODO: In production, withdrawals are done directly through the Safe interface
    // Users need to sign a Safe transaction to transfer USDC
    // For now, return instructions for manual withdrawal
    return NextResponse.json(
      {
        error: 'Direct withdrawals not implemented. Please use your Safe interface to withdraw USDC.',
        instructions: {
          step1: 'Go to https://app.safe.global',
          step2: `Connect to your Safe at ${user.safeAddress}`,
          step3: 'Use the "New Transaction" button to send USDC',
          step4: `Send ${amount} USDC to ${recipient}`,
        },
        safeAddress: user.safeAddress,
        safeUrl: `https://app.safe.global/home?safe=matic:${user.safeAddress}`,
      },
      { status: 501 } // Not Implemented
    )

    // Placeholder for future implementation with Safe SDK:
    /*
    const result = await safeManager.transferUSDC(
      user.safeAddress,
      recipient,
      amountInWei,
      userSignature
    )

    if (!result.success) {
      throw new Error(result.error || 'Withdrawal failed')
    }

    // Create activity log
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'FUNDS_WITHDRAWN',
        description: `Withdrew ${amount} USDC from Safe to ${recipient}`,
        metadata: {
          amount,
          safeAddress: user.safeAddress,
          recipientAddress: recipient,
          transactionHash: result.transactionHash,
        },
      },
    })

    // Create notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'WITHDRAWAL_SUCCESS',
        title: 'Withdrawal Successful',
        message: `Successfully withdrew ${amount} USDC to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
        metadata: {
          amount,
          transactionHash: result.transactionHash,
        },
      },
    })

    return NextResponse.json({
      success: true,
      amount,
      recipientAddress: recipient,
      transactionHash: result.transactionHash,
      message: 'Withdrawal successful',
    })
    */
  } catch (error: any) {
    console.error('POST /api/wallet/withdraw error:', error)

    // Log failed withdrawal attempt
    try {
      const session = await auth()
      if (session?.user?.id) {
        await prisma.activityLog.create({
          data: {
            userId: session.user.id,
            action: 'WITHDRAWAL_FAILED',
            description: `Withdrawal failed: ${error.message}`,
            metadata: {
              error: error.message,
            },
          },
        })
      }
    } catch (logError) {
      console.error('Failed to log withdrawal error:', logError)
    }

    return NextResponse.json(
      { error: error.message || 'Failed to withdraw funds' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/wallet/withdraw
 *
 * Get withdrawal information (current balance, etc.)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        walletAddress: true,
        safeAddress: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.safeAddress) {
      return NextResponse.json(
        { error: 'No Safe deployed' },
        { status: 400 }
      )
    }

    if (!user.walletAddress) {
      return NextResponse.json(
        { error: 'User wallet address not found' },
        { status: 404 }
      )
    }

    // Check if user is authorized to withdraw
    const securitySetup = await verifySecuritySetup(
      user.safeAddress,
      user.walletAddress
    )

    // Get Safe USDC.e balance (bridged USDC for Polymarket)
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)
    const usdcEContract = new ethers.Contract(
      USDC_E_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    )
    const balanceWei = await usdcEContract.balanceOf(user.safeAddress)
    const balance = parseFloat(ethers.formatUnits(balanceWei, 6))
    console.log('[GET /api/wallet/withdraw] Safe USDC.e balance:', balance, 'for Safe:', user.safeAddress)

    // Get open positions to calculate locked funds
    const openPositions = await prisma.position.findMany({
      where: {
        userId: session.user.id,
        status: 'OPEN',
      },
      select: {
        value: true,
      },
    })

    const lockedFunds = openPositions.reduce((sum, pos) => sum + pos.value, 0)
    const availableToWithdraw = Math.max(0, balance - lockedFunds)

    console.log('[GET /api/wallet/withdraw] Returning:', {
      balance,
      lockedFunds,
      availableToWithdraw,
      isAuthorized: securitySetup.isComplete && securitySetup.userAuthorized,
    })

    return NextResponse.json({
      safeAddress: user.safeAddress,
      balance,
      lockedFunds,
      availableToWithdraw,
      defaultRecipient: user.walletAddress,
      isAuthorized: securitySetup.isComplete && securitySetup.userAuthorized,
    })
  } catch (error: any) {
    console.error('GET /api/wallet/withdraw error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get withdrawal information' },
      { status: 500 }
    )
  }
}
