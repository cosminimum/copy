'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
  {
    question: 'Do I need trading experience?',
    answer: 'No, copy trading is beginner-friendly. Our platform automatically mirrors the trades of successful Polymarket traders. However, understanding how prediction markets work will help you choose better traders to follow.',
  },
  {
    question: 'Can I lose money?',
    answer: 'Yes. Trading involves risk. When you copy a trader, your wallet executes the same trades. If they profit, you profit proportionally. If they lose, you lose. Most traders on prediction markets lose money. Always start small and only invest what you can afford to lose.',
  },
  {
    question: 'How much should I invest to start?',
    answer: 'Start with whatever amount you\'re comfortable risking. There\'s no minimum. We recommend starting small to test the platform and the traders you follow. You can always increase your allocation later.',
  },
  {
    question: 'Can I stop copying at any time?',
    answer: 'Yes. You retain full control. Stop or adjust copy trading whenever you want with one click. Your existing positions remain unless you manually close them. There are no lock-in periods or cancellation fees.',
  },
  {
    question: 'Is copy trading legal?',
    answer: 'Our platform is a tool that connects to Polymarket, which is a legal prediction market platform. However, prediction market laws vary by jurisdiction. It\'s your responsibility to ensure you\'re allowed to use Polymarket in your region before using our copy trading service.',
  },
  {
    question: 'Can I copy multiple traders?',
    answer: 'Yes. Diversifying across multiple traders is recommended for risk management. Most users follow 2-5 traders simultaneously to balance different strategies and market specialties.',
  },
  {
    question: 'What happens if the trader I\'m copying loses?',
    answer: 'Your account mirrors their losses proportionally to your allocation. This is why diversification, risk management, and choosing traders with consistent long-term records (12+ months) are crucial.',
  },
  {
    question: 'How are traders verified?',
    answer: 'All trader statistics are pulled directly from blockchain transactions on Polymarket. Win rates, profits, and volume are verified on-chain and cannot be manipulated. We only feature traders with minimum track records.',
  },
  {
    question: 'What are the fees?',
    answer: 'Currently, our platform is free to use during beta. You only pay Polymarket\'s standard trading fees (typically 2% on profits). We may introduce platform fees in the future, but will notify users in advance.',
  },
  {
    question: 'How does it compare to manual trading?',
    answer: 'Copy trading lets you benefit from successful traders\' strategies without constant monitoring. You save time and can follow multiple traders simultaneously. However, you\'re still subject to the same market risks. Past performance doesn\'t guarantee future results.',
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="py-16 md:py-24 border-b">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Frequently asked questions
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about copy trading on Polymarket
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
            >
              <button
                className="w-full flex items-center justify-between p-6 text-left bg-card hover:bg-accent/50 transition-colors"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span className="font-semibold text-lg pr-8">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform flex-shrink-0 ${
                    openIndex === index ? 'transform rotate-180' : ''
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-6 pb-6 text-muted-foreground">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
