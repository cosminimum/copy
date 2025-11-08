'use client'

import { useAccount, useConnect, useDisconnect, useSignMessage, useConnectorClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export function ConnectButton() {
  const [mounted, setMounted] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const { data: session } = useSession()
  const { toast } = useToast()
  const { data: connectorClient } = useConnectorClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleConnect = async (connectorIndex: number) => {
    try {
      await connect({ connector: connectors[connectorIndex] })
    } catch (error: any) {
      console.error('Connection error:', error)
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: error?.message || "Failed to connect wallet. Please try again.",
      })
    }
  }

  const handleSignIn = async () => {
    if (!address) return
    if (isSigning) return
    if (!connector) {
      console.error('No connector available')
      return
    }

    setIsSigning(true)

    try {
      const message = `Sign this message to authenticate with Polymarket Copy Trader.\n\nWallet: ${address}\nTimestamp: ${Date.now()}`

      const signature = await signMessageAsync({
        message,
        account: address,
      })

      const result = await signIn('credentials', {
        message,
        signature,
        address,
        redirect: false,
      })

      if (result?.error) {
        throw new Error(result.error)
      }

      toast({
        title: "Connected!",
        description: "Your wallet has been authenticated successfully.",
      })
    } catch (error: any) {
      console.error('Sign in error:', error)

      let errorMessage = "Failed to sign message. Please try again."

      if (error?.message?.includes('User rejected')) {
        errorMessage = "Signature request was rejected."
      } else if (error?.message?.includes('getChainId')) {
        errorMessage = "Wallet connector error. Try disconnecting and reconnecting."
      }

      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: errorMessage,
      })
    } finally {
      setIsSigning(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await signOut()
      disconnect()
      toast({
        title: "Disconnected",
        description: "Your wallet has been disconnected.",
      })
    } catch (error) {
      console.error('Disconnect error:', error)
    }
  }

  useEffect(() => {
    // Only auto-sign if:
    // 1. Component is mounted
    // 2. Wallet is connected
    // 3. Has address
    // 4. No existing session
    // 5. Not already signing
    // 6. Connector client is ready (prevents "getChainId is not a function" error)
    if (mounted && isConnected && address && !session && !isSigning && connectorClient) {
      handleSignIn()
    }
  }, [mounted, isConnected, address, session, connectorClient])

  if (!mounted) {
    return (
      <div className="flex gap-2">
        <Button disabled>
          Connect Wallet
        </Button>
      </div>
    )
  }

  if (session && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm">
          {address.slice(0, 6)}...{address.slice(-4)}
        </div>
        <Button variant="outline" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </div>
    )
  }

  if (isConnected && !session) {
    return (
      <div className="flex gap-2">
        <Button onClick={handleSignIn} disabled={isSigning}>
          {isSigning ? 'Signing...' : 'Sign Message'}
        </Button>
        <Button variant="outline" onClick={handleDisconnect} disabled={isSigning}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => handleConnect(0)}>
        Connect MetaMask
      </Button>
      <Button variant="outline" onClick={() => handleConnect(1)}>
        WalletConnect
      </Button>
    </div>
  )
}
