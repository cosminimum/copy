import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { verifySecuritySetup } from '@/lib/contracts/safe-security-setup'
import { ethers } from 'ethers'
import { USER_WITHDRAWAL_MODULE, USDC_E_ADDRESS } from '@/lib/contracts/withdrawal-module-abi'

/**
 * GET /api/wallet/withdraw
 *
 * Get withdrawal information for the user
 * Returns: balance, authorization status, Safe address, and module address
 *
 * Note: Withdrawals are now executed directly from the frontend using the
 * UserWithdrawalModule contract. This endpoint only provides read-only information.
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
    console.log('[GET /api/wallet/withdraw] Returning:', {
      balance,
      isAuthorized: securitySetup.isComplete && securitySetup.userAuthorized,
    })

    return NextResponse.json({
      safeAddress: user.safeAddress,
      balance,
      defaultRecipient: user.walletAddress,
      isAuthorized: securitySetup.isComplete && securitySetup.userAuthorized,
      moduleAddress: USER_WITHDRAWAL_MODULE,
      usdcAddress: USDC_E_ADDRESS,
    })
  } catch (error: any) {
    console.error('GET /api/wallet/withdraw error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get withdrawal information' },
      { status: 500 }
    )
  }
}
