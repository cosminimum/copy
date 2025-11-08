'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wifi, WifiOff, Terminal, HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function WebSocketStatus() {
  const [isConnected, setIsConnected] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  useEffect(() => {
    // Check if websocket listener is running by checking for a heartbeat endpoint
    // For now, we'll just show instructions since we don't have a health check endpoint yet
    setLastCheck(new Date())
  }, [])

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">WebSocket Listener</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div className="space-y-2">
                    <p className="font-semibold">What is the WebSocket Listener?</p>
                    <p className="text-sm">
                      A background process that monitors Polymarket for trades from traders you follow.
                      When a trader makes a trade, it automatically copies it to your account based on your settings.
                    </p>
                    <p className="text-sm font-semibold">Required for copy trading to work!</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'} className="gap-1">
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                Not Running
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!isConnected && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              The WebSocket listener is not currently running. Trades will not be copied automatically.
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Terminal className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-medium">To start the listener:</p>
                  <div className="bg-background rounded border px-3 py-2 font-mono text-xs">
                    npx tsx scripts/websocket-listener.ts
                  </div>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-semibold">What it does:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>Monitors trades from all followed traders in real-time</li>
                <li>Automatically copies trades based on your settings</li>
                <li>Updates your positions and portfolio</li>
              </ul>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                // Copy command to clipboard
                navigator.clipboard.writeText('npx ts-node scripts/websocket-listener.ts')
                alert('Command copied to clipboard!')
              }}
            >
              Copy Command
            </Button>
          </div>
        )}

        {isConnected && (
          <div className="space-y-2">
            <div className="text-sm text-green-600 dark:text-green-400">
              ✓ Listener is active and monitoring trades
            </div>
            <div className="text-xs text-muted-foreground">
              Trades from followed traders will be automatically copied based on your settings.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
