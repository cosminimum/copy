'use client'

/**
 * Manual Swap Instructions Component
 *
 * Provides step-by-step instructions for manual POL transfer when automated swap fails
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Copy, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { ethers } from 'ethers'

interface ManualSwapInstructionsProps {
  polAmount: string
  operatorAddress: string
  onTransferDetected: (txHash: string) => void
}

export function ManualSwapInstructions({
  polAmount,
  operatorAddress,
  onTransferDetected,
}: ManualSwapInstructionsProps) {
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)

  const copyAddress = () => {
    navigator.clipboard.writeText(operatorAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyAmount = () => {
    navigator.clipboard.writeText(polAmount)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
          Automated swap unavailable
        </p>
        <p className="text-xs text-yellow-700 dark:text-yellow-300">
          Please send POL manually using Phantom's normal send function. We'll detect the transfer automatically.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-semibold">Step-by-Step Instructions:</h3>

          {/* Step 1 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Copy the operator address:</p>
            <div className="flex gap-2">
              <code className="flex-1 p-3 bg-muted rounded-lg text-xs font-mono break-all">
                {operatorAddress}
              </code>
              <Button variant="outline" size="icon" onClick={copyAddress}>
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">2. Send this amount of POL:</p>
            <div className="flex gap-2">
              <div className="flex-1 p-3 bg-muted rounded-lg text-center">
                <span className="text-2xl font-bold">{polAmount} POL</span>
              </div>
              <Button variant="outline" size="icon" onClick={copyAmount}>
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Step 3 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">3. Open Phantom and send POL:</p>
            <div className="text-xs text-muted-foreground space-y-1 ml-4">
              <p>• Click "Send" in your Phantom wallet</p>
              <p>• Paste the operator address</p>
              <p>• Enter {polAmount} POL</p>
              <p>• Make sure you're on <strong>Polygon network</strong></p>
              <p>• Confirm the transaction</p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
              4. We'll detect the transfer automatically
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              After you send POL, we'll automatically swap 95% to USDC.e and transfer it to your Safe wallet.
              The remaining 5% stays in the operator for gas fees.
            </p>
          </div>
        </CardContent>
      </Card>

      {checking && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Checking for transfer...</span>
        </div>
      )}

      <div className="text-xs text-center text-muted-foreground">
        Having trouble? <a href="https://help.phantom.app/hc/en-us/articles/13613846988051-How-to-send-crypto" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Learn how to send with Phantom <ExternalLink className="h-3 w-3 inline" />
        </a>
      </div>
    </div>
  )
}
