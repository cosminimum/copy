import { Navbar } from '@/components/layout/navbar'
import { DashboardContent } from '@/components/dashboard/dashboard-content'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DashboardContent />
    </div>
  )
}
