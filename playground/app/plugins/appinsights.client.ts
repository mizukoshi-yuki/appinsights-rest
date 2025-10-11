import { defineNuxtPlugin } from '#app'
import { AppInsightsLogger } from 'appinsights-logger'

export default defineNuxtPlugin((nuxtApp) => {
  // Get connection string from runtime config
  // Set NUXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING in your .env file
  const config = useRuntimeConfig()
  const connectionString = config.public.applicationInsightsConnectionString || ''

  console.log('[AppInsights] Initializing logger...')
  console.log('[AppInsights] Connection string available:', !!connectionString)

  if (!connectionString) {
    console.warn('[AppInsights] No connection string found. Set NUXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING in .env')
    return
  }

  try {
    const logger = new AppInsightsLogger({
      connectionString,
      role: 'nuxt4-playground',
      appVersion: '1.0.0'
    })

    // Make logger available globally
    nuxtApp.provide('appInsights', logger)

    console.log('[AppInsights] Logger initialized successfully')

    // Track app startup
    logger.trackEvent('AppStartup', {
      timestamp: new Date().toISOString()
    })

    // Cleanup on unmount
    nuxtApp.hook('app:beforeUnmount', async () => {
      await logger.dispose()
      console.log('[AppInsights] Logger disposed')
    })
  } catch (error) {
    console.error('[AppInsights] Failed to initialize:', error)
  }
})
