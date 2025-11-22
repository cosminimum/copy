export interface TradeMessage {
  asset: string
  bio: string
  conditionId: string
  eventSlug: string
  icon: string
  name: string
  outcome: string
  outcomeIndex: number
  price: number
  profileImage: string
  proxyWallet: string
  pseudonym: string
  side: 'BUY' | 'SELL'
  size: number
  slug: string
  timestamp: number
  title: string
  transactionHash: string
}

export interface PriceChange {
  a: string  // asset identifier
  h: string  // unique hash ID of the book snapshot
  p: string  // price quoted (e.g., "0.5")
  s: string  // side of the quote: "BUY" or "SELL"
  si: string // size or volume available at quoted price
  ba?: string // best ask price
  bb?: string // best bid price
}

export interface PriceChanges {
  m: string  // condition ID of the market
  pc: PriceChange[]  // list of price changes by book
  t: string  // timestamp in milliseconds since epoch
}

export interface LastTradePrice {
  asset_id: string
  fee_rate_bps: string
  market: string
  price: string
  side: string
  size: string
}

export interface SubscriptionConfig {
  topic: string
  type: string
  filters?: string
}

export interface TraderToFollow {
  walletAddress: string
  eventSlug?: string
  marketSlug?: string
}
