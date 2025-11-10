'use client'

import { Button } from '@/components/ui/button'
import { ArrowRight, Shield, Users, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />

      <div className="container relative mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              Maximize your Polymarket earnings.{' '}
              <span className="text-primary">Copy proven winners automatically.</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Tap into Polymarket's $9B+ trading volume by following elite traders who consistently win.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="text-lg h-14 px-8">
              <Link href="/dashboard">
                Start copying traders
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-lg h-14 px-8">
              <Link href="#how-it-works">
                How it works
              </Link>
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap gap-6 pt-4 justify-center">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-bold text-lg">Automated</div>
                <div className="text-sm text-muted-foreground">Copy trading</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-bold text-lg">Secure</div>
                <div className="text-sm text-muted-foreground">Smart contracts</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-bold text-lg">Real-time</div>
                <div className="text-sm text-muted-foreground">Execution</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
