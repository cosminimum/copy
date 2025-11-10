import { RealTimeDataClient } from '@polymarket/real-time-data-client'
import type { Message } from '@polymarket/real-time-data-client'
import { TradeMessage, SubscriptionConfig, TraderToFollow } from './types'

export class PolymarketWebSocketService {
  private client: RealTimeDataClient | null = null
  private isConnected = false
  private subscriptions: Map<string, SubscriptionConfig> = new Map()
  private tradeHandlers: ((trade: TradeMessage) => void)[] = []
  private errorHandlers: ((error: Error) => void)[] = []
  private connectHandlers: (() => void)[] = []
  private disconnectHandlers: (() => void)[] = []
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 5000

  constructor() {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const onMessage = (client: RealTimeDataClient, message: Message): void => {
          try {
            if (message.topic === 'activity' && message.type === 'trades') {
              const trade = message.payload as TradeMessage
              this.tradeHandlers.forEach(handler => {
                try {
                  handler(trade)
                } catch (error) {
                  console.error('Error in trade handler:', error)
                  this.errorHandlers.forEach(eh => eh(error as Error))
                }
              })
            }
          } catch (error) {
            console.error('Error processing message:', error)
            this.errorHandlers.forEach(eh => eh(error as Error))
          }
        }

        const onConnect = (client: RealTimeDataClient): void => {
          this.client = client
          this.isConnected = true
          this.reconnectAttempts = 0

          console.log('WebSocket connected successfully')

          // Resubscribe to all previous subscriptions
          this.subscriptions.forEach((config) => {
            this.subscribeToConfig(config)
          })

          // Notify connect handlers
          this.connectHandlers.forEach(handler => {
            try {
              handler()
            } catch (error) {
              console.error('Error in connect handler:', error)
            }
          })

          resolve()
        }

        const onStatusChange = (status: string): void => {
          console.log('WebSocket status changed:', status)

          if (status === 'disconnected' || status === 'closed') {
            this.isConnected = false
            this.client = null

            // Notify disconnect handlers
            this.disconnectHandlers.forEach(handler => {
              try {
                handler()
              } catch (error) {
                console.error('Error in disconnect handler:', error)
              }
            })

            // Attempt to reconnect
            this.attemptReconnect()
          }
        }

        new RealTimeDataClient({ onMessage, onConnect, onStatusChange }).connect()
      } catch (error) {
        console.error('WebSocket connection error:', error)
        this.errorHandlers.forEach(eh => eh(error as Error))
        reject(error)
      }
    })
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay / 1000}s...`)

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error)
      })
    }, this.reconnectDelay)
  }

  private subscribeToConfig(config: SubscriptionConfig): void {
    if (!this.client || !this.isConnected) {
      console.warn('Client not connected, subscription will be applied on connect')
      return
    }

    console.log('Subscribing with config:', JSON.stringify(config, null, 2))
    this.client.subscribe({
      subscriptions: [config],
    })
    console.log(`Active subscriptions: ${this.subscriptions.size}`)
  }

  subscribeToTrader(trader: TraderToFollow): void {
    // Build filters - always include wallet address
    const filterObj: Record<string, string> = {
      user: trader.walletAddress.toLowerCase()
    }

    // Add optional filters
    if (trader.eventSlug) {
      filterObj.event_slug = trader.eventSlug
    }
    if (trader.marketSlug) {
      filterObj.market_slug = trader.marketSlug
    }

    const filters = JSON.stringify(filterObj)

    const config: SubscriptionConfig = {
      topic: 'activity',
      type: 'trades',
      filters: filters,
    }

    const key = `${trader.walletAddress}-${trader.eventSlug || trader.marketSlug || 'all'}`
    this.subscriptions.set(key, config)

    if (this.isConnected && this.client) {
      this.subscribeToConfig(config)
    }
  }

  unsubscribeFromTrader(trader: TraderToFollow): void {
    const key = `${trader.walletAddress}-${trader.eventSlug || trader.marketSlug || 'all'}`
    const config = this.subscriptions.get(key)

    if (config && this.client && this.isConnected) {
      this.client.unsubscribe({
        subscriptions: [config],
      })
    }

    this.subscriptions.delete(key)
  }

  onTrade(handler: (trade: TradeMessage) => void): () => void {
    this.tradeHandlers.push(handler)

    return () => {
      this.tradeHandlers = this.tradeHandlers.filter(h => h !== handler)
    }
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.push(handler)

    return () => {
      this.errorHandlers = this.errorHandlers.filter(h => h !== handler)
    }
  }

  onConnect(handler: () => void): () => void {
    this.connectHandlers.push(handler)

    return () => {
      this.connectHandlers = this.connectHandlers.filter(h => h !== handler)
    }
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.push(handler)

    return () => {
      this.disconnectHandlers = this.disconnectHandlers.filter(h => h !== handler)
    }
  }

  disconnect(): void {
    if (this.client && this.isConnected) {
      this.client.disconnect()
      this.client = null
      this.isConnected = false
      this.subscriptions.clear()
      this.tradeHandlers = []
      this.errorHandlers = []
      this.connectHandlers = []
      this.disconnectHandlers = []
      this.reconnectAttempts = 0
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts
  }
}

export const polymarketWS = new PolymarketWebSocketService()
