import { NextRequest, NextResponse } from 'next/server'
import { searchProfiles } from '@/lib/polymarket/api-client'

/**
 * Search for trader profiles via Polymarket API
 * GET /api/traders/search?q=<query>&limit=<number>
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 10

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      )
    }

    if (query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      )
    }

    // Search profiles via Polymarket API
    const profiles = await searchProfiles(query, Math.min(limit, 50))

    return NextResponse.json({
      profiles,
      count: profiles.length,
    })
  } catch (error) {
    console.error('Error in trader search API:', error)
    return NextResponse.json(
      { error: 'Failed to search traders' },
      { status: 500 }
    )
  }
}
