import { TradeMessage } from '../polymarket/types'

export type PositionSizeType = 'PERCENTAGE' | 'PROPORTIONAL' | 'FIXED'

export interface CopySettings {
  positionSizeType: PositionSizeType
  positionSizeValue: number
  maxPositionSize?: number
  minTradeSize?: number
}

export interface CalculatedTrade {
  market: string
  asset: string
  conditionId: string
  outcome: string
  outcomeIndex: number
  side: 'BUY' | 'SELL'
  price: number
  size: number
  value: number
}

export class PositionCalculator {
  calculateTradeSize(
    originalTrade: TradeMessage,
    settings: CopySettings,
    userBalance: number
  ): CalculatedTrade | null {
    let calculatedSize = 0

    switch (settings.positionSizeType) {
      case 'PERCENTAGE':
        calculatedSize = (userBalance * settings.positionSizeValue) / 100
        break

      case 'PROPORTIONAL':
        calculatedSize = originalTrade.size * settings.positionSizeValue
        break

      case 'FIXED':
        calculatedSize = settings.positionSizeValue
        break

      default:
        return null
    }

    if (settings.minTradeSize && calculatedSize < settings.minTradeSize) {
      console.log(`Trade size ${calculatedSize} below minimum ${settings.minTradeSize}`)
      return null
    }

    if (settings.maxPositionSize && calculatedSize > settings.maxPositionSize) {
      calculatedSize = settings.maxPositionSize
    }

    const value = calculatedSize * originalTrade.price

    return {
      market: originalTrade.slug,
      asset: originalTrade.asset,
      conditionId: originalTrade.conditionId,
      outcome: originalTrade.outcome,
      outcomeIndex: originalTrade.outcomeIndex,
      side: originalTrade.side,
      price: originalTrade.price,
      size: calculatedSize,
      value,
    }
  }

  validateTrade(
    calculatedTrade: CalculatedTrade,
    currentPositions: { market: string; size: number }[],
    settings: CopySettings
  ): boolean {
    if (calculatedTrade.size <= 0) {
      return false
    }

    const totalPositionInMarket = currentPositions
      .filter(p => p.market === calculatedTrade.market)
      .reduce((sum, p) => sum + p.size, 0)

    if (
      settings.maxPositionSize &&
      totalPositionInMarket + calculatedTrade.size > settings.maxPositionSize
    ) {
      return false
    }

    return true
  }
}

export const positionCalculator = new PositionCalculator()
