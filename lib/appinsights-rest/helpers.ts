// Helper functions for Application Insights integration

import { AppInsightsLogger } from './core/client'
import type {
  AppInsightsConfig,
  DependencyType,
  Dict,
  SeverityLevel,
  TelemetryEventContext,
} from './core/types'
import { SeverityLevel as SeverityLevels } from './core/types'
import { createDependencyId } from './core/utils'

// Default HTTP status codes recorded on dependency outcomes when the wrapped
// call neither resolves with an HTTP-style result nor rejects with a typed
// error. They are intentionally `200` / `500` to match how App Insights
// classifies success vs failure in the portal.
const DEFAULT_SUCCESS_STATUS = 200
const DEFAULT_ERROR_STATUS = 500

/** Global Application Insights logger instance (process-wide singleton). */
let globalLogger: AppInsightsLogger | null = null

// ===================================================================
//  Lifecycle
// ===================================================================

/**
 * Initialize the global Application Insights logger.
 *
 * Subsequent calls return the existing instance and emit a warning — call
 * `disposeAppInsights()` first if you need to reinitialize.
 *
 * @example
 * ```typescript
 * // server/plugins/appinsights.ts
 * import { useRuntimeConfig } from '#imports'
 * import { initializeAppInsights } from 'appinsights-rest'
 *
 * export default defineNitroPlugin(() => {
 *   const config = useRuntimeConfig()
 *   initializeAppInsights(config.appInsights.connectionString, {
 *     role: 'my-app',
 *     appVersion: '1.0.0',
 *   })
 * })
 * ```
 */
export function initializeAppInsights(
  connectionString: string,
  options?: Partial<Omit<AppInsightsConfig, 'connectionString'>>,
): AppInsightsLogger {
  if (globalLogger) {
    console.warn('[AppInsights] Logger already initialized')
    return globalLogger
  }
  globalLogger = new AppInsightsLogger({ connectionString, ...options })
  return globalLogger
}

/**
 * Get the global Application Insights logger instance, or `null` if it has
 * not been initialized yet.
 */
export function getAppInsights(): AppInsightsLogger | null {
  return globalLogger
}

/**
 * Dispose the global Application Insights logger and flush remaining
 * telemetry. Should be called on server shutdown.
 */
export async function disposeAppInsights(): Promise<void> {
  if (!globalLogger) return
  await globalLogger.dispose()
  globalLogger = null
}

// ===================================================================
//  Correlation helpers (private)
// ===================================================================

/**
 * Extract the request ID stored on `event.context.appInsights.requestId`.
 * The request-tracking middleware (see README) sets this at the start of
 * each request and tears it down on response finish.
 */
function extractCorrelationId(event: TelemetryEventContext): string | undefined {
  return event.context?.appInsights?.requestId
}

/**
 * Merge the request's correlation ID into a properties bag so it propagates
 * down to the underlying envelope's `ai.operation.id` tag.
 */
function withCorrelation(event: TelemetryEventContext, properties?: Dict): Dict {
  return { ...properties, correlationId: extractCorrelationId(event) }
}

/**
 * Best-effort extraction of an HTTP-style status code from a thrown error.
 * Recognises both `e.statusCode` (h3, fetch wrappers) and
 * `e.response.status` (axios). Falls back to {@link DEFAULT_ERROR_STATUS}
 * when neither is present.
 */
function extractErrorStatusCode(err: unknown): number {
  const candidate = err as { statusCode?: unknown; response?: { status?: unknown } } | null
  if (typeof candidate?.statusCode === 'number') return candidate.statusCode
  if (typeof candidate?.response?.status === 'number') return candidate.response.status
  return DEFAULT_ERROR_STATUS
}

// ===================================================================
//  Tracking helpers
// ===================================================================

/**
 * Track a dependency (external API call, database query, etc.) with
 * automatic timing, error classification, and correlation propagation.
 *
 * The wrapped `fn` is awaited; on success the resulting telemetry records
 * status {@link DEFAULT_SUCCESS_STATUS}; on failure it records the error's
 * status code (or {@link DEFAULT_ERROR_STATUS} as a fallback) and re-throws
 * so callers see the original error.
 *
 * @example
 * ```typescript
 * export default defineEventHandler(async (event) => {
 *   return await trackDependency(
 *     event,
 *     'GET users API',
 *     'api.example.com',
 *     'HTTP',
 *     async () => $fetch('https://api.example.com/users'),
 *   )
 * })
 * ```
 */
export async function trackDependency<T>(
  event: TelemetryEventContext,
  name: string,
  target: string,
  type: DependencyType,
  fn: () => Promise<T>,
): Promise<T> {
  const logger = getAppInsights()
  if (!logger) return await fn()

  const startTime = Date.now()
  const correlationId = extractCorrelationId(event)
  const dependencyId = createDependencyId(correlationId)

  let success = true
  let resultCode = DEFAULT_SUCCESS_STATUS
  let errorMessage: string | undefined

  try {
    return await fn()
  } catch (err) {
    success = false
    resultCode = extractErrorStatusCode(err)
    errorMessage = err instanceof Error ? err.message : String(err)
    throw err
  } finally {
    logger.trackDependency({
      id: dependencyId,
      parentId: correlationId,
      name,
      data: target,
      type,
      target,
      duration: Date.now() - startTime,
      resultCode,
      success,
      properties: {
        correlationId,
        error: errorMessage,
      },
    })
  }
}

/**
 * Track a custom event with automatic correlation propagation.
 *
 * @example
 * ```typescript
 * trackEvent(event, 'user_signup', { plan: 'premium' })
 * ```
 */
export function trackEvent(
  event: TelemetryEventContext,
  eventName: string,
  properties?: Dict,
): void {
  const logger = getAppInsights()
  if (!logger) return
  logger.trackEvent(eventName, withCorrelation(event, properties))
}

/**
 * Track a custom metric with automatic correlation propagation.
 *
 * @example
 * ```typescript
 * trackMetric(event, 'processing_time', 1234)
 * ```
 */
export function trackMetric(
  event: TelemetryEventContext,
  metricName: string,
  value: number,
  properties?: Dict,
): void {
  const logger = getAppInsights()
  if (!logger) return
  logger.trackMetric(metricName, value, withCorrelation(event, properties))
}

/**
 * Track an exception with automatic correlation propagation.
 *
 * @example
 * ```typescript
 * try {
 *   // ...
 * } catch (error) {
 *   trackException(event, error as Error)
 *   throw error
 * }
 * ```
 */
export function trackException(
  event: TelemetryEventContext,
  error: Error,
  properties?: Dict,
): void {
  const logger = getAppInsights()
  if (!logger) return
  logger.trackException(error, withCorrelation(event, properties))
}

/**
 * Track a trace (log) message with automatic correlation propagation.
 * Severity defaults to {@link SeverityLevel.Information}.
 *
 * @example
 * ```typescript
 * trackTrace(event, 'cache miss', SeverityLevel.Warning, { key })
 * ```
 */
export function trackTrace(
  event: TelemetryEventContext,
  message: string,
  severityLevel: SeverityLevel = SeverityLevels.Information,
  properties?: Dict,
): void {
  const logger = getAppInsights()
  if (!logger) return
  logger.trackTrace(message, severityLevel, withCorrelation(event, properties))
}

/**
 * Wrap a handler with automatic exception tracking. Any thrown error is
 * recorded with the request path and method, then re-thrown.
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
  event: TelemetryEventContext,
  handler: () => Promise<T>,
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
