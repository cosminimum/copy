import { NextRequest, NextResponse } from 'next/server'
import { tradeOrchestrator } from '@/lib/orchestration/trade-orchestrator'
import { TradeMessage } from '@/lib/polymarket/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { traderAddress, market, outcome, side, price, size } = body

    if (!traderAddress || !market || !outcome || !side || !price || !size) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const simulatedTrade: TradeMessage = {
      asset: `asset_${Date.now()}`,
      bio: 'Simulated trader bio',
      conditionId: `condition_${market}`,
      eventSlug: 'simulated-event',
      icon: 'https://api.dicebear.com/7.x/avataaars/svg?seed=trade',
      name: 'Simulated Trader',
      outcome,
      outcomeIndex: outcome === 'YES' ? 0 : 1,
      price,
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=trader',
      proxyWallet: traderAddress,
      pseudonym: 'SimulatedTrader',
      side: side as 'BUY' | 'SELL',
      size,
      slug: market,
      timestamp: Date.now(),
      title: `Simulated Market: ${market}`,
      transactionHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
    }

    await tradeOrchestrator.processTradeEvent(simulatedTrade)

    return NextResponse.json({
      success: true,
      message: 'Trade simulation processed',
      trade: simulatedTrade,
    })
  } catch (error) {
    console.error('Error simulating trade:', error)
    return NextResponse.json(
      { error: 'Failed to simulate trade' },
      { status: 500 }
    )
  }
}
