import { NextRequest, NextResponse } from 'next/server'
import { getProfileByWallet, getProfilesByWallets, isValidWalletAddress } from '@/lib/polymarket/api-client'

/**
 * Get trader profile(s) by wallet address
 * GET /api/traders/profile?wallet=<address>
 * GET /api/traders/profile?wallets=<address1>,<address2>,<address3>
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const singleWallet = searchParams.get('wallet')
    const multipleWallets = searchParams.get('wallets')

    // Single wallet lookup
    if (singleWallet) {
      if (!isValidWalletAddress(singleWallet)) {
        return NextResponse.json(
          { error: 'Invalid wallet address format' },
          { status: 400 }
        )
      }

      const profile = await getProfileByWallet(singleWallet)

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({ profile })
    }

    // Multiple wallets lookup
    if (multipleWallets) {
      const walletAddresses = multipleWallets.split(',').map(w => w.trim())

      // Validate all addresses
      const invalidAddresses = walletAddresses.filter(w => !isValidWalletAddress(w))
      if (invalidAddresses.length > 0) {
        return NextResponse.json(
          { error: `Invalid wallet address(es): ${invalidAddresses.join(', ')}` },
          { status: 400 }
        )
      }

      // Limit to reasonable number
      if (walletAddresses.length > 50) {
        return NextResponse.json(
          { error: 'Maximum 50 wallet addresses allowed' },
          { status: 400 }
        )
      }

      const profileMap = await getProfilesByWallets(walletAddresses)

      // Convert map to object for JSON response
      const profiles: Record<string, any> = {}
      profileMap.forEach((profile, wallet) => {
        profiles[wallet.toLowerCase()] = profile
      })

      return NextResponse.json({ profiles })
    }

    return NextResponse.json(
      { error: 'Either "wallet" or "wallets" parameter is required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error in trader profile API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trader profile' },
      { status: 500 }
    )
  }
}
