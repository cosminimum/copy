/**
 * Polymarket CLOB (Central Limit Order Book) API Client
 * Fetches order book data and market information from Polymarket
 */

const CLOB_API_URL = process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com'

export interface OrderBookOrder {
  order_id: string
  market: string
  asset_id: string
  price: string
  size: string
  side: 'BUY' | 'SELL'
  owner: string
  outcome: string
  // Order signature fields (needed for fillOrder)
  salt: string
  maker: string
  signer: string
  taker: string
  tokenId: string
  makerAmount: string
  takerAmount: string
  expiration: string
  nonce: string
  feeRateBps: string
  signatureType: number
  signature: string
}

export interface OrderBook {
  market: string
  asset_id: string
  asks: OrderBookOrder[]
  bids: OrderBookOrder[]
  timestamp: number
}

export interface MarketInfo {
  condition_id: string
  question_id: string
  tokens: Array<{
    token_id: string
    outcome: string
    price: string
    winner: boolean
  }>
  market_slug: string
  end_date_iso: string
  question: string
  description: string
  active: boolean
}

export class PolymarketCLOBClient {
  private baseURL: string

  constructor(baseURL: string = CLOB_API_URL) {
    this.baseURL = baseURL
  }

  /**
   * Get order book for a specific token
   */
  async getOrderBook(tokenId: string): Promise<OrderBook | null> {
    try {
      const response = await fetch(`${this.baseURL}/book?token_id=${tokenId}`)

      if (!response.ok) {
        console.error(`Failed to fetch order book: ${response.status} ${response.statusText}`)
        return null
      }

      const data = await response.json()
      return data as OrderBook
    } catch (error: any) {
      console.error('[CLOB] Error fetching order book:', error)
      return null
    }
  }

  /**
   * Get best ask (lowest price for buying) using sampling API
   * The sampling API returns executable orders with all signature fields
   */
  async getBestAsk(tokenId: string): Promise<OrderBookOrder | null> {
    try {
      // Use sampling API for executable orders
      const response = await fetch(`${this.baseURL}/sampling/markets/${tokenId}`)

      if (!response.ok) {
        console.error(`[CLOB] Failed to fetch sampling data: ${response.status} ${response.statusText}`)
        // Fallback to order book
        return this.getBestAskFromBook(tokenId)
      }

      const data = await response.json()

      // Sampling API returns asks and bids with full order details
      if (data.asks && data.asks.length > 0) {
        return data.asks[0] as OrderBookOrder
      }

      return null
    } catch (error: any) {
      console.error('[CLOB] Error getting best ask from sampling:', error)
      // Fallback to order book
      return this.getBestAskFromBook(tokenId)
    }
  }

  /**
   * Fallback: Get best ask from order book (may not have all signature fields)
   */
  private async getBestAskFromBook(tokenId: string): Promise<OrderBookOrder | null> {
    try {
      const orderBook = await this.getOrderBook(tokenId)
      if (!orderBook || !orderBook.asks || orderBook.asks.length === 0) {
        return null
      }

      // Asks are already sorted by price (lowest first)
      return orderBook.asks[0]
    } catch (error: any) {
      console.error('[CLOB] Error getting best ask from book:', error)
      return null
    }
  }

  /**
   * Get best bid (highest price for selling) using sampling API
   * The sampling API returns executable orders with all signature fields
   */
  async getBestBid(tokenId: string): Promise<OrderBookOrder | null> {
    try {
      // Use sampling API for executable orders
      const response = await fetch(`${this.baseURL}/sampling/markets/${tokenId}`)

      if (!response.ok) {
        console.error(`[CLOB] Failed to fetch sampling data: ${response.status} ${response.statusText}`)
        // Fallback to order book
        return this.getBestBidFromBook(tokenId)
      }

      const data = await response.json()

      // Sampling API returns asks and bids with full order details
      if (data.bids && data.bids.length > 0) {
        return data.bids[0] as OrderBookOrder
      }

      return null
    } catch (error: any) {
      console.error('[CLOB] Error getting best bid from sampling:', error)
      // Fallback to order book
      return this.getBestBidFromBook(tokenId)
    }
  }

  /**
   * Fallback: Get best bid from order book (may not have all signature fields)
   */
  private async getBestBidFromBook(tokenId: string): Promise<OrderBookOrder | null> {
    try {
      const orderBook = await this.getOrderBook(tokenId)
      if (!orderBook || !orderBook.bids || orderBook.bids.length === 0) {
        return null
      }

      // Bids are already sorted by price (highest first)
      return orderBook.bids[0]
    } catch (error: any) {
      console.error('[CLOB] Error getting best bid from book:', error)
      return null
    }
  }

  /**
   * Get market information by condition ID
   */
  async getMarketInfo(conditionId: string): Promise<MarketInfo | null> {
    try {
      const response = await fetch(`${this.baseURL}/markets/${conditionId}`)

      if (!response.ok) {
        console.error(`Failed to fetch market info: ${response.status} ${response.statusText}`)
        return null
      }

      const data = await response.json()
      return data as MarketInfo
    } catch (error: any) {
      console.error('[CLOB] Error fetching market info:', error)
      return null
    }
  }

  /**
   * Get mid-market price for a token (average of best bid and ask)
   */
  async getMidMarketPrice(tokenId: string): Promise<number | null> {
    try {
      const [bestAsk, bestBid] = await Promise.all([
        this.getBestAsk(tokenId),
        this.getBestBid(tokenId),
      ])

      if (!bestAsk || !bestBid) {
        return null
      }

      const askPrice = parseFloat(bestAsk.price)
      const bidPrice = parseFloat(bestBid.price)

      return (askPrice + bidPrice) / 2
    } catch (error: any) {
      console.error('[CLOB] Error calculating mid-market price:', error)
      return null
    }
  }

  /**
   * Get price impact for a given trade size
   * Returns the average price to fill a buy/sell order of given size
   */
  async getPriceImpact(
    tokenId: string,
    side: 'BUY' | 'SELL',
    sizeUSDC: number
  ): Promise<{ averagePrice: number; totalSize: number; slippage: number } | null> {
    try {
      const orderBook = await this.getOrderBook(tokenId)
      if (!orderBook) {
        return null
      }

      const orders = side === 'BUY' ? orderBook.asks : orderBook.bids
      if (orders.length === 0) {
        return null
      }

      let remainingSize = sizeUSDC
      let totalCost = 0
      let totalShares = 0

      for (const order of orders) {
        const orderPrice = parseFloat(order.price)
        const orderSize = parseFloat(order.size)

        if (remainingSize <= 0) break

        const sizeToTake = Math.min(remainingSize, orderSize)
        totalCost += sizeToTake * orderPrice
        totalShares += sizeToTake
        remainingSize -= sizeToTake
      }

      if (totalShares === 0) {
        return null
      }

      const averagePrice = totalCost / totalShares
      const bestPrice = parseFloat(orders[0].price)
      const slippage = ((averagePrice - bestPrice) / bestPrice) * 100

      return {
        averagePrice,
        totalSize: totalShares,
        slippage,
      }
    } catch (error: any) {
      console.error('[CLOB] Error calculating price impact:', error)
      return null
    }
  }

  /**
   * Check if there's sufficient liquidity for a trade
   */
  async checkLiquidity(
    tokenId: string,
    side: 'BUY' | 'SELL',
    sizeUSDC: number
  ): Promise<{ hasLiquidity: boolean; availableSize: number }> {
    try {
      const orderBook = await this.getOrderBook(tokenId)
      if (!orderBook) {
        return { hasLiquidity: false, availableSize: 0 }
      }

      const orders = side === 'BUY' ? orderBook.asks : orderBook.bids
      const totalAvailable = orders.reduce((sum, order) => sum + parseFloat(order.size), 0)

      return {
        hasLiquidity: totalAvailable >= sizeUSDC,
        availableSize: totalAvailable,
      }
    } catch (error: any) {
      console.error('[CLOB] Error checking liquidity:', error)
      return { hasLiquidity: false, availableSize: 0 }
    }
  }
}

// Singleton instance
export const polymarketCLOB = new PolymarketCLOBClient()
