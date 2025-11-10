import { Button } from '@/components/ui/button'
import { Search, Wallet, Play } from 'lucide-react'
import Link from 'next/link'

const steps = [
  {
    number: '01',
    icon: Search,
    title: 'Browse elite traders',
    description: 'View Polymarket\'s top performers with verified win rates and profit history. Filter by strategy and risk level.',
  },
  {
    number: '02',
    icon: Wallet,
    title: 'Set your budget',
    description: 'Start with any amount. Choose one or multiple traders to follow. Our platform handles position sizing automatically.',
  },
  {
    number: '03',
    icon: Play,
    title: 'Auto-copy trades',
    description: 'When they trade, you trade. Real-time execution ensures you never miss a move. Stop or adjust anytime.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 md:py-24 bg-accent/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Start copying in 3 simple steps
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            No trading experience required. Set up in 2 minutes and let the experts work for you.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Connection line */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-16 left-[60%] w-full h-[2px] bg-primary/20" />
              )}

              <div className="relative bg-card rounded-2xl p-8 border-2 border-border hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20">
                    <step.icon className="w-8 h-8 text-primary" />
                  </div>
                  <span className="text-4xl font-bold text-primary/20">{step.number}</span>
                </div>
                <h3 className="font-bold text-xl mb-3">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Button asChild size="lg" className="text-lg h-14 px-8">
            <Link href="/dashboard">
              Start copying traders →
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
