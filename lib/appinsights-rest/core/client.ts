// Application Insights REST API Client (Framework-independent)

import type {
  AppInsightsConfig,
  TelemetryEnvelope,
  TrackRequestOptions,
  TrackDependencyOptions,
  Dict,
} from './types'
import { SeverityLevel } from './types'
import { createRequestId, createDependencyId, formatDuration } from './utils'

// Injected at build time by tsup's `esbuildOptions.define` (and by vitest via
// `vitest.config.ts`'s `define`). Avoids `import pkg from '../package.json'`,
// which would otherwise inline the entire manifest — devDependencies, repo
// URL, keywords, and all — into `dist/index.mjs`.
declare const __SDK_VERSION__: string

// -- defaults ---------------------------------------------------------
const DEFAULT_BATCH_SIZE = 16 // envelopes per ingestion POST — balances latency vs payload size
const DEFAULT_FLUSH_INTERVAL_MS = 1000 // periodic flush cadence (1 s)
const DEFAULT_MAX_QUEUE_SIZE = 1000 // drop-oldest cap to bound memory under outage
const DEFAULT_CLOUD_ROLE = 'unknown-app' // App Insights cloud role tag default

// -- backoff ----------------------------------------------------------
const STATUS_TOO_MANY_REQUESTS = 429 // App Insights rate-limit signal
const MIN_RETRYABLE_SERVER_STATUS = 500 // 5xx → exponential backoff retry
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 60_000
const BACKOFF_GROWTH_FACTOR = 2

// -- envelope schema --------------------------------------------------
const APP_INSIGHTS_BASE_DATA_VER = 2 // App Insights base data schema version
const SDK_VERSION = __SDK_VERSION__ // injected by tsup / vitest — no package.json import

const TRACK_PATH = '/v2.1/track'

const TAG = {
  CloudRole: 'ai.cloud.role',
  CloudRoleInstance: 'ai.cloud.roleInstance',
  SdkVersion: 'ai.internal.sdkVersion',
  AppVersion: 'ai.application.ver',
  OperationId: 'ai.operation.id',
  OperationParentId: 'ai.operation.parentId',
  OperationName: 'ai.operation.name',
} as const

const ENVELOPE = {
  Event: 'Microsoft.ApplicationInsights.Event',
  Request: 'Microsoft.ApplicationInsights.Request',
  Dependency: 'Microsoft.ApplicationInsights.RemoteDependency',
  Exception: 'Microsoft.ApplicationInsights.Exception',
  Trace: 'Microsoft.ApplicationInsights.Message',
  Metric: 'Microsoft.ApplicationInsights.Metric',
} as const

const BASE_TYPE = {
  Event: 'EventData',
  Request: 'RequestData',
  Dependency: 'RemoteDependencyData',
  Exception: 'ExceptionData',
  Trace: 'MessageData',
  Metric: 'MetricData',
} as const

// -- module-private helpers ------------------------------------------

interface ParsedConnectionString {
  instrumentationKey: string
  ingestionEndpoint: string
}

function parseConnectionString(connectionString: string): ParsedConnectionString {
  let instrumentationKey: string | undefined
  let ingestionEndpoint: string | undefined
  for (const part of connectionString.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq)
    const value = part.slice(eq + 1)
    if (key === 'InstrumentationKey') instrumentationKey = value
    else if (key === 'IngestionEndpoint') ingestionEndpoint = value
  }
  // Report only the missing field name — the full connection string contains
  // the IngestionEndpoint (tenant URL) which should not be echoed into APM,
  // log aggregation, or exception-tracking pipelines.
  if (!instrumentationKey) {
    throw new Error(
      'AppInsightsLogger: connection string is missing the InstrumentationKey field',
    )
  }
  if (!ingestionEndpoint) {
    throw new Error(
      'AppInsightsLogger: connection string is missing the IngestionEndpoint field',
    )
  }
  return { instrumentationKey, ingestionEndpoint }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function asStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readCorrelationId(properties: Dict | undefined): string | undefined {
  return asStringOrUndefined(properties?.correlationId)
}

// WEBSITE_INSTANCE_ID is set by Azure App Service / Functions to distinguish
// deployment slots; this fallback keeps local / browser instances identifiable.
const LOCAL_DEV_INSTANCE_ID = 'local-dev'

/**
 * Read the Azure App Service / Functions `WEBSITE_INSTANCE_ID` environment
 * variable, falling back to {@link LOCAL_DEV_INSTANCE_ID} when it is unset.
 *
 * The `typeof process !== 'undefined'` guard is required because this
 * library ships to browser runtimes as well: Vite does not statically replace
 * `process.env.*` in library mode, and `process` itself is undefined on the
 * browser side, so a bare `process.env.X` reference would throw a
 * `ReferenceError` during construction.
 */
function readInstanceId(): string {
  if (typeof process !== 'undefined' && process.env?.WEBSITE_INSTANCE_ID) {
    return process.env.WEBSITE_INSTANCE_ID
  }
  return LOCAL_DEV_INSTANCE_ID
}

// ===================================================================
//  AppInsightsLogger
// ===================================================================

export class AppInsightsLogger {
  // -- config (immutable after construction) -----------------------
  private readonly ingestionEndpoint: string
  private readonly instrumentationKey: string
  private readonly cloudRole: string
  private readonly appVersion: string | undefined
  private readonly batchSize: number
  private readonly flushIntervalMs: number
  private readonly maxQueueSize: number
  private readonly commonTags: Readonly<Record<string, string>>

  // -- queue state -------------------------------------------------
  private queue: TelemetryEnvelope[] = []
  private isFlushing = false

  // -- backoff state -----------------------------------------------
  private retryUntil = 0
  private backoffMs = 0

  // -- lifecycle ---------------------------------------------------
  private timer: ReturnType<typeof setInterval> | null = null
  private isDisposed = false

  constructor(config: AppInsightsConfig) {
    this.validateConfig(config)

    const parsed = parseConnectionString(config.connectionString)
    this.ingestionEndpoint = trimTrailingSlash(parsed.ingestionEndpoint)
    this.instrumentationKey = parsed.instrumentationKey
    this.cloudRole = config.role ?? DEFAULT_CLOUD_ROLE
    this.appVersion = config.appVersion
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    this.maxQueueSize = config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE
    this.commonTags = this.buildCommonTags()

    this.timer = setInterval(() => {
      this.flush().catch((error) => {
        console.error('[AppInsights] Flush failed:', error)
      })
    }, this.flushIntervalMs)
  }

  // ===============================================================
  //  Public track APIs
  // ===============================================================

  trackEvent(name: string, properties?: Dict): void {
    this.enqueue(
      this.envelopeFor(
        ENVELOPE.Event,
        BASE_TYPE.Event,
        { name, properties: properties ?? {} },
        properties,
      ),
    )
  }

  trackRequest(opts: TrackRequestOptions): string {
    const requestId = opts.id ?? createRequestId(readCorrelationId(opts.properties))
    this.enqueue(
      this.envelopeFor(
        ENVELOPE.Request,
        BASE_TYPE.Request,
        {
          id: requestId,
          name: opts.name,
          url: opts.url,
          duration: formatDuration(opts.duration),
          responseCode: String(opts.responseCode),
          success: opts.success,
          properties: opts.properties ?? {},
        },
        opts.properties,
        undefined,
        { [TAG.OperationName]: opts.name },
      ),
    )
    return requestId
  }

  trackDependency(opts: TrackDependencyOptions): string {
    const dependencyId = opts.id ?? createDependencyId(readCorrelationId(opts.properties))
    this.enqueue(
      this.envelopeFor(
        ENVELOPE.Dependency,
        BASE_TYPE.Dependency,
        {
          id: dependencyId,
          name: opts.name,
          data: opts.data,
          type: opts.type,
          target: opts.target ?? '',
          duration: formatDuration(opts.duration),
          resultCode: String(opts.resultCode),
          success: opts.success,
          properties: opts.properties ?? {},
        },
        opts.properties,
        opts.parentId,
      ),
    )
    return dependencyId
  }

  trackException(error: Error, properties?: Dict): void {
    this.enqueue(
      this.envelopeFor(
        ENVELOPE.Exception,
        BASE_TYPE.Exception,
        {
          exceptions: [{
            typeName: error.name,
            message: error.message,
            hasFullStack: !!error.stack,
            stack: error.stack ?? '',
          }],
          properties: properties ?? {},
        },
        properties,
      ),
    )
  }

  trackTrace(
    message: string,
    severityLevel: SeverityLevel = SeverityLevel.Information,
    properties?: Dict,
  ): void {
    this.enqueue(
      this.envelopeFor(
        ENVELOPE.Trace,
        BASE_TYPE.Trace,
        { message, severityLevel, properties: properties ?? {} },
        properties,
      ),
    )
  }

  trackMetric(name: string, value: number, properties?: Dict): void {
    this.enqueue(
      this.envelopeFor(
        ENVELOPE.Metric,
        BASE_TYPE.Metric,
        { metrics: [{ name, value, count: 1 }], properties: properties ?? {} },
        properties,
      ),
    )
  }

  // ===============================================================
  //  Lifecycle
  // ===============================================================

  async dispose(): Promise<void> {
    if (this.isDisposed) return
    this.isDisposed = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    await this.flush()
  }

  // ===============================================================
  //  Internals
  // ===============================================================

  private validateConfig(config: AppInsightsConfig): void {
    if (config.batchSize !== undefined && config.batchSize < 1) {
      throw new Error(`AppInsightsLogger: batchSize must be >= 1, received ${config.batchSize}`)
    }
    if (config.flushIntervalMs !== undefined && config.flushIntervalMs <= 0) {
      throw new Error(
        `AppInsightsLogger: flushIntervalMs must be > 0, received ${config.flushIntervalMs}`,
      )
    }
    if (config.maxQueueSize !== undefined && config.maxQueueSize < 1) {
      throw new Error(`AppInsightsLogger: maxQueueSize must be >= 1, received ${config.maxQueueSize}`)
    }
  }

  private buildCommonTags(): Readonly<Record<string, string>> {
    const tags: Record<string, string> = {
      [TAG.CloudRole]: this.cloudRole,
      [TAG.CloudRoleInstance]: readInstanceId(),
      [TAG.SdkVersion]: SDK_VERSION,
    }
    if (this.appVersion) tags[TAG.AppVersion] = this.appVersion
    return Object.freeze(tags)
  }

  private buildTags(properties?: Dict, parentId?: string): Record<string, string> {
    const correlationId = readCorrelationId(properties)
    if (!correlationId && !parentId) {
      // Common path: no per-call tags — return the cached frozen object.
      return this.commonTags as Record<string, string>
    }
    const tags: Record<string, string> = { ...this.commonTags }
    if (correlationId) tags[TAG.OperationId] = correlationId
    if (parentId) tags[TAG.OperationParentId] = parentId
    return tags
  }

  private envelopeFor(
    envelopeName: string,
    baseType: string,
    baseData: Record<string, unknown>,
    properties?: Dict,
    parentId?: string,
    extraTags?: Record<string, string>,
  ): TelemetryEnvelope {
    const baseTags = this.buildTags(properties, parentId)
    const tags = extraTags ? { ...baseTags, ...extraTags } : baseTags
    return {
      name: envelopeName,
      time: new Date().toISOString(),
      iKey: this.instrumentationKey,
      tags,
      data: {
        baseType,
        baseData: { ver: APP_INSIGHTS_BASE_DATA_VER, ...baseData },
      },
    }
  }

  private enqueue(envelope: TelemetryEnvelope): void {
    // Silently drop telemetry after dispose — the flush timer has been
    // cleared so anything enqueued here would never be sent, growing the
    // queue unboundedly and masking a use-after-dispose bug upstream.
    if (this.isDisposed) return

    if (this.queue.length >= this.maxQueueSize) {
      console.warn('[AppInsights] Queue full, dropping oldest telemetry')
      this.queue.shift()
    }
    this.queue.push(envelope)
    if (this.queue.length >= this.batchSize) {
      this.flush().catch((error) => {
        console.error('[AppInsights] Flush failed:', error)
      })
    }
  }

  private async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return
    if (Date.now() < this.retryUntil) return

    this.isFlushing = true
    const batch = this.queue.splice(0, this.batchSize)
    try {
      await this.sendBatch(batch)
    } catch (error) {
      console.error('[AppInsights] Network error during flush:', error)
      this.scheduleBackoffRetry(batch)
    } finally {
      this.isFlushing = false
    }
  }

  private async sendBatch(batch: TelemetryEnvelope[]): Promise<void> {
    const response = await fetch(`${this.ingestionEndpoint}${TRACK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
    if (response.ok) {
      this.resetBackoff()
      return
    }
    if (this.isRetryableStatus(response.status)) {
      this.scheduleBackoffRetry(batch)
      return
    }
    const errorText = await response.text()
    console.error('[AppInsights] Dropping batch due to client error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      batchSize: batch.length,
    })
  }

  private isRetryableStatus(status: number): boolean {
    return status === STATUS_TOO_MANY_REQUESTS || status >= MIN_RETRYABLE_SERVER_STATUS
  }

  private scheduleBackoffRetry(batch: TelemetryEnvelope[]): void {
    this.queue = batch.concat(this.queue)
    const next = this.backoffMs ? this.backoffMs * BACKOFF_GROWTH_FACTOR : INITIAL_BACKOFF_MS
    this.backoffMs = Math.min(next, MAX_BACKOFF_MS)
    this.retryUntil = Date.now() + this.backoffMs
  }

  private resetBackoff(): void {
    this.backoffMs = 0
    this.retryUntil = 0
  }
}
