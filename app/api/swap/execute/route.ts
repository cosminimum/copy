/**
 * API Endpoint: Execute POL → USDC.e Swap
 *
 * This endpoint handles the server-side swap execution after the user has
 * transferred POL to their operator wallet.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { ethers } from 'ethers'
import { deriveOperatorWallet } from '@/lib/operators/wallet-derivation'
import {
  getPolToUsdcQuote,
  buildSwapTransaction,
  calculateSwapSplit,
  getUsdcBalance,
} from '@/lib/dex/swap-utils'
import { USDC_E_ADDRESS } from '@/lib/constants/dex'

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { polTransferTxHash } = body

    if (!polTransferTxHash) {
      return NextResponse.json(
        { error: 'POL transfer transaction hash is required' },
        { status: 400 }
      )
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        walletAddress: true,
        operatorAddress: true,
        safeAddress: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.operatorAddress) {
      return NextResponse.json({ error: 'Operator not configured' }, { status: 400 })
    }

    if (!user.safeAddress) {
      return NextResponse.json({ error: 'Safe not deployed' }, { status: 400 })
    }

    // Verify the POL transfer transaction
    const tx = await provider.getTransaction(polTransferTxHash)
    if (!tx) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    // Verify transaction is confirmed
    if (!tx.blockNumber) {
      return NextResponse.json(
        { error: 'Transaction not confirmed yet' },
        { status: 400 }
      )
    }

    // Verify transaction is to operator address
    if (tx.to?.toLowerCase() !== user.operatorAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Transaction is not to operator address' },
        { status: 400 }
      )
    }

    const polAmount = tx.value

    // Get operator wallet (server-side only!)
    const operatorWallet = deriveOperatorWallet(user.walletAddress).connect(provider)

    // Check operator POL balance
    const operatorBalance = await provider.getBalance(operatorWallet.address)
    if (operatorBalance < polAmount) {
      return NextResponse.json(
        { error: 'Operator balance insufficient' },
        { status: 400 }
      )
    }

    // Calculate split (95% swap, 5% keep)
    const { amountToSwap, amountToKeep } = calculateSwapSplit(polAmount)

    // Get swap quote
    const quote = await getPolToUsdcQuote(amountToSwap, provider)

    // Build and execute swap transaction
    const swapTx = buildSwapTransaction(operatorWallet.address, quote.minimumOutput)

    console.log('[Swap API] Executing swap:', {
      amountToSwap: ethers.formatEther(amountToSwap),
      expectedUsdc: ethers.formatUnits(quote.expectedOutput, 6),
    })

    const swapTransaction = await operatorWallet.sendTransaction({
      to: swapTx.to,
      value: amountToSwap,
      data: swapTx.data,
      gasLimit: swapTx.gasLimit,
    })

    const swapReceipt = await swapTransaction.wait()

    if (!swapReceipt) {
      return NextResponse.json(
        { error: 'Swap transaction failed' },
        { status: 500 }
      )
    }

    // Get USDC balance after swap
    const usdcBalance = await getUsdcBalance(operatorWallet.address, provider)

    console.log('[Swap API] Swap successful, transferring USDC to Safe:', {
      usdcBalance: ethers.formatUnits(usdcBalance, 6),
      safeAddress: user.safeAddress,
    })

    // Transfer USDC.e to Safe
    const usdcContract = new ethers.Contract(
      USDC_E_ADDRESS,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      operatorWallet
    )

    const usdcTransferTx = await usdcContract.transfer(user.safeAddress, usdcBalance)
    const usdcTransferReceipt = await usdcTransferTx.wait()

    if (!usdcTransferReceipt) {
      return NextResponse.json(
        { error: 'USDC transfer failed' },
        { status: 500 }
      )
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'SWAP_POL_TO_USDC',
        description: `Swapped ${ethers.formatEther(amountToSwap)} POL to ${ethers.formatUnits(usdcBalance, 6)} USDC.e`,
        metadata: {
          polTransferTxHash,
          swapTxHash: swapReceipt.hash,
          usdcTransferTxHash: usdcTransferReceipt.hash,
          polAmount: ethers.formatEther(polAmount),
          amountSwapped: ethers.formatEther(amountToSwap),
          amountKept: ethers.formatEther(amountToKeep),
          usdcReceived: ethers.formatUnits(usdcBalance, 6),
        },
      },
    })

    return NextResponse.json({
      success: true,
      swapTxHash: swapReceipt.hash,
      usdcTransferTxHash: usdcTransferReceipt.hash,
      usdcReceived: ethers.formatUnits(usdcBalance, 6),
      polKept: ethers.formatEther(amountToKeep),
    })
  } catch (error) {
    console.error('[Swap API] Error:', error)
    return NextResponse.json(
      {
        error: 'Swap execution failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
