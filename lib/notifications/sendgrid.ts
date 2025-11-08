import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '')

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@copytrader.local'

export interface EmailData {
  to: string
  subject: string
  html: string
  text?: string
}

export class EmailService {
  async sendEmail(data: EmailData): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn('SendGrid API key not configured, skipping email')
      return false
    }

    try {
      await sgMail.send({
        to: data.to,
        from: FROM_EMAIL,
        subject: data.subject,
        html: data.html,
        text: data.text || data.html.replace(/<[^>]*>/g, ''),
      })

      return true
    } catch (error) {
      console.error('Error sending email:', error)
      return false
    }
  }

  async sendTradeAlert(
    email: string,
    trade: {
      market: string
      side: string
      size: number
      price: number
      value: number
    }
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Trade Executed</h2>
        <p>A copy trade has been executed on your account:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Market:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${trade.market}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Action:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${trade.side}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Size:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${trade.size}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Price:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">$${trade.price.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Value:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">$${trade.value.toFixed(2)}</td>
          </tr>
        </table>
        <p style="color: #666; font-size: 12px;">You're receiving this email because you have trade notifications enabled.</p>
      </div>
    `

    return this.sendEmail({
      to: email,
      subject: `Trade Alert: ${trade.side} ${trade.size} in ${trade.market}`,
      html,
    })
  }

  async sendDailySummary(
    email: string,
    summary: {
      totalTrades: number
      totalVolume: number
      pnl: number
      winRate: number
    }
  ): Promise<boolean> {
    const pnlColor = summary.pnl >= 0 ? '#10b981' : '#ef4444'
    const pnlSign = summary.pnl >= 0 ? '+' : ''

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Daily Trading Summary</h2>
        <p>Here's your trading activity for today:</p>
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="margin-bottom: 15px;">
            <div style="color: #666; font-size: 14px;">Total Trades</div>
            <div style="font-size: 24px; font-weight: bold; color: #333;">${summary.totalTrades}</div>
          </div>
          <div style="margin-bottom: 15px;">
            <div style="color: #666; font-size: 14px;">Total Volume</div>
            <div style="font-size: 24px; font-weight: bold; color: #333;">$${summary.totalVolume.toFixed(2)}</div>
          </div>
          <div style="margin-bottom: 15px;">
            <div style="color: #666; font-size: 14px;">P&L</div>
            <div style="font-size: 24px; font-weight: bold; color: ${pnlColor};">${pnlSign}$${summary.pnl.toFixed(2)}</div>
          </div>
          <div>
            <div style="color: #666; font-size: 14px;">Win Rate</div>
            <div style="font-size: 24px; font-weight: bold; color: #333;">${(summary.winRate * 100).toFixed(1)}%</div>
          </div>
        </div>
        <p style="color: #666; font-size: 12px;">You're receiving this daily summary because you have notifications enabled.</p>
      </div>
    `

    return this.sendEmail({
      to: email,
      subject: `Daily Summary: ${summary.totalTrades} trades, ${pnlSign}$${summary.pnl.toFixed(2)} P&L`,
      html,
    })
  }
}

export const emailService = new EmailService()
