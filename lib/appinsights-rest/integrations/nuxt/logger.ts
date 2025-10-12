// Correlated Logger wrapper for Nuxt/H3

import { H3Event } from 'h3'
import { getCorrelationId } from './correlation'
import { getAppInsights } from './plugin'
import { getRequestId } from './middleware'

/**
 * Logger with correlation ID support
 */
export class CorrelatedLogger {
  constructor(private event: H3Event) {}

  private get cid(): string {
    return getCorrelationId(this.event) || 'unknown'
  }

  private get logger() {
    return getAppInsights()
  }

  /**
   * Log information message
   */
  info(message: string, properties?: Record<string, any>) {
    console.log(`[${this.cid}] ${message}`)
    this.logger?.trackTrace(message, 1, {
      correlationId: this.cid,
      ...properties
    })
  }

  /**
   * Log warning message
   */
  warn(message: string, properties?: Record<string, any>) {
    console.warn(`[${this.cid}] ${message}`)
    this.logger?.trackTrace(message, 2, {
      correlationId: this.cid,
      ...properties
    })
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, properties?: Record<string, any>) {
    console.error(`[${this.cid}] ${message}`, error)

    if (error) {
      this.logger?.trackException(error, {
        correlationId: this.cid,
        message,
        ...properties
      })
    } else {
      this.logger?.trackTrace(message, 3, {
        correlationId: this.cid,
        ...properties
      })
    }
  }

  /**
   * Track custom event
   */
  trackEvent(name: string, properties?: Record<string, any>) {
    console.log(`[${this.cid}] Event: ${name}`)
    this.logger?.trackEvent(name, {
      correlationId: this.cid,
      ...properties
    })
  }

  /**
   * Track dependency (external API call, database query, etc.)
   */
  async trackDependency(options: {
    name: string
    data: string
    type: string
    target?: string
    startTime: number
    success: boolean
    resultCode?: number
    properties?: Record<string, any>
  }) {
    const duration = Date.now() - options.startTime

    console.log(`[${this.cid}] Dependency: ${options.name} (${duration}ms) - ${options.success ? 'success' : 'failed'}`)

    await this.logger?.trackDependency({
      parentId: getRequestId(this.event),
      name: options.name,
      data: options.data,
      type: options.type,
      target: options.target,
      duration,
      resultCode: options.resultCode || (options.success ? 200 : 500),
      success: options.success,
      properties: {
        correlationId: this.cid,
        ...options.properties
      }
    })
  }

  /**
   * Track metric
   */
  metric(name: string, value: number, properties?: Record<string, any>) {
    console.log(`[${this.cid}] Metric: ${name} = ${value}`)
    this.logger?.trackMetric(name, value, {
      correlationId: this.cid,
      ...properties
    })
  }
}

/**
 * Get logger from event
 */
export function useLogger(event: H3Event): CorrelatedLogger {
  return new CorrelatedLogger(event)
}
