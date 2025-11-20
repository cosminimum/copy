/**
 * API Endpoint: Get POL → USDC.e Swap Quote
 *
 * Returns expected USDC.e output for a given POL input amount
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { getPolToUsdcQuote, formatSwapAmounts, calculateSwapSplit } from '@/lib/dex/swap-utils'
import { validateSwapAmount } from '@/lib/dex/swap-utils'
import { estimateFlowGasCost } from '@/lib/transactions/pol-to-usdc-flow'

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { polAmount } = body

    // Validate input
    if (!polAmount) {
      return NextResponse.json({ error: 'POL amount is required' }, { status: 400 })
    }

    const validation = validateSwapAmount(polAmount)
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Parse amount and calculate split
    const polAmountWei = ethers.parseEther(polAmount)
    const { amountToSwap, amountToKeep } = calculateSwapSplit(polAmountWei)

    // Get quote for the 95% that will be swapped
    const quote = await getPolToUsdcQuote(amountToSwap, provider)
    const formatted = formatSwapAmounts(quote)

    // Estimate gas costs
    const gasCost = await estimateFlowGasCost(polAmount, provider)

    return NextResponse.json({
      success: true,
      quote: {
        inputPol: polAmount,
        polToSwap: ethers.formatEther(amountToSwap),
        polToKeep: ethers.formatEther(amountToKeep),
        expectedUsdc: formatted.expectedUsdc,
        minimumUsdc: formatted.minimumUsdc,
        exchangeRate: formatted.exchangeRate,
        slippage: formatted.slippage,
      },
      gasCost: {
        total: gasCost.totalGasCostPol,
        breakdown: {
          polTransfer: ethers.formatEther(gasCost.breakdown.polTransfer),
          swap: ethers.formatEther(gasCost.breakdown.swap),
          usdcTransfer: ethers.formatEther(gasCost.breakdown.usdcTransfer),
        },
      },
      summary: {
        youSend: `${polAmount} POL`,
        operatorReceives: `${ethers.formatEther(amountToKeep)} POL (for gas)`,
        safeReceives: `~${formatted.expectedUsdc} USDC.e`,
        estimatedGas: `~${gasCost.totalGasCostPol} POL`,
      },
    })
  } catch (error) {
    console.error('Error getting swap quote:', error)
    return NextResponse.json(
      {
        error: 'Failed to get swap quote',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
