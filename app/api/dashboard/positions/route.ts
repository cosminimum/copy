import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      })
    }

    const positions = await prisma.position.findMany({
      where: {
        userId: session.user.id,
        status: 'OPEN',
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ positions }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Error fetching positions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
