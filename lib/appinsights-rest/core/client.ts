// Application Insights REST API Client (Framework-independent)

import type { AppInsightsConfig, TelemetryEnvelope, TrackRequestOptions, TrackDependencyOptions, Dict } from './types'
import { createRequestId, createDependencyId, formatDuration } from './utils'

const DEFAULT_BATCH = 16
const DEFAULT_INTERVAL = 1000
const DEFAULT_MAX_QUEUE_SIZE = 1000
const RETRY_STATUS_CODE = 429
const MIN_SERVER_ERROR = 500
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 60000

export class AppInsightsLogger {
  private ingestionEndpoint: string
  private instrumentationKey: string
  private cloudRole: string
  private appVersion?: string

  private queue: TelemetryEnvelope[] = []
  private timer: NodeJS.Timeout | null = null
  private batchSize: number
  private flushIntervalMs: number
  private maxQueueSize: number
  private retryUntil = 0
  private backoffMs = 0
  private isFlushing = false

  constructor(config: AppInsightsConfig) {
    // Validate config
    if (config.batchSize !== undefined && config.batchSize < 1) {
      throw new Error('batchSize must be >= 1')
    }
    if (config.flushIntervalMs !== undefined && config.flushIntervalMs < 0) {
      throw new Error('flushIntervalMs must be >= 0')
    }

    const parsed = this.parseConnectionString(config.connectionString)
    this.ingestionEndpoint = this.trimSlash(parsed.ingestionEndpoint)
    this.instrumentationKey = parsed.instrumentationKey
    this.cloudRole = config.role ?? 'web-portal'
    this.appVersion = config.appVersion
    this.batchSize = config.batchSize ?? DEFAULT_BATCH
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_INTERVAL
    this.maxQueueSize = DEFAULT_MAX_QUEUE_SIZE
    this.timer = setInterval(() => {
      this.flush().catch((error) => {
        console.error('[AppInsights] Flush failed:', error)
      })
    }, this.flushIntervalMs)
  }

  dispose = async () => {
    if (this.timer) clearInterval(this.timer)
    await this.flush()
  }

  // ----------------------
  // Public track APIs
  // ----------------------

  trackEvent(name: string, properties?: Dict): void {
    const { tags } = this.buildTags(properties)
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Event',
      time: this.getTimestamp(),
      iKey: this.instrumentationKey,
      tags,
      data: {
        baseType: 'EventData',
        baseData: { ver: 2, name, properties: properties ?? {} }
      }
    }
    this.enqueue(env)
  }

  trackRequest(opts: TrackRequestOptions): string {
    const { tags } = this.buildTags(opts.properties)
    const requestId = opts.id ?? createRequestId((opts.properties?.correlationId as string | undefined))
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Request',
      time: this.getTimestamp(),
      iKey: this.instrumentationKey,
      tags: { ...tags, 'ai.operation.name': opts.name },
      data: {
        baseType: 'RequestData',
        baseData: {
          ver: 2,
          id: requestId,
          name: opts.name,
          url: opts.url,
          duration: formatDuration(opts.duration),
          responseCode: String(opts.responseCode),
          success: opts.success,
          properties: opts.properties ?? {}
        }
      }
    }
    this.enqueue(env)
    return requestId
  }

  trackDependency(opts: TrackDependencyOptions): string {
    const { tags } = this.buildTags(opts.properties, opts.parentId)
    const dependencyId = opts.id ?? createDependencyId((opts.properties?.correlationId as string | undefined))
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.RemoteDependency',
      time: this.getTimestamp(),
      iKey: this.instrumentationKey,
      tags,
      data: {
        baseType: 'RemoteDependencyData',
        baseData: {
          ver: 2,
          id: dependencyId,
          name: opts.name,
          data: opts.data,
          type: opts.type,
          target: opts.target ?? '',
          duration: formatDuration(opts.duration),
          resultCode: String(opts.resultCode),
          success: opts.success,
          properties: opts.properties ?? {}
        }
      }
    }
    this.enqueue(env)
    return dependencyId
  }

  trackException(error: Error, properties?: Dict): void {
    const { tags } = this.buildTags(properties)
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Exception',
      time: this.getTimestamp(),
      iKey: this.instrumentationKey,
      tags,
      data: {
        baseType: 'ExceptionData',
        baseData: {
          ver: 2,
          exceptions: [{
            typeName: error.name,
            message: error.message,
            hasFullStack: !!error.stack,
            stack: error.stack ?? ''
          }],
          properties: properties ?? {}
        }
      }
    }
    this.enqueue(env)
  }

  trackTrace(message: string, severityLevel: number = 1, properties?: Dict): void {
    const { tags } = this.buildTags(properties)
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Message',
      time: this.getTimestamp(),
      iKey: this.instrumentationKey,
      tags,
      data: {
        baseType: 'MessageData',
        baseData: {
          ver: 2,
          message,
          severityLevel,
          properties: properties ?? {}
        }
      }
    }
    this.enqueue(env)
  }

  trackMetric(name: string, value: number, properties?: Dict): void {
    const { tags } = this.buildTags(properties)
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Metric',
      time: this.getTimestamp(),
      iKey: this.instrumentationKey,
      tags,
      data: {
        baseType: 'MetricData',
        baseData: {
          ver: 2,
          metrics: [{ name, value, count: 1 }],
          properties: properties ?? {}
        }
      }
    }
    this.enqueue(env)
  }

  // ----------------------
  // internals
  // ----------------------

  private parseConnectionString(connectionString: string): { instrumentationKey: string; ingestionEndpoint: string } {
    const parts = connectionString.split(';')
    const result: { instrumentationKey?: string; ingestionEndpoint?: string } = {}
    for (const part of parts) {
      const [key, value] = part.split('=')
      if (key === 'InstrumentationKey') result.instrumentationKey = value
      if (key === 'IngestionEndpoint') result.ingestionEndpoint = value
    }
    if (!result.instrumentationKey) {
      throw new Error('Missing InstrumentationKey in connection string')
    }
    if (!result.ingestionEndpoint) {
      throw new Error('Missing IngestionEndpoint in connection string')
    }
    return { instrumentationKey: result.instrumentationKey, ingestionEndpoint: result.ingestionEndpoint }
  }

  private trimSlash = (s: string) => s.replace(/\/+$/, '')

  private getTimestamp(): string {
    return new Date().toISOString()
  }

  private getCommonTags() {
    const tags: Record<string, string> = {
      'ai.cloud.role': this.cloudRole,
      'ai.cloud.roleInstance': process.env.WEBSITE_INSTANCE_ID || 'local-dev',
      'ai.internal.sdkVersion': 'custom-rest-api:1.1.0',
    }
    if (this.appVersion) tags['ai.application.ver'] = this.appVersion
    return tags
  }

  private buildTags(properties?: Dict, parentId?: string) {
    const cid = properties?.correlationId as string | undefined
    const tags = this.getCommonTags()
    if (cid) tags['ai.operation.id'] = cid
    if (parentId) tags['ai.operation.parentId'] = parentId
    return { tags }
  }

  private enqueue(env: TelemetryEnvelope) {
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('[AppInsights] Queue full, dropping oldest telemetry')
      this.queue.shift()
    }
    this.queue.push(env)
    if (this.queue.length >= this.batchSize) {
      this.flush().catch((error) => {
        console.error('[AppInsights] Flush failed:', error)
      })
    }
  }

  private async flush() {
    if (this.isFlushing || this.queue.length === 0) return
    if (Date.now() < this.retryUntil) return

    this.isFlushing = true
    try {
      const batch = this.queue.splice(0, this.batchSize)
      const url = `${this.ingestionEndpoint}/v2.1/track`
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch)
        })
        if (!response.ok) {
          if (response.status === RETRY_STATUS_CODE || response.status >= MIN_SERVER_ERROR) {
            this.queue = batch.concat(this.queue)
            this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : INITIAL_BACKOFF_MS, MAX_BACKOFF_MS)
            this.retryUntil = Date.now() + this.backoffMs
          } else {
            const errorText = await response.text()
            console.error('[AppInsights] Dropping batch due to client error:', {
              status: response.status,
              statusText: response.statusText,
              error: errorText,
              batchSize: batch.length
            })
          }
        } else {
          this.backoffMs = 0
          this.retryUntil = 0
        }
      } catch (error) {
        this.queue = batch.concat(this.queue)
        this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : INITIAL_BACKOFF_MS, MAX_BACKOFF_MS)
        this.retryUntil = Date.now() + this.backoffMs
      }
    } finally {
      this.isFlushing = false
    }
  }
}
