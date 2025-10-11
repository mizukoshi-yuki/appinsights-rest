// Request tracking middleware for Nuxt/H3

import { defineEventHandler, getRequestURL } from 'h3'
import { getOrCreateCorrelationId } from './correlation'
import { getAppInsights } from './plugin'
import { createRequestId } from '../../core/utils'

// Request ID保存用のシンボルキー（外部からはgetRequestId()で参照）
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

    // Request Id を開始時に採番して保存（依存関係が parentId として直ちに参照可能）
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
 * 現在のリクエストのRequest IDを取得
 * 依存関係トラッキング時にparentIdとして使用可能
 */
export function getRequestId(event: any): string | undefined {
  return (event.context as any)?.[REQUEST_ID_KEY]
}
