import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { realtimePriceService } from '@/lib/services/realtime-price-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Create a readable stream for Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        // Send initial connection message
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        }

        sendEvent('connected', { message: 'Connected to price stream' })

        // Send all cached prices on connection
        const cachedPrices = realtimePriceService.getAllCachedPrices()
        if (cachedPrices.size > 0) {
          sendEvent('initial-prices', {
            prices: Array.from(cachedPrices.values()),
          })
        }

        // Listen for price updates
        const handlePriceUpdate = (priceUpdate: any) => {
          try {
            sendEvent('price-update', priceUpdate)
          } catch (error) {
            console.error('[SSE] Error sending price update:', error)
          }
        }

        realtimePriceService.on('price-update', handlePriceUpdate)

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
          try {
            sendEvent('heartbeat', { timestamp: Date.now() })
          } catch (error) {
            console.error('[SSE] Error sending heartbeat:', error)
            clearInterval(heartbeatInterval)
          }
        }, 30000)

        // Cleanup on client disconnect
        request.signal.addEventListener('abort', () => {
          realtimePriceService.off('price-update', handlePriceUpdate)
          clearInterval(heartbeatInterval)
          controller.close()
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    })
  } catch (error) {
    console.error('[SSE] Error setting up price stream:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
