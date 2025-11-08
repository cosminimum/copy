/**
 * Polymarket API Client
 *
 * Client for interacting with Polymarket's public API to fetch trader profiles
 * and search for traders.
 */

const POLYMARKET_API_URL = process.env.POLYMARKET_API_URL || 'https://gamma-api.polymarket.com'

/**
 * Validate Ethereum wallet address format
 */
export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export interface PolymarketProfile {
  id: string
  name: string | null
  pseudonym: string | null
  bio: string | null
  profileImage: string | null
  proxyWallet: string
  walletActivated: boolean
  profileImageOptimized?: {
    imageUrlOptimized: string | null
  } | null
}

export interface SearchResponse {
  profiles: PolymarketProfile[] | null
  pagination: {
    hasMore: boolean
    totalResults: number
  }
}

/**
 * Search for trader profiles by name, pseudonym, or wallet address
 */
export async function searchProfiles(query: string, limit: number = 10): Promise<PolymarketProfile[]> {
  try {
    const trimmedQuery = query.trim()

    // If query looks like a wallet address, use the direct lookup
    if (isValidWalletAddress(trimmedQuery)) {
      const profile = await getProfileByWallet(trimmedQuery)
      return profile ? [profile] : []
    }

    // Otherwise use the public search API
    const params = new URLSearchParams({
      q: trimmedQuery,
      search_profiles: 'true',
      limit_per_type: limit.toString(),
    })

    const response = await fetch(`${POLYMARKET_API_URL}/public-search?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      next: {
        revalidate: 300, // Cache for 5 minutes
      },
    })

    if (!response.ok) {
      console.error(`Polymarket API error: ${response.status} ${response.statusText}`)
      return []
    }

    const data: SearchResponse = await response.json()

    return data.profiles || []
  } catch (error) {
    console.error('Error searching Polymarket profiles:', error)
    return []
  }
}

/**
 * Get a single trader profile by wallet address using the activity API
 */
export async function getProfileByWallet(walletAddress: string): Promise<PolymarketProfile | null> {
  try {
    // Use the data-api activity endpoint to get profile info
    const response = await fetch(
      `https://data-api.polymarket.com/activity?user=${walletAddress}&limit=1`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        next: {
          revalidate: 300, // Cache for 5 minutes
        },
      }
    )

    if (!response.ok) {
      console.error(`Polymarket Data API error: ${response.status} ${response.statusText}`)
      return null
    }

    const activities = await response.json()

    // Extract profile from first activity (if any exists)
    if (!activities || activities.length === 0) {
      return null
    }

    const activity = activities[0]

    return {
      id: activity.proxyWallet,
      name: activity.name || null,
      pseudonym: activity.pseudonym || null,
      bio: activity.bio || null,
      profileImage: activity.profileImage || null,
      proxyWallet: activity.proxyWallet,
      walletActivated: true,
      profileImageOptimized: activity.profileImageOptimized || null,
    }
  } catch (error) {
    console.error(`Error fetching profile for wallet ${walletAddress}:`, error)
    return null
  }
}

/**
 * Batch fetch trader profiles by wallet addresses
 * Returns a map of wallet address -> profile
 */
export async function getProfilesByWallets(
  walletAddresses: string[]
): Promise<Map<string, PolymarketProfile>> {
  const profileMap = new Map<string, PolymarketProfile>()

  // Fetch profiles in parallel (with reasonable concurrency)
  const batchSize = 5
  for (let i = 0; i < walletAddresses.length; i += batchSize) {
    const batch = walletAddresses.slice(i, i + batchSize)

    const results = await Promise.allSettled(
      batch.map(async (wallet) => {
        const profile = await getProfileByWallet(wallet)
        return { wallet, profile }
      })
    )

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.profile) {
        profileMap.set(
          result.value.wallet.toLowerCase(),
          result.value.profile
        )
      }
    })
  }

  return profileMap
}

/**
 * Get display name for a profile (prefers name, falls back to pseudonym, then shortened wallet)
 */
export function getProfileDisplayName(
  profile: PolymarketProfile | null,
  walletAddress: string
): string {
  if (!profile) {
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
  }

  return (
    profile.name ||
    profile.pseudonym ||
    `${profile.proxyWallet.slice(0, 6)}...${profile.proxyWallet.slice(-4)}`
  )
}

/**
 * Get profile image URL (prefers optimized, falls back to regular, then default avatar)
 */
export function getProfileImage(
  profile: PolymarketProfile | null,
  walletAddress: string
): string {
  if (!profile) {
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${walletAddress}`
  }

  return (
    profile.profileImageOptimized?.imageUrlOptimized ||
    profile.profileImage ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${profile.proxyWallet}`
  )
}
