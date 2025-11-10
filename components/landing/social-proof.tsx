export function SocialProof() {
  return (
    <section className="py-16 md:py-24 border-b">
      <div className="container mx-auto px-4">
        {/* Problem/Solution */}
        <div className="max-w-4xl mx-auto text-center mb-16">
          <div className="inline-block bg-destructive/10 text-destructive px-6 py-3 rounded-full font-semibold mb-6">
            ⚠️ Most traders lose money trying to time markets alone
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Maximize your earnings with our copy trading platform
          </h2>
          <p className="text-xl text-muted-foreground">
            Access Polymarket's massive liquidity and follow traders with proven track records
          </p>
        </div>

        {/* Platform stats bar */}
        <div className="bg-accent/50 rounded-xl p-8 border">
          <p className="text-center text-sm text-muted-foreground mb-6">Polymarket ecosystem stats</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-primary">$9B+</div>
              <div className="text-sm text-muted-foreground mt-1">Annual volume</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">477K+</div>
              <div className="text-sm text-muted-foreground mt-1">Active traders</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">24/7</div>
              <div className="text-sm text-muted-foreground mt-1">Market access</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">Elite</div>
              <div className="text-sm text-muted-foreground mt-1">Traders to copy</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
