import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { deriveOperatorWallet } from '@/lib/operators/wallet-derivation'
import { loadCLOBCredentialsByUserId } from '@/lib/polymarket/credential-manager'
import { marketSell } from '@/lib/polymarket/signature-type2-signer'

/**
 * POST /api/positions/[id]/close
 *
 * Manually close/exit a position by calling exitMarket() on the smart contract
 *
 * Body: { traderAddress?: string } - optional trader address for performance fee split
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const positionId = params.id
    const body = await req.json().catch(() => ({}))
    const { traderAddress } = body

    // Get position from database
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: {
        user: {
          select: {
            id: true,
            safeAddress: true,
            walletAddress: true,
          },
        },
      },
    })

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    // Verify ownership
    if (position.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not authorized to close this position' }, { status: 403 })
    }

    // Check position is open
    if (position.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Position is already ${position.status}` },
        { status: 400 }
      )
    }

    // Check if using real execution
    const useRealExecution = process.env.USE_REAL_EXECUTION === 'true'

    if (!useRealExecution) {
      // Mock close for now
      console.log(`[Close Position] Mock closing position ${positionId}`)

      await prisma.position.update({
        where: { id: positionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
        },
      })

      // Create exit trade record
      const exitTrade = await prisma.trade.create({
        data: {
          userId: position.userId,
          market: position.market,
          asset: position.asset,
          conditionId: position.conditionId,
          outcome: position.outcome,
          outcomeIndex: position.outcomeIndex,
          side: 'SELL',
          price: position.currentPrice,
          size: position.size,
          value: position.size * position.currentPrice,
          fee: 0,
          status: 'COMPLETED',
          executionType: 'MANUAL_EXIT',
          timestamp: new Date(),
          transactionHash: '0x' + '0'.repeat(64), // Mock hash
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Position closed successfully (mock mode)',
        positionId,
        exitTradeId: exitTrade.id,
        pnl: position.unrealizedPnL,
      })
    }

    // Real execution
    if (!position.user.safeAddress) {
      return NextResponse.json(
        { error: 'User does not have a Safe deployed' },
        { status: 400 }
      )
    }

    if (!position.positionKey) {
      return NextResponse.json(
        { error: 'Position does not have a position key. Cannot close on-chain.' },
        { status: 400 }
      )
    }

    // Real position closing with SignatureType 2
    console.log(`[Close Position] Closing position ${positionId} via SignatureType 2`)

    // Load operator credentials
    const credentials = await loadCLOBCredentialsByUserId(position.userId)
    if (!credentials) {
      return NextResponse.json(
        { error: 'CLOB API credentials not found for user. Run onboarding.' },
        { status: 400 }
      )
    }

    // Derive operator wallet
    const operatorWallet = deriveOperatorWallet(position.user.walletAddress)

    // Execute market sell order
    try {
      const sellResult = await marketSell({
        tokenId: position.asset,
        shares: position.size,
        safeAddress: position.user.safeAddress,
        operatorPrivateKey: operatorWallet.privateKey,
        credentials,
        chainId: 137,
      })

      if (sellResult.status !== 'matched') {
        return NextResponse.json(
          { error: `Sell order not matched. Order ID: ${sellResult.orderId}` },
          { status: 400 }
        )
      }

      // Calculate realized P&L
      const sellValue = sellResult.actualCost || (position.size * position.currentPrice)
      const costBasis = position.size * position.entryPrice
      const realizedPnL = sellValue - costBasis

      // Update position
      await prisma.position.update({
        where: { id: positionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          realizedPnL,
        },
      })

      // Create exit trade record
      const exitTrade = await prisma.trade.create({
        data: {
          userId: position.userId,
          market: position.market,
          asset: position.asset,
          conditionId: position.conditionId,
          outcome: position.outcome,
          outcomeIndex: position.outcomeIndex,
          side: 'SELL',
          price: position.currentPrice,
          size: position.size,
          value: sellValue,
          fee: 0,
          transactionHash: sellResult.transactionHash || null,
          positionKey: position.positionKey,
          status: 'COMPLETED',
          executionType: 'MANUAL_EXIT',
          timestamp: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Position closed successfully',
        positionId,
        exitTradeId: exitTrade.id,
        transactionHash: sellResult.transactionHash,
        orderId: sellResult.orderId,
        pnl: realizedPnL,
        sellValue,
      })
    } catch (error: any) {
      console.error('[Close Position] Sell order failed:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to execute sell order' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('POST /api/positions/[id]/close error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to close position' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/positions/[id]/close
 *
 * Get information about closing a position (estimated P&L, fees, etc.)
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const positionId = params.id

    // Get position
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: {
        user: {
          select: {
            safeAddress: true,
          },
        },
      },
    })

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    // Verify ownership
    if (position.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Check if can close
    if (position.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Position is ${position.status}, cannot close` },
        { status: 400 }
      )
    }

    // Note: The simplified TradeModule architecture doesn't track positions on-chain
    // Positions are tracked off-chain in our database
    const onChainInfo = null

    // Calculate estimated values
    const estimatedPayout = position.size * position.currentPrice
    const profit = estimatedPayout - position.value

    // Estimate performance fee (50% of profit if profitable)
    const estimatedPerformanceFee = profit > 0 ? profit * 0.5 : 0

    // Estimate net proceeds after fees
    const estimatedNetProceeds = estimatedPayout - estimatedPerformanceFee

    return NextResponse.json({
      positionId: position.id,
      market: position.market,
      outcome: position.outcome,
      side: position.side,
      size: position.size,
      entryPrice: position.entryPrice,
      currentPrice: position.currentPrice,
      entryValue: position.value,
      currentValue: estimatedPayout,
      unrealizedPnL: position.unrealizedPnL,
      estimatedProfit: profit,
      estimatedPerformanceFee,
      estimatedNetProceeds,
      canClose: true,
      onChainInfo: null, // Positions tracked off-chain in simplified architecture
    })
  } catch (error: any) {
    console.error('GET /api/positions/[id]/close error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get position close info' },
      { status: 500 }
    )
  }
}
