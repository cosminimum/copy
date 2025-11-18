import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Dashboard is now accessible without authentication
  // It will show an "unconnected state" when user is not authenticated
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*']
}
