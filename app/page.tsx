import { Navbar } from '@/components/layout/navbar'
import { HeroSection } from '@/components/landing/hero-section'
import { BenefitsGrid } from '@/components/landing/benefits-grid'
import { HowItWorks } from '@/components/landing/how-it-works'
import { SocialProof } from '@/components/landing/social-proof'
import { ComparisonTable } from '@/components/landing/comparison-table'
import { TrustSection } from '@/components/landing/trust-section'
import { StatsBar } from '@/components/landing/stats-bar'
import { FAQSection } from '@/components/landing/faq-section'
import { RiskDisclosure } from '@/components/landing/risk-disclosure'
import { FinalCTA } from '@/components/landing/final-cta'

export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <BenefitsGrid />
      <HowItWorks />
      <SocialProof />
      <ComparisonTable />
      <TrustSection />
      <StatsBar />
      <FAQSection />
      <RiskDisclosure />
      <FinalCTA />
    </div>
  )
}
