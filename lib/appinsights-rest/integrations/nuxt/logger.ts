// Correlated Logger wrapper for Nuxt/H3

import { H3Event } from 'h3'
import { getCorrelationId } from './correlation'
import { getAppInsights } from './plugin'
import { getRequestId } from './middleware'

/**
 * x-cid付きロガー
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
   * 情報ログ
   */
  info(message: string, properties?: Record<string, any>) {
    console.log(`[${this.cid}] ${message}`)
    this.logger?.trackTrace(message, 1, {
      correlationId: this.cid,
      ...properties
    })
  }

  /**
   * 警告ログ
   */
  warn(message: string, properties?: Record<string, any>) {
    console.warn(`[${this.cid}] ${message}`)
    this.logger?.trackTrace(message, 2, {
      correlationId: this.cid,
      ...properties
    })
  }

  /**
   * エラーログ
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
   * イベント記録
   */
  trackEvent(name: string, properties?: Record<string, any>) {
    console.log(`[${this.cid}] Event: ${name}`)
    this.logger?.trackEvent(name, {
      correlationId: this.cid,
      ...properties
    })
  }

  /**
   * 依存関係（外部API呼び出し）の記録
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
   * メトリック記録
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
 * イベントからロガーを取得
 */
export function useLogger(event: H3Event): CorrelatedLogger {
  return new CorrelatedLogger(event)
}
