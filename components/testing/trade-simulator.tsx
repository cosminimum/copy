'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function TradeSimulator() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>('')

  const [traderAddress, setTraderAddress] = useState('0x1234567890123456789012345678901234567890')
  const [market, setMarket] = useState('will-btc-reach-100k')
  const [outcome, setOutcome] = useState('YES')
  const [side, setSide] = useState('BUY')
  const [price, setPrice] = useState('0.65')
  const [size, setSize] = useState('100')

  const simulateTrade = async () => {
    setLoading(true)
    setResult('')

    try {
      const response = await fetch('/api/simulate/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traderAddress,
          market,
          outcome,
          side,
          price: parseFloat(price),
          size: parseFloat(size),
        }),
      })

      const data = await response.json()

      if (data.success) {
        setResult('✓ Trade simulated successfully! Check your dashboard and console logs.')
      } else {
        setResult(`✗ Error: ${data.error}`)
      }
    } catch (error) {
      setResult(`✗ Failed to simulate trade: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const quickScenarios = [
    {
      name: 'Buy BTC 100k',
      data: {
        market: 'will-btc-reach-100k',
        outcome: 'YES',
        side: 'BUY',
        price: '0.65',
        size: '100',
      },
    },
    {
      name: 'Sell BTC 100k',
      data: {
        market: 'will-btc-reach-100k',
        outcome: 'YES',
        side: 'SELL',
        price: '0.70',
        size: '50',
      },
    },
    {
      name: 'Buy ETH Price',
      data: {
        market: 'eth-price-prediction',
        outcome: 'NO',
        side: 'BUY',
        price: '0.45',
        size: '200',
      },
    },
  ]

  return (
    <Card className="border-dashed border-2 border-yellow-500/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🧪 Trade Simulator
          <span className="text-xs font-normal text-yellow-600 bg-yellow-100 px-2 py-1 rounded">
            Testing Only
          </span>
        </CardTitle>
        <CardDescription>
          Simulate incoming trades from followed traders to test the copy trading flow
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="trader">Trader Address</Label>
            <Input
              id="trader"
              value={traderAddress}
              onChange={(e) => setTraderAddress(e.target.value)}
              placeholder="0x..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="market">Market Slug</Label>
            <Input
              id="market"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              placeholder="market-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outcome">Outcome</Label>
            <select
              id="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="side">Side</Label>
            <select
              id="side"
              value={side}
              onChange={(e) => setSide(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="size">Size</Label>
            <Input
              id="size"
              type="number"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="100"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={simulateTrade} disabled={loading} className="flex-1">
            {loading ? 'Simulating...' : 'Simulate Trade'}
          </Button>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">Quick Scenarios:</p>
          <div className="flex flex-wrap gap-2">
            {quickScenarios.map((scenario) => (
              <Button
                key={scenario.name}
                variant="outline"
                size="sm"
                onClick={() => {
                  setMarket(scenario.data.market)
                  setOutcome(scenario.data.outcome)
                  setSide(scenario.data.side)
                  setPrice(scenario.data.price)
                  setSize(scenario.data.size)
                }}
              >
                {scenario.name}
              </Button>
            ))}
          </div>
        </div>

        {result && (
          <div
            className={`p-3 rounded-md text-sm ${
              result.startsWith('✓')
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {result}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">Sample Trader Addresses:</p>
          <ul className="space-y-1 font-mono">
            <li>• 0x1234...7890 (Crypto Whale)</li>
            <li>• 0x2345...8901 (Market Maverick)</li>
            <li>• 0x3456...9012 (Prediction Pro)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
