import { AlertTriangle } from 'lucide-react'

export function RiskDisclosure() {
  return (
    <section className="py-12 bg-destructive/5 border-y border-destructive/20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-1" />
            <div className="space-y-3">
              <h3 className="font-bold text-lg">Risk warning</h3>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong>Trading involves substantial risk of loss.</strong> Copy trading automatically executes trades based on another trader's decisions. You remain responsible for all trading activity in your wallet. Past performance does not guarantee future results.
                </p>
                <p>
                  This is a new platform in beta. While we strive for reliability, bugs may exist. Most prediction market traders lose money. Never invest more than you can afford to lose. Always diversify across multiple traders and regularly monitor your positions.
                </p>
                <p>
                  This platform connects to Polymarket and is intended for users who understand prediction market risks. Market risk, liquidity risk, and smart contract risk apply. We do not provide financial advice. Check your local laws before using this service.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
