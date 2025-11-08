import 'next-auth'

declare module 'next-auth' {
  interface User {
    walletAddress?: string
  }

  interface Session {
    user: {
      id: string
      walletAddress: string
      email?: string | null
      name?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    walletAddress?: string
    id?: string
  }
}
