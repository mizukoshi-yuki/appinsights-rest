// Helper functions for Application Insights integration

import { AppInsightsLogger } from './core/client'
import type { AppInsightsConfig } from './core/types'
import { createRequestId, createDependencyId } from './core/utils'

/**
 * Global Application Insights logger instance
 */
let globalLogger: AppInsightsLogger | null = null

/**
 * Initialize the global Application Insights logger
 *
 * @example
 * ```typescript
 * // In server/plugins/appinsights.ts
 * export default defineNitroPlugin(() => {
 *   const config = useRuntimeConfig()
 *   initializeAppInsights(config.appInsights.connectionString, {
 *     role: 'my-app',
 *     appVersion: '1.0.0'
 *   })
 * })
 * ```
 */
export function initializeAppInsights(
  connectionString: string,
  options?: Partial<Omit<AppInsightsConfig, 'connectionString'>>
): AppInsightsLogger {
  if (globalLogger) {
    console.warn('[AppInsights] Logger already initialized')
    return globalLogger
  }

  globalLogger = new AppInsightsLogger({
    connectionString,
    role: options?.role,
    appVersion: options?.appVersion,
    batchSize: options?.batchSize,
    flushIntervalMs: options?.flushIntervalMs,
  })

  return globalLogger
}

/**
 * Get the global Application Insights logger instance
 * Returns null if not initialized
 */
export function getAppInsights(): AppInsightsLogger | null {
  return globalLogger
}

/**
 * Dispose the global Application Insights logger
 * Should be called on server shutdown
 */
export async function disposeAppInsights(): Promise<void> {
  if (globalLogger) {
    await globalLogger.dispose()
    globalLogger = null
  }
}

/**
 * Track a dependency (external API call, database query, etc.)
 * Automatically handles timing, error tracking, and correlation
 *
 * @example
 * ```typescript
 * export default defineEventHandler(async (event) => {
 *   return await trackDependency(
 *     event,
 *     'GET users API',
 *     'api.example.com',
 *     'HTTP',
 *     async () => {
 *       return await $fetch('https://api.example.com/users')
 *     }
 *   )
 * })
 * ```
 */
export async function trackDependency<T>(
  event: any,
  name: string,
  target: string,
  type: 'HTTP' | 'SQL' | 'Azure' | 'Other',
  fn: () => Promise<T>
): Promise<T> {
  const logger = getAppInsights()
  if (!logger) {
    return await fn()
  }

  const startTime = Date.now()
  const correlationId = event.context?.appInsights?.requestId
  const dependencyId = createDependencyId(correlationId)

  let success = true
  let resultCode = 200
  let error: Error | null = null

  try {
    const result = await fn()
    return result
  } catch (err) {
    success = false
    error = err instanceof Error ? err : new Error(String(err))

    // Extract status code from common error formats
    const e = err as { statusCode?: number; response?: { status?: number } }
    resultCode = e?.statusCode || e?.response?.status || 500

    throw err
  } finally {
    const duration = Date.now() - startTime

    logger.trackDependency({
      id: dependencyId,
      parentId: correlationId,
      name,
      data: target,
      type,
      target,
      duration,
      resultCode,
      success,
      properties: {
        correlationId,
        error: error?.message,
      },
    })
  }
}

/**
 * Track a custom event
 *
 * @example
 * ```typescript
 * trackEvent(event, 'user_signup', { plan: 'premium' })
 * ```
 */
export function trackEvent(
  event: any,
  eventName: string,
  properties?: Record<string, unknown>
): void {
  const logger = getAppInsights()
  if (!logger) return

  const correlationId = event.context?.appInsights?.requestId

  logger.trackEvent(eventName, {
    ...properties,
    correlationId,
  })
}

/**
 * Track a metric
 *
 * @example
 * ```typescript
 * trackMetric(event, 'processing_time', 1234)
 * ```
 */
export function trackMetric(
  event: any,
  metricName: string,
  value: number,
  properties?: Record<string, unknown>
): void {
  const logger = getAppInsights()
  if (!logger) return

  const correlationId = event.context?.appInsights?.requestId

  logger.trackMetric(metricName, value, {
    ...properties,
    correlationId,
  })
}

/**
 * Track an exception
 *
 * @example
 * ```typescript
 * try {
 *   // ...
 * } catch (error) {
 *   trackException(event, error)
 *   throw error
 * }
 * ```
 */
export function trackException(
  event: any,
  error: Error,
  properties?: Record<string, unknown>
): void {
  const logger = getAppInsights()
  if (!logger) return

  const correlationId = event.context?.appInsights?.requestId

  logger.trackException(error, {
    ...properties,
    correlationId,
  })
}

/**
 * Wrap a handler function with automatic error tracking
 *
 * @example
 * ```typescript
 * export default defineEventHandler(async (event) => {
 *   return await withErrorTracking(event, async () => {
 *     // Your handler logic here
 *     return { success: true }
 *   })
 * })
 * ```
 */
export async function withErrorTracking<T>(
  event: any,
  handler: () => Promise<T>
): Promise<T> {
  try {
    return await handler()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    trackException(event, err, {
      path: event.path,
      method: event.method,
    })
    throw error
  }
}
