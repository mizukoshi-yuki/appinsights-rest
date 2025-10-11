// Application Insights REST API Client (Framework-independent)

import type { AppInsightsConfig, TelemetryEnvelope, TrackRequestOptions, TrackDependencyOptions, Dict } from './types'
import { createRequestId, createDependencyId, formatDuration } from './utils'

const DEFAULT_BATCH = 16
const DEFAULT_INTERVAL = 1000

export class AppInsightsLogger {
  private ingestionEndpoint: string
  private instrumentationKey: string
  private cloudRole: string
  private appVersion?: string

  private queue: TelemetryEnvelope[] = []
  private timer: NodeJS.Timeout | null = null
  private batchSize: number
  private flushIntervalMs: number
  private retryUntil = 0
  private backoffMs = 0

  constructor(config: AppInsightsConfig) {
    const parsed = this.parseConnectionString(config.connectionString)
    this.ingestionEndpoint = this.trimSlash(parsed.ingestionEndpoint)
    this.instrumentationKey = parsed.instrumentationKey
    this.cloudRole = config.role ?? 'web-portal'
    this.appVersion = config.appVersion
    this.batchSize = config.batchSize ?? DEFAULT_BATCH
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_INTERVAL
    this.timer = setInterval(() => this.flush().catch(() => {}), this.flushIntervalMs)
  }

  dispose = async () => {
    if (this.timer) clearInterval(this.timer)
    await this.flush()
  }

  // ----------------------
  // Public track APIs
  // ----------------------

  async trackEvent(name: string, properties?: Dict) {
    const { tags } = this.buildTags(properties)
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Event',
      time: new Date().toISOString(),
      iKey: this.instrumentationKey,
      tags,
      data: {
        baseType: 'EventData',
        baseData: { ver: 2, name, properties: properties ?? {} }
      }
    }
    this.enqueue(env)
  }

  async trackRequest(opts: TrackRequestOptions) {
    const { tags } = this.buildTags(opts.properties)
    const requestId = opts.id ?? createRequestId((opts.properties?.correlationId as string | undefined))
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Request',
      time: new Date().toISOString(),
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

  async trackDependency(opts: TrackDependencyOptions) {
    const { tags } = this.buildTags(opts.properties, opts.parentId)
    const dependencyId = opts.id ?? createDependencyId((opts.properties?.correlationId as string | undefined))
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.RemoteDependency',
      time: new Date().toISOString(),
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

  async trackException(error: Error, properties?: Dict) {
    const { tags } = this.buildTags(properties)
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Exception',
      time: new Date().toISOString(),
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

  async trackTrace(message: string, severityLevel: number = 1, properties?: Dict) {
    const { tags } = this.buildTags(properties)
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Message',
      time: new Date().toISOString(),
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

  async trackMetric(name: string, value: number, properties?: Dict) {
    const { tags } = this.buildTags(properties)
    const env: TelemetryEnvelope = {
      name: 'Microsoft.ApplicationInsights.Metric',
      time: new Date().toISOString(),
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

  private parseConnectionString(connectionString: string) {
    const parts = connectionString.split(';')
    const result: any = {}
    for (const part of parts) {
      const [key, value] = part.split('=')
      if (key === 'InstrumentationKey') result.instrumentationKey = value
      if (key === 'IngestionEndpoint') result.ingestionEndpoint = value
    }
    if (!result.instrumentationKey || !result.ingestionEndpoint) {
      throw new Error('Invalid APPLICATIONINSIGHTS_CONNECTION_STRING')
    }
    return result
  }

  private trimSlash = (s: string) => s.replace(/\/+$/, '')

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
    this.queue.push(env)
    if (this.queue.length >= this.batchSize) {
      this.flush().catch(() => {})
    }
  }

  private async flush() {
    if (this.queue.length === 0) return
    if (Date.now() < this.retryUntil) return

    const batch = this.queue.splice(0, this.batchSize)
    const url = `${this.ingestionEndpoint}/v2.1/track`
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      })
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          this.queue = batch.concat(this.queue)
          this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, 60000)
          this.retryUntil = Date.now() + this.backoffMs
        } else {
          console.error('[AppInsights] drop batch:', response.status, await response.text())
        }
      } else {
        this.backoffMs = 0
        this.retryUntil = 0
      }
    } catch {
      this.queue = batch.concat(this.queue)
      this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, 60000)
      this.retryUntil = Date.now() + this.backoffMs
    }
  }
}
