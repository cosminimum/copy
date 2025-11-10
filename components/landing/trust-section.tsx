import { Shield, Building2, Lock, Activity } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const trustPoints = [
  {
    icon: Shield,
    title: 'Secure smart contracts',
    description: 'Built on audited blockchain infrastructure. Your wallet, your keys. We never hold your funds.',
  },
  {
    icon: Activity,
    title: 'Real-time sync',
    description: 'Trades execute instantly when top traders make moves on Polymarket. Never miss an opportunity.',
  },
  {
    icon: Lock,
    title: 'Privacy focused',
    description: 'Connect with your wallet. No KYC required. Your trading activity stays private and secure.',
  },
  {
    icon: Building2,
    title: 'Polymarket integration',
    description: 'Direct integration with Polymarket\'s $9B+ ecosystem gives you access to deep liquidity and elite traders.',
  },
]

export function TrustSection() {
  return (
    <section className="py-16 md:py-24 bg-accent/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Built for security and simplicity
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Connect your wallet, follow elite traders, and start earning on Polymarket
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {trustPoints.map((point, index) => (
            <Card key={index} className="border-2">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                    <point.icon className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{point.title}</h3>
                    <p className="text-muted-foreground text-sm">{point.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Additional trust badges */}
        <div className="flex flex-wrap justify-center items-center gap-8 pt-8 border-t">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="text-sm font-semibold">Non-custodial</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-6 h-6 text-primary" />
            <span className="text-sm font-semibold">Open source</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            <span className="text-sm font-semibold">Polymarket verified</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span className="text-sm font-semibold">Real-time data</span>
          </div>
        </div>
      </div>
    </section>
  )
}
