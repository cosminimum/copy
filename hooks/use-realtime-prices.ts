'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface PriceUpdate {
  assetId: string
  conditionId: string
  price: number
  bestBid?: number
  bestAsk?: number
  timestamp: number
}

interface RealtimePricesState {
  connected: boolean
  prices: Map<string, PriceUpdate>
  lastUpdate: number | null
}

export function useRealtimePrices() {
  const [state, setState] = useState<RealtimePricesState>({
    connected: false,
    prices: new Map(),
    lastUpdate: null,
  })
  const eventSourceRef = useRef<EventSource | null>(null)
  const queryClient = useQueryClient()
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 10

  const connect = () => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    try {
      const eventSource = new EventSource('/api/realtime/prices')
      eventSourceRef.current = eventSource

      eventSource.addEventListener('connected', (e) => {
        console.log('[RealtimePrices] Connected to price stream')
        setState((prev) => ({ ...prev, connected: true }))
        reconnectAttempts.current = 0
      })

      eventSource.addEventListener('initial-prices', (e) => {
        try {
          const data = JSON.parse(e.data)
          const pricesMap = new Map<string, PriceUpdate>()

          data.prices.forEach((price: PriceUpdate) => {
            pricesMap.set(price.assetId, price)
          })

          setState((prev) => ({
            ...prev,
            prices: pricesMap,
            lastUpdate: Date.now(),
          }))

          // Invalidate position and stats queries to trigger refresh with cached prices
          queryClient.invalidateQueries({ queryKey: ['positions'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        } catch (error) {
          console.error('[RealtimePrices] Error parsing initial prices:', error)
        }
      })

      eventSource.addEventListener('price-update', (e) => {
        try {
          const priceUpdate: PriceUpdate = JSON.parse(e.data)

          setState((prev) => {
            const newPrices = new Map(prev.prices)
            newPrices.set(priceUpdate.assetId, priceUpdate)

            return {
              ...prev,
              prices: newPrices,
              lastUpdate: Date.now(),
            }
          })

          // Update React Query cache with new price
          // This will cause components using these queries to re-render
          queryClient.setQueryData(['positions'], (oldData: any) => {
            if (!oldData?.positions) return oldData

            return {
              ...oldData,
              positions: oldData.positions.map((position: any) => {
                if (position.asset === priceUpdate.assetId) {
                  const currentPrice = priceUpdate.price
                  const unrealizedPnL =
                    position.side === 'BUY'
                      ? (currentPrice - position.entryPrice) * position.size
                      : (position.entryPrice - currentPrice) * position.size

                  return {
                    ...position,
                    currentPrice,
                    unrealizedPnL,
                  }
                }
                return position
              }),
            }
          })

          // Also update dashboard stats
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        } catch (error) {
          console.error('[RealtimePrices] Error parsing price update:', error)
        }
      })

      eventSource.addEventListener('heartbeat', (e) => {
        // Connection is alive
      })

      eventSource.onerror = (error) => {
        console.error('[RealtimePrices] EventSource error:', error)
        setState((prev) => ({ ...prev, connected: false }))
        eventSource.close()

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          console.log(
            `[RealtimePrices] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`
          )

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, delay)
        } else {
          console.error('[RealtimePrices] Max reconnection attempts reached')
        }
      }
    } catch (error) {
      console.error('[RealtimePrices] Error creating EventSource:', error)
    }
  }

  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  const getPrice = (assetId: string): PriceUpdate | undefined => {
    return state.prices.get(assetId)
  }

  return {
    connected: state.connected,
    prices: state.prices,
    lastUpdate: state.lastUpdate,
    getPrice,
  }
}
