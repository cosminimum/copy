import { NextRequest, NextResponse } from 'next/server'
import { healthCheckService } from '@/lib/services/health-check'

/**
 * GET /api/health
 *
 * System health check endpoint
 * Returns current system health status
 */
export async function GET(req: NextRequest) {
  try {
    // Perform fresh health check
    const result = await healthCheckService.performHealthCheck()

    // Return appropriate HTTP status code
    const statusCode = result.healthy ? 200 : 503 // Service Unavailable if unhealthy

    return NextResponse.json(
      {
        status: result.healthy ? 'healthy' : 'unhealthy',
        timestamp: result.timestamp,
        checks: result.checks,
      },
      { status: statusCode }
    )
  } catch (error: any) {
    console.error('GET /api/health error:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: error.message,
        timestamp: new Date(),
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/health
 *
 * Control health check service
 * Body: { action: 'start' | 'stop' | 'status' }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'start':
        healthCheckService.start()
        return NextResponse.json({ success: true, message: 'Health check service started' })

      case 'stop':
        healthCheckService.stop()
        return NextResponse.json({ success: true, message: 'Health check service stopped' })

      case 'status':
        const status = healthCheckService.getStatus()
        return NextResponse.json({ success: true, status })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('POST /api/health error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
