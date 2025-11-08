# Polymarket Copy Trader

An automated copy trading platform for Polymarket that allows users to automatically replicate trades from top performing traders.

## Features

- **Real-Time Trade Copying**: Automatically execute trades based on followed traders' activity
- **Wallet Authentication**: Secure wallet-based authentication using MetaMask or WalletConnect
- **Position Sizing**: Flexible position sizing strategies (percentage, proportional, fixed)
- **Multi-Trader Support**: Follow multiple traders with individual or global settings
- **Risk Management**: Configurable position limits, minimum trade sizes, and filters
- **Portfolio Tracking**: Real-time monitoring of positions, P&L, and performance
- **Email Notifications**: Trade alerts and daily summaries via SendGrid
- **Activity Logging**: Comprehensive audit trail of all trading activity

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Authentication**: NextAuth.js with wallet signature verification
- **Blockchain**: wagmi, viem for Polygon network interactions
- **Database**: PostgreSQL with Prisma ORM
- **Real-Time Data**: Polymarket Real-Time Data Client (WebSocket)
- **Email**: SendGrid
- **Deployment**: Vercel-ready

## Getting Started

### Quick Start (5 minutes)

See **[QUICKSTART.md](./QUICKSTART.md)** for the fastest way to get up and running!

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- WalletConnect Project ID
- SendGrid API Key (optional, for email notifications)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd copy-trader
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: Get from WalletConnect Cloud
- `SENDGRID_API_KEY`: Get from SendGrid dashboard (optional)
- Other settings as needed

4. Set up the database:
```bash
npm run db:push
npm run db:seed  # Add sample traders for testing
```

5. Start the development server:
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Testing

See **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** for comprehensive end-to-end testing instructions.

### Quick Test

1. Connect your wallet
2. Go to Dashboard
3. Use the Trade Simulator panel to simulate incoming trades
4. Watch the orchestration flow in console logs
5. Check results in Dashboard and database

## Project Structure

```
copy-trader/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard page
│   ├── traders/           # Trader discovery
│   └── settings/          # Settings page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── layout/           # Layout components
│   └── wallet/           # Wallet components
├── lib/                   # Core libraries
│   ├── auth/             # Authentication
│   ├── contracts/        # Smart contract interactions
│   ├── db/               # Database utilities
│   ├── notifications/    # Email service
│   ├── orchestration/    # Trade orchestration
│   ├── polymarket/       # Polymarket WebSocket client
│   ├── trading/          # Trading logic
│   └── wagmi/            # Wagmi configuration
├── prisma/               # Database schema
└── types/                # TypeScript types
```

## How It Works

### Trade Orchestration Flow

1. **WebSocket Connection**: The app connects to Polymarket's real-time data stream
2. **Trade Detection**: When a followed trader executes a trade, the event is captured
3. **Position Calculation**: The position sizing calculator determines the appropriate trade size
4. **Validation**: The trade is validated against user's risk parameters
5. **Execution**: The trade is executed via smart contract (mocked in development)
6. **Recording**: Trade data is saved to database and position is updated
7. **Notification**: User receives email notification about the executed trade

### Position Sizing Strategies

- **Percentage**: Trade with X% of your portfolio balance
- **Proportional**: Match the trader's position size with a multiplier
- **Fixed**: Use a fixed dollar amount for each trade

### Current Status

This is a development version with mocked smart contract execution. The WebSocket integration, database schema, authentication, and UI are fully functional.

**Mock Features**:
- Smart contract execution (dry run mode)
- Trade execution uses simulated transactions
- Portfolio balances are simulated

**Production Ready**:
- Database schema and migrations
- Authentication and wallet connection
- WebSocket integration with Polymarket
- Email notifications
- UI components and pages

## Database Setup

The project uses PostgreSQL. Make sure to:

1. Create a PostgreSQL database
2. Update `DATABASE_URL` in `.env`
3. Run migrations: `npm run db:push`
4. (Optional) Open Prisma Studio: `npm run db:studio`

## API Routes

- `/api/auth/[...nextauth]` - NextAuth authentication endpoints

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_URL` - Application URL
- `NEXTAUTH_SECRET` - Secret for JWT signing
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - WalletConnect project ID
- `SENDGRID_API_KEY` - SendGrid API key for emails
- `ENABLE_REAL_TRADING` - Enable/disable real trading (set to "false" for development)

## Development

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

## Deployment

The app is optimized for deployment on Vercel:

1. Push your code to GitHub
2. Import the project in Vercel
3. Configure environment variables
4. Deploy

Make sure your PostgreSQL database is accessible from Vercel.

## Security Considerations

- Never commit `.env` file
- Use strong `NEXTAUTH_SECRET`
- Keep API keys secure
- Validate all user inputs
- Use prepared statements (Prisma handles this)
- Enable CORS only for trusted domains in production

## Future Enhancements

- Real smart contract integration
- Advanced analytics and charting
- Stop-loss and take-profit automation
- Multi-chain support
- Mobile app
- Social features (trader profiles, leaderboards)
- Backtesting functionality

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
