import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { AppInsightsLogger } from 'appinsights-rest'

const PLAYGROUND_ROLE = 'nuxt4-playground' // App Insights cloud role tag for this playground
const PLAYGROUND_APP_VERSION = '1.0.0'     // Static playground version reported to App Insights

export default defineNuxtPlugin((nuxtApp) => {
  // Set NUXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING in your .env file
  const config = useRuntimeConfig()
  const connectionString = config.public.applicationInsightsConnectionString

  if (!connectionString) {
    console.warn('[AppInsights] No connection string found. Set NUXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING in .env')
    return
  }

  try {
    const logger = new AppInsightsLogger({
      connectionString,
      role: PLAYGROUND_ROLE,
      appVersion: PLAYGROUND_APP_VERSION,
    })

    nuxtApp.provide('appInsights', logger)

    if (import.meta.dev) {
      console.log('[AppInsights] Logger initialized successfully')
    }

    // Track app startup. The library's envelope already includes `time`,
    // so no manual timestamp is needed.
    logger.trackEvent('AppStartup')

    // Best-effort cleanup on page unload. Telemetry queued at this point
    // may still be lost since `beforeunload` does not await async work.
    window.addEventListener('beforeunload', () => {
      void logger.dispose()
      if (import.meta.dev) {
        console.log('[AppInsights] Logger disposed')
      }
    })
  } catch (error) {
    console.error('[AppInsights] Failed to initialize:', error)
  }
})
