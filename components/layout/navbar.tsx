'use client'

import Link from 'next/link'
import { ConnectButton } from '@/components/wallet/connect-button'

export function Navbar() {
  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
            FORECAST MARKET
          </Link>
          <div className="flex items-center gap-4">
            <ConnectButton />
          </div>
        </div>
      </div>
    </nav>
  )
}
