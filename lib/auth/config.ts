import { NextAuthConfig } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { verifyMessage } from 'viem'
import prisma from '@/lib/db/prisma'

export const authConfig: NextAuthConfig = {
  providers: [
    CredentialsProvider({
      name: 'Ethereum',
      credentials: {
        message: { label: 'Message', type: 'text' },
        signature: { label: 'Signature', type: 'text' },
        address: { label: 'Address', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.message || !credentials?.signature || !credentials?.address) {
          return null
        }

        try {
          const isValid = await verifyMessage({
            address: credentials.address as `0x${string}`,
            message: credentials.message as string,
            signature: credentials.signature as `0x${string}`,
          })

          if (!isValid) {
            return null
          }

          let user = await prisma.user.findUnique({
            where: { walletAddress: credentials.address as string },
          })

          if (!user) {
            user = await prisma.user.create({
              data: {
                walletAddress: credentials.address as string,
              },
            })
          }

          return {
            id: user.id,
            walletAddress: user.walletAddress,
            email: user.email,
            name: user.name,
          }
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.walletAddress = user.walletAddress
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.walletAddress = token.walletAddress as string
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
}
