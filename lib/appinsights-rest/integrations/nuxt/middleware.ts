// Request tracking middleware for Nuxt/H3

import { defineEventHandler, getRequestURL } from 'h3'
import { getOrCreateCorrelationId } from './correlation'
import { getAppInsights } from './plugin'
import { createRequestId } from '../../core/utils'

// Symbol key for storing request ID (accessible via getRequestId())
const REQUEST_ID_KEY = Symbol('requestId')

/**
 * Create request tracking middleware
 */
export function createRequestTrackingMiddleware() {
  return defineEventHandler(async (event) => {
    const startTime = Date.now()
    const cid = getOrCreateCorrelationId(event)
    const method = event.method
    const url = getRequestURL(event).href

    // Generate and store request ID at the start (available as parentId for dependencies)
    const reqId = createRequestId(cid)
    ;(event.context as any)[REQUEST_ID_KEY] = reqId

    console.log(`[${cid}] ${method} ${event.path} - Request started`)

    event.node.res.on('finish', async () => {
      const duration = Date.now() - startTime
      const statusCode = event.node.res.statusCode

      const logger = getAppInsights()
      if (logger) {
        await logger.trackRequest({
          id: reqId,
          name: `${method} ${event.path}`,
          url,
          duration,
          responseCode: statusCode,
          success: statusCode < 400,
          properties: {
            correlationId: cid,
            method,
            userAgent: event.node.req.headers['user-agent'] || 'unknown'
          }
        })

        console.log(`[${cid}] ${method} ${event.path} - ${statusCode} (${duration}ms)`)
      }
    })
  })
}

/**
 * Get the current request's Request ID
 * Can be used as parentId when tracking dependencies
 */
export function getRequestId(event: any): string | undefined {
  return (event.context as any)?.[REQUEST_ID_KEY]
}
