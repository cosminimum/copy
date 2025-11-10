import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

export function FinalCTA() {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent" />

      <div className="container relative mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold">
            Start maximizing your Polymarket earnings
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground">
            Connect your wallet. Follow elite traders. Let automation do the work.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button asChild size="lg" className="text-lg h-16 px-10">
              <Link href="/dashboard">
                Connect wallet & start
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground pt-4">
            No sign-up. No credit card. Just connect your wallet and browse traders.
          </p>

          {/* Social proof numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-12 border-t max-w-3xl mx-auto">
            <div>
              <div className="text-3xl font-bold text-primary">Instant</div>
              <div className="text-sm text-muted-foreground mt-1">Setup time</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">$9B+</div>
              <div className="text-sm text-muted-foreground mt-1">Polymarket volume</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">Elite</div>
              <div className="text-sm text-muted-foreground mt-1">Traders to copy</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">24/7</div>
              <div className="text-sm text-muted-foreground mt-1">Automated</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
