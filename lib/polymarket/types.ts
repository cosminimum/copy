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
