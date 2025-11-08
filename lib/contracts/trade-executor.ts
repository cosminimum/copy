import { CalculatedTrade } from '../trading/position-calculator'

export interface ExecutionResult {
  success: boolean
  transactionHash?: string
  error?: string
  executedAt: Date
  gasFee?: number
}

export class TradeExecutor {
  private mockDelayMin = 500 // ms
  private mockDelayMax = 2000 // ms
  private mockSuccessRate = parseFloat(process.env.MOCK_TRADE_SUCCESS_RATE || '0.98')

  private errorMessages = [
    'Insufficient balance',
    'Slippage tolerance exceeded',
    'Market temporarily unavailable',
    'Gas price too high',
    'Transaction timeout',
    'Network congestion',
  ]

  async executeTrade(
    trade: CalculatedTrade,
    userWalletAddress: string
  ): Promise<ExecutionResult> {
    // Simulate realistic network delay
    await this.simulateNetworkDelay()

    // Determine if trade should succeed
    const shouldSucceed = Math.random() < this.mockSuccessRate

    if (!shouldSucceed) {
      const randomError = this.errorMessages[Math.floor(Math.random() * this.errorMessages.length)]
      console.log(`[TradeExecutor] ❌ Simulated failure: ${randomError}`)
      return {
        success: false,
        error: randomError,
        executedAt: new Date(),
      }
    }

    // Generate realistic mock data
    const mockTxHash = this.generateMockTransactionHash()
    const mockGasFee = this.calculateMockGasFee(trade.value)

    console.log(`[TradeExecutor] ✅ Simulated trade execution:`, {
      wallet: userWalletAddress.slice(0, 10) + '...',
      market: trade.market?.slice(0, 40) + '...' || 'Unknown',
      side: trade.side,
      size: trade.size,
      price: `$${trade.price.toFixed(4)}`,
      value: `$${trade.value.toFixed(2)}`,
      txHash: mockTxHash.slice(0, 10) + '...',
      gasFee: `$${mockGasFee.toFixed(4)}`,
    })

    return {
      success: true,
      transactionHash: mockTxHash,
      executedAt: new Date(),
      gasFee: mockGasFee,
    }
  }

  async estimateGas(trade: CalculatedTrade): Promise<number> {
    await this.simulateNetworkDelay()
    return this.calculateMockGasFee(trade.value)
  }

  private simulateNetworkDelay(): Promise<void> {
    // Random delay between min and max
    const delay = Math.random() * (this.mockDelayMax - this.mockDelayMin) + this.mockDelayMin
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  private generateMockTransactionHash(): string {
    // Generate realistic Polygon transaction hash
    return '0x' + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
  }

  private calculateMockGasFee(tradeValue: number): number {
    // Gas fee scales slightly with trade value
    // Typical Polygon gas fees: $0.001 - $0.05
    const baseFee = 0.001
    const variableFee = (tradeValue / 10000) * 0.01 // 0.01% of trade value
    return baseFee + variableFee + (Math.random() * 0.01)
  }

  setMockDelayRange(min: number, max: number): void {
    this.mockDelayMin = Math.max(0, min)
    this.mockDelayMax = Math.max(this.mockDelayMin, max)
  }

  setMockSuccessRate(rate: number): void {
    this.mockSuccessRate = Math.max(0, Math.min(1, rate))
  }

  getMockSuccessRate(): number {
    return this.mockSuccessRate
  }

  addErrorMessage(message: string): void {
    if (!this.errorMessages.includes(message)) {
      this.errorMessages.push(message)
    }
  }
}

export const tradeExecutor = new TradeExecutor()
