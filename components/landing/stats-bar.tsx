export function StatsBar() {
  const stats = [
    { value: '$9B+', label: 'Polymarket annual volume' },
    { value: '477K+', label: 'Active Polymarket traders' },
    { value: '24/7', label: 'Automated copy trading' },
    { value: 'Elite', label: 'Traders to follow' },
  ]

  return (
    <section className="py-12 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="text-center mb-6">
          <p className="text-sm opacity-90">Tap into the Polymarket ecosystem</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat, index) => (
            <div key={index}>
              <div className="text-3xl md:text-4xl font-bold mb-2">{stat.value}</div>
              <div className="text-sm opacity-90">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
