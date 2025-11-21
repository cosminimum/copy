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
    userBalance: number,
    userPosition?: { size: number } | null
  ): CalculatedTrade | null {
    let calculatedSize = 0

    // For SELL orders, check if user has a position to sell
    if (originalTrade.side === 'SELL') {
      if (!userPosition || userPosition.size <= 0) {
        console.log(`[PositionCalculator] Cannot SELL - user has no position for ${originalTrade.outcome} in ${originalTrade.slug}`)
        return null
      }

      // Calculate sell size based on settings (same logic as BUY)
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

      // CRITICAL: Cap sell size to what user actually owns
      if (calculatedSize > userPosition.size) {
        console.log(`[PositionCalculator] SELL size ${calculatedSize} exceeds position ${userPosition.size}, capping to position size`)
        calculatedSize = userPosition.size
      }
    } else {
      // BUY order - use normal calculation
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
    currentPositions: { market: string; size: number; value?: number }[],
    settings: CopySettings
  ): { valid: boolean; reason?: string } {
    if (calculatedTrade.size <= 0) {
      return {
        valid: false,
        reason: `Trade size is ${calculatedTrade.size} (must be > 0)`
      }
    }

    // Max position size limits the value of THIS SINGLE TRADE
    // This protects against copying huge trades from the trader
    if (settings.maxPositionSize && calculatedTrade.value > settings.maxPositionSize) {
      return {
        valid: false,
        reason: `Trade size ($${calculatedTrade.value.toFixed(2)}) exceeds max position size limit ($${settings.maxPositionSize})`
      }
    }

    return { valid: true }
  }
}

export const positionCalculator = new PositionCalculator()
