// Application Insights Logger - Main Entry Point

// Core exports (framework-independent)
export { AppInsightsLogger } from './core/client'
export { createRequestId, createDependencyId, formatDuration, generateGuid } from './core/utils'
export type { AppInsightsConfig, TelemetryEnvelope, TrackRequestOptions, TrackDependencyOptions, Dict } from './core/types'

// Nuxt/Nitro integration exports (commented out for now - these require Nitro runtime)
// export { getOrCreateCorrelationId, getCorrelationId } from './integrations/nuxt/correlation'
// export { createRequestTrackingMiddleware, getRequestId } from './integrations/nuxt/middleware'
// export { CorrelatedLogger, useLogger } from './integrations/nuxt/logger'
// export { createAppInsightsPlugin, initializeAppInsights, getAppInsights } from './integrations/nuxt/plugin'
