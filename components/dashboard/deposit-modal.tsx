'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy, ExternalLink, CheckCircle2, AlertCircle, Fuel } from 'lucide-react'
import QRCode from 'qrcode'

interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  safeAddress: string
  balance: number
}

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const MIN_OPERATOR_BALANCE = 0.1 // Minimum POL balance for operator

export function DepositModal({ isOpen, onClose, safeAddress, balance }: DepositModalProps) {
  const [copied, setCopied] = useState(false)
  const [tokenAddressCopied, setTokenAddressCopied] = useState(false)
  const [operatorAddressCopied, setOperatorAddressCopied] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [operatorQrCodeUrl, setOperatorQrCodeUrl] = useState<string>('')
  const [currentBalance, setCurrentBalance] = useState(balance)
  const [operatorAddress, setOperatorAddress] = useState<string>('')
  const [operatorPolBalance, setOperatorPolBalance] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const operatorCanvasRef = useRef<HTMLCanvasElement>(null)

  // Generate QR code
  useEffect(() => {
    if (isOpen && safeAddress && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        safeAddress,
        {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        },
        (error) => {
          if (error) console.error('Error generating QR code:', error)
        }
      )

      // Also generate data URL for potential download
      QRCode.toDataURL(safeAddress, { width: 400 }).then(setQrCodeUrl)
    }
  }, [isOpen, safeAddress])

  // Poll for balance updates
  useEffect(() => {
    if (!isOpen) return

    const pollBalance = async () => {
      try {
        const response = await fetch('/api/wallet/deposit')
        if (response.ok) {
          const data = await response.json()
          setCurrentBalance(data.balance)

          // Update operator info
          if (data.operatorAddress) {
            setOperatorAddress(data.operatorAddress)
            setOperatorPolBalance(data.operatorPolBalance || 0)

            // Generate operator QR code
            if (operatorCanvasRef.current) {
              QRCode.toCanvas(
                operatorCanvasRef.current,
                data.operatorAddress,
                {
                  width: 150,
                  margin: 2,
                  color: {
                    dark: '#000000',
                    light: '#FFFFFF',
                  },
                },
                (error) => {
                  if (error) console.error('Error generating operator QR code:', error)
                }
              )
            }

            QRCode.toDataURL(data.operatorAddress, { width: 300 }).then(setOperatorQrCodeUrl)
          }
        }
      } catch (error) {
        console.error('Error fetching balance:', error)
      }
    }

    // Poll every 10 seconds
    const interval = setInterval(pollBalance, 10000)

    // Initial fetch
    pollBalance()

    return () => clearInterval(interval)
  }, [isOpen])

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(safeAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Error copying address:', error)
    }
  }

  const handleCopyTokenAddress = async () => {
    try {
      await navigator.clipboard.writeText(USDC_E_ADDRESS)
      setTokenAddressCopied(true)
      setTimeout(() => setTokenAddressCopied(false), 2000)
    } catch (error) {
      console.error('Error copying token address:', error)
    }
  }

  const handleCopyOperatorAddress = async () => {
    try {
      await navigator.clipboard.writeText(operatorAddress)
      setOperatorAddressCopied(true)
      setTimeout(() => setOperatorAddressCopied(false), 2000)
    } catch (error) {
      console.error('Error copying operator address:', error)
    }
  }

  const handleOpenSafe = () => {
    window.open(`https://app.safe.global/home?safe=matic:${safeAddress}`, '_blank')
  }

  const needsOperatorTopup = operatorPolBalance < MIN_OPERATOR_BALANCE

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deposit to Safe Wallet</DialogTitle>
          <DialogDescription>
            Send USDC.e (Bridged USDC) to your Safe wallet address
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 pr-2">
          {/* Current Balance */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Current Balance</div>
            <div className="text-2xl font-bold">${currentBalance.toFixed(2)}</div>
          </div>

          {/* Safe Address */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Safe Wallet Address</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono break-all">
                {safeAddress}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyAddress}
                className="shrink-0"
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-3 text-sm">
            <div className="font-medium">Deposit Instructions:</div>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Copy the Safe wallet address above</li>
              <li>
                Send <strong className="text-foreground">USDC.e (Bridged USDC)</strong> from your wallet or exchange
              </li>
              <li>Use the Polygon network</li>
              <li>Wait for transaction confirmation</li>
            </ol>
          </div>

          {/* USDC.e Warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-2">
            <div className="font-medium text-sm text-yellow-600 dark:text-yellow-500">
              Important: Use USDC.e (Bridged), NOT Native USDC
            </div>
            <div className="text-xs text-muted-foreground">
              Polymarket uses bridged USDC (USDC.e). Verify the token contract address:
            </div>
            <div className="flex gap-2 items-center">
              <code className="flex-1 bg-muted rounded px-2 py-1 text-xs font-mono break-all">
                {USDC_E_ADDRESS}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleCopyTokenAddress}
              >
                {tokenAddressCopied ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          {/* Operator Balance & Top-up Instructions */}
          {operatorAddress && (
            <div className={`rounded-lg p-4 space-y-3 ${
              needsOperatorTopup
                ? 'bg-red-500/10 border border-red-500/20'
                : 'bg-muted/50'
            }`}>
              <div className="flex items-start gap-3">
                <Fuel className={`h-5 w-5 mt-0.5 shrink-0 ${
                  needsOperatorTopup ? 'text-red-500' : 'text-muted-foreground'
                }`} />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">Operator Wallet (Gas)</div>
                    <div className={`text-sm font-semibold ${
                      needsOperatorTopup ? 'text-red-600 dark:text-red-500' : 'text-foreground'
                    }`}>
                      {operatorPolBalance.toFixed(4)} POL
                    </div>
                  </div>

                  {needsOperatorTopup && (
                    <div className="bg-red-500/5 rounded p-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-600 dark:text-red-400">
                          <div className="font-medium mb-1">Low Gas Balance!</div>
                          <div className="text-muted-foreground">
                            The operator wallet needs POL to pay for transaction gas fees. Send at least 0.1 POL to continue trading.
                          </div>
                        </div>
                      </div>

                      {/* Operator Address with QR */}
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-medium">Top-up Address:</div>
                        <div className="flex gap-2 items-start">
                          <div className="flex-shrink-0">
                            <canvas
                              ref={operatorCanvasRef}
                              className="border border-border rounded"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="flex gap-2">
                              <code className="flex-1 bg-muted rounded px-2 py-1 text-xs font-mono break-all">
                                {operatorAddress}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={handleCopyOperatorAddress}
                              >
                                {operatorAddressCopied ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <div>• Send POL (Polygon native token) to this address</div>
                              <div>• Minimum: 0.1 POL (~$0.05 USD)</div>
                              <div>• Recommended: 0.5 POL for ~100 trades</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!needsOperatorTopup && (
                    <div className="text-xs text-muted-foreground">
                      Gas balance is healthy. The operator wallet automatically pays transaction fees.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* External Link to Safe */}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleOpenSafe}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Safe Web Interface
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
