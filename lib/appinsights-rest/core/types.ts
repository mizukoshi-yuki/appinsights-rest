// Core type definitions for Application Insights Logger

/**
 * Free-form telemetry property bag carried on every track* call.
 * Values are coerced to strings server-side, so `unknown` keeps the call
 * site honest while still accepting numbers, booleans, dates, etc.
 */
export type Dict = Record<string, unknown>

/**
 * Application Insights dependency type, as defined by the App Insights schema.
 * @see https://learn.microsoft.com/azure/azure-monitor/app/data-model-dependency-telemetry
 */
export type DependencyType = 'HTTP' | 'SQL' | 'Azure' | 'Other'

/**
 * Application Insights severity levels (numeric, matches the wire format).
 * Use `SeverityLevel.Information` etc. instead of bare integers.
 * @see https://learn.microsoft.com/azure/azure-monitor/app/api-custom-events-metrics#tracktrace
 */
export const SeverityLevel = {
  Verbose: 0,
  Information: 1,
  Warning: 2,
  Error: 3,
  Critical: 4,
} as const
export type SeverityLevel = (typeof SeverityLevel)[keyof typeof SeverityLevel]

export interface AppInsightsConfig {
  connectionString: string
  role?: string | undefined
  appVersion?: string | undefined
  batchSize?: number | undefined
  flushIntervalMs?: number | undefined
  /** Hard cap on queued telemetry envelopes; oldest are dropped past this. */
  maxQueueSize?: number | undefined
}

export interface TelemetryEnvelope {
  name: string
  time: string
  iKey: string
  tags?: Record<string, string>
  data: {
    baseType: string
    baseData: Record<string, unknown>
  }
}

export interface TrackRequestOptions {
  id?: string | undefined
  name: string
  url: string
  duration: number
  responseCode: number
  success: boolean
  properties?: Dict | undefined
}

export interface TrackDependencyOptions {
  id?: string | undefined
  parentId?: string | undefined
  name: string
  data: string
  type: DependencyType
  target?: string | undefined
  duration: number
  resultCode: number
  success: boolean
  properties?: Dict | undefined
}

/**
 * Minimal H3-event-like shape used by helpers to read correlation context
 * without taking a hard dependency on `h3`. Consumers populate
 * `event.context.appInsights.requestId` via their own request-tracking
 * middleware before invoking these helpers.
 */
export interface TelemetryEventContext {
  context?: {
    appInsights?: {
      requestId?: string
      correlationId?: string
      startTime?: number
    }
  }
  path?: string
  method?: string
}

/**
 * Mutable outcome captured by `withTrackedDependency` while a dependency
 * call runs. Recorded into telemetry in the `finally` block.
 */
export interface DependencyOutcome {
  success: boolean
  resultCode: number
  error: Error | null
}
