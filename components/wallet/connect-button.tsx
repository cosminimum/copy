'use client'

import { useAccount, useConnect, useDisconnect, useSignMessage, useConnectorClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Copy } from 'lucide-react'

export function ConnectButton() {
  const [mounted, setMounted] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const signingAttemptedRef = useRef(false)
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
      signingAttemptedRef.current = false // Reset the flag for new connection
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

  const handleSignIn = useCallback(async () => {
    if (!address) {
      console.log('No address available')
      return
    }
    if (isSigning) {
      console.log('Already signing')
      return
    }
    if (!connector) {
      console.error('No connector available')
      return
    }
    if (signingAttemptedRef.current) {
      console.log('Signing already attempted')
      return
    }

    signingAttemptedRef.current = true
    setIsSigning(true)

    try {
      const message = `Sign this message to authenticate with Forecast Market.\n\nWallet: ${address}\nTimestamp: ${Date.now()}`

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
      signingAttemptedRef.current = false // Reset on error so user can retry

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
  }, [address, connector, isSigning, signMessageAsync, toast])

  const handleCopyAddress = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      toast({
        title: "Copied",
        description: "Address copied to clipboard",
      })
    } catch (error) {
      console.error('Copy error:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy address",
      })
    }
  }

  const handleDisconnect = async () => {
    try {
      signingAttemptedRef.current = false // Reset for next connection
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
    // Debug logging
    console.log('useEffect check:', {
      mounted,
      isConnected,
      hasAddress: !!address,
      hasSession: !!session,
      isSigning,
      hasConnectorClient: !!connectorClient,
      signingAttempted: signingAttemptedRef.current
    })

    // Only auto-sign if all conditions are met
    if (mounted && isConnected && address && !session && !isSigning) {
      // If connectorClient is ready, sign immediately
      if (connectorClient) {
        console.log('Triggering auto-sign from useEffect (with connectorClient)')
        handleSignIn()
      } else {
        // Otherwise, wait a bit for it to be ready
        console.log('ConnectorClient not ready, waiting...')
        const timeout = setTimeout(() => {
          if (!signingAttemptedRef.current) {
            console.log('Triggering auto-sign after timeout')
            handleSignIn()
          }
        }, 1000)
        return () => clearTimeout(timeout)
      }
    }
  }, [mounted, isConnected, address, session, connectorClient, isSigning, handleSignIn])

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
        <div className="flex items-center gap-1 text-sm">
          <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyAddress}
            className="h-6 w-6 p-0 hover:bg-accent"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <Button variant="outline" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </div>
    )
  }

  if (isConnected && !session) {
    return (
      <div className="flex items-center gap-2">
        <Button disabled>
          {isSigning ? 'Signing Message...' : 'Authenticating...'}
        </Button>
        <Button variant="outline" onClick={handleDisconnect} disabled={isSigning} size="sm">
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
