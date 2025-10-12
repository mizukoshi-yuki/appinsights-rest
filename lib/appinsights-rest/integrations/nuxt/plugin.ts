// Nitro plugin for Application Insights initialization

import { defineNitroPlugin } from 'nitropack/runtime'
import { AppInsightsLogger } from '../../core/client'
import type { H3Event } from 'h3'
import { getCorrelationId } from './correlation'

let globalLogger: AppInsightsLogger | null = null

/**
 * Initialize Application Insights logger
 */
export function initializeAppInsights(connectionString: string, options?: { role?: string; appVersion?: string }) {
  const role = options?.role ?? process.env.AI_CLOUD_ROLE ?? 'web-portal'
  const appVersion = options?.appVersion ?? process.env.npm_package_version
  globalLogger = new AppInsightsLogger({
    connectionString,
    role,
    appVersion
  })
  return globalLogger
}

/**
 * Get the global Application Insights logger instance
 */
export function getAppInsights(): AppInsightsLogger | null {
  return globalLogger
}

/**
 * Create Nitro plugin for Application Insights
 */
export function createAppInsightsPlugin() {
  return defineNitroPlugin((nitroApp) => {
    const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING

    console.log('[AppInsights] Starting REST API logger initialization...')

    if (!connectionString) {
      console.warn('[AppInsights] Connection string not found. Telemetry will not be collected.')
      console.warn('[AppInsights] Please set APPLICATIONINSIGHTS_CONNECTION_STRING environment variable.')
      return
    }

    try {
      initializeAppInsights(connectionString)
      console.log('[AppInsights] ✓ REST API logger initialized successfully')

      // Track server startup event
      getAppInsights()?.trackEvent('ServerStartup', {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform
      })
      console.log('[AppInsights] Startup event sent')

      // Flush telemetry on shutdown
      nitroApp.hooks.hook('close', async () => {
        try {
          await getAppInsights()?.dispose()
          console.log('[AppInsights] Flushed on shutdown')
        } catch (e) {
          console.error('[AppInsights] Flush on shutdown failed:', e)
        }
      })

      // Error tracking hook
      nitroApp.hooks.hook('error', async (error, { event }) => {
        const logger = getAppInsights()
        if (!logger) return

        const h3 = event as H3Event
        const cid = getCorrelationId(h3) ?? 'unknown'

        await logger.trackException(error instanceof Error ? error : new Error(String(error)), {
          correlationId: cid,
          path: event?.path,
          method: event?.method,
        })
      })
    } catch (error) {
      console.error('[AppInsights] Failed to initialize:', error)
    }
  })
}
