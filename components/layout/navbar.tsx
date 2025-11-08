'use client'

import Link from 'next/link'
import { ConnectButton } from '@/components/wallet/connect-button'

export function Navbar() {
  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold">
              Polymarket Copy Trader
            </Link>
            <div className="flex gap-4">
              <Link href="/dashboard" className="text-sm hover:text-primary">
                Dashboard
              </Link>
              <Link href="/settings" className="text-sm hover:text-primary">
                Settings
              </Link>
            </div>
          </div>
          <ConnectButton />
        </div>
      </div>
    </nav>
  )
}
