import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Navbar } from '@/components/layout/navbar'
import { auth } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your copy trading preferences</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Copy Trading Settings</CardTitle>
              <CardDescription>
                Configure position sizing per trader when you follow them
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  Each trader you follow has individual settings:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Position size multiplier (proportional to trader's size)</li>
                  <li>Maximum position size limit</li>
                  <li>Minimum trade size threshold</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  Configure these settings when you follow a trader on the <strong>Traders</strong> page.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose how you want to be notified about trading activity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  defaultValue={user?.email || ''}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="trade-alerts"
                  defaultChecked
                  className="w-4 h-4"
                />
                <Label htmlFor="trade-alerts" className="cursor-pointer">
                  Trade execution alerts
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="daily-summary"
                  defaultChecked
                  className="w-4 h-4"
                />
                <Label htmlFor="daily-summary" className="cursor-pointer">
                  Daily summary emails
                </Label>
              </div>

              <Button>Save Notification Settings</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your connected wallet and account details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Wallet Address</Label>
                <div className="text-sm font-mono bg-muted px-3 py-2 rounded">
                  {user?.walletAddress}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Portfolio Balance</Label>
                <div className="text-2xl font-bold">$10,000.00</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
