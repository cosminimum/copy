import { TrendingUp, Target, DollarSign, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const benefits = [
  {
    icon: TrendingUp,
    title: 'Follow proven winners',
    description: 'Our platform lets you automatically copy trades from Polymarket\'s most successful traders. No guesswork, just results.',
  },
  {
    icon: Target,
    title: 'Real-time execution',
    description: 'Trades are mirrored instantly when top performers act. Never miss an opportunity while manually tracking markets.',
  },
  {
    icon: DollarSign,
    title: 'Smart position sizing',
    description: 'Set your budget and risk limits. Our system automatically scales positions to match your capital while copying elite traders.',
  },
  {
    icon: Zap,
    title: 'Full control',
    description: 'Stop copying anytime. Adjust allocations. Close positions manually. You stay in control while automation does the work.',
  },
]

export function BenefitsGrid() {
  return (
    <section className="py-16 md:py-24 border-b">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why use our platform
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Connect to Polymarket's top traders and maximize your earnings with automated copy trading
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => (
            <Card key={index} className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="flex flex-col items-start space-y-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                    <benefit.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{benefit.title}</h3>
                    <p className="text-muted-foreground text-sm">{benefit.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
