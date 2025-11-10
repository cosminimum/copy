import { Check, X } from 'lucide-react'

const features = [
  {
    feature: 'Setup Time',
    copyTrading: '2 minutes',
    sportsbook: 'Per bet',
    manual: 'Hours learning',
  },
  {
    feature: 'Experience Needed',
    copyTrading: 'None',
    sportsbook: 'Basic',
    manual: 'Expert level',
  },
  {
    feature: 'Execution',
    copyTrading: 'Automated 24/7',
    sportsbook: 'Manual per bet',
    manual: 'Manual per trade',
  },
  {
    feature: 'Control',
    copyTrading: 'Stop anytime',
    sportsbook: 'Locked in',
    manual: 'Full control',
  },
  {
    feature: 'Following Winners',
    copyTrading: 'Yes',
    sportsbook: 'No',
    manual: 'No',
  },
  {
    feature: 'Risk Management',
    copyTrading: 'Automated',
    sportsbook: 'Manual',
    manual: 'Manual',
  },
]

export function ComparisonTable() {
  return (
    <section className="py-16 md:py-24 bg-accent/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why choose automated copy trading?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Let our platform do the work while you benefit from Polymarket's top traders
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-left p-4 font-semibold">Feature</th>
                  <th className="p-4 text-center">
                    <div className="font-bold text-lg">
                      Polymarket copy trading
                    </div>
                    <div className="text-xs text-primary font-normal mt-1">RECOMMENDED</div>
                  </th>
                  <th className="p-4 text-center font-semibold">Traditional sportsbook</th>
                  <th className="p-4 text-center font-semibold">Manual trading</th>
                </tr>
              </thead>
              <tbody>
                {features.map((item, index) => (
                  <tr key={index} className="border-b border-border hover:bg-accent/50">
                    <td className="p-4 font-medium">{item.feature}</td>
                    <td className="p-4 text-center bg-primary/5">
                      <span className="font-semibold text-primary">{item.copyTrading}</span>
                    </td>
                    <td className="p-4 text-center text-muted-foreground">
                      {item.sportsbook}
                    </td>
                    <td className="p-4 text-center text-muted-foreground">
                      {item.manual}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 grid md:grid-cols-3 gap-4 text-center">
            <div className="p-6 rounded-xl bg-primary/5 border-2 border-primary">
              <div className="text-4xl font-bold text-primary mb-2">Instant</div>
              <div className="text-sm text-muted-foreground">Trade execution</div>
            </div>
            <div className="p-6 rounded-xl bg-card border">
              <div className="text-4xl font-bold text-primary mb-2">24/7</div>
              <div className="text-sm text-muted-foreground">Automated monitoring</div>
            </div>
            <div className="p-6 rounded-xl bg-card border">
              <div className="text-4xl font-bold text-primary mb-2">Elite</div>
              <div className="text-sm text-muted-foreground">Traders on Polymarket</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
