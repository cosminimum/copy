'use client'

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={true}
    >
      {children}
    </NextAuthSessionProvider>
  )
}
