import { Navbar } from '@/components/layout/navbar'
import { TradeSimulator } from '@/components/testing/trade-simulator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function TestPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Testing Tools</h1>
          <p className="text-muted-foreground">
            Simulate trades and test the copy trading flow
          </p>
        </div>

        <div className="space-y-6">
          <TradeSimulator />

          <Card>
            <CardHeader>
              <CardTitle>How to Test</CardTitle>
              <CardDescription>Step-by-step testing guide</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">1. Setup Database</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Run these commands to initialize the database:
                </p>
                <pre className="bg-muted p-3 rounded text-sm">
                  npm run db:push{'\n'}
                  npm run db:seed
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">2. Add Real Traders</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Add real Polymarket trader wallet addresses:
                </p>
                <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`# Single trader
ts-node scripts/add-traders.ts 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb "Top Trader"

# Or bulk import (edit prisma/seed-real-traders.ts first)
ts-node prisma/seed-real-traders.ts`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">3. Start WebSocket Listener</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Listen for real Polymarket trades:
                </p>
                <pre className="bg-muted p-3 rounded text-sm">
                  ts-node scripts/websocket-listener.ts
                </pre>
                <p className="text-xs text-muted-foreground mt-2">
                  This will connect to Polymarket&apos;s real-time feed and process trades from followed traders.
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">4. Follow Traders</h4>
                <ol className="text-sm text-muted-foreground space-y-1 ml-4 list-decimal">
                  <li>Go to the Traders page</li>
                  <li>Click &quot;Follow Trader&quot; on a trader you added</li>
                  <li>Configure copy settings (position size, limits)</li>
                  <li>Save settings</li>
                </ol>
              </div>

              <div>
                <h4 className="font-medium mb-2">5. Test with Simulator (Optional)</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Or manually simulate a trade using the form above or curl:
                </p>
                <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`curl -X POST http://localhost:3000/api/simulate/trade \\
  -H "Content-Type: application/json" \\
  -d '{
    "traderAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "market": "will-btc-reach-100k",
    "outcome": "YES",
    "side": "BUY",
    "price": 0.65,
    "size": 100
  }'`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">6. Monitor Results</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Dashboard shows trader performance, trades, positions, PnL</li>
                  <li>Activity logs show all copy trading events</li>
                  <li>WebSocket listener terminal shows detailed logs</li>
                  <li>Run <code className="bg-muted px-1">npm run db:studio</code> to view database</li>
                </ul>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Environment Variables</h4>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`# Optional configuration in .env
WEBSOCKET_LOG_LEVEL=debug           # debug|info|warn|error
ORCHESTRATOR_LOG_LEVEL=info         # debug|info|warn|error
MOCK_TRADE_SUCCESS_RATE=0.98        # 0.0-1.0 (98% success)`}
                </pre>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Sample Trader Addresses (From Seed)</h4>
                <ul className="text-xs font-mono space-y-1">
                  <li>Crypto Whale: 0x1234567890123456789012345678901234567890</li>
                  <li>Market Maverick: 0x2345678901234567890123456789012345678901</li>
                  <li>Prediction Pro: 0x3456789012345678901234567890123456789012</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Note: These are mock addresses for testing. Use scripts/add-traders.ts to add real Polymarket traders.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
