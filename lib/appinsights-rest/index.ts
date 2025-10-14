// Application Insights Logger - Main Entry Point

// Core exports (framework-independent)
export { AppInsightsLogger } from './core/client'
export { createRequestId, createDependencyId, formatDuration, generateGuid } from './core/utils'
export type { AppInsightsConfig, TelemetryEnvelope, TrackRequestOptions, TrackDependencyOptions, Dict } from './core/types'

// Helper functions for easier integration
export {
  initializeAppInsights,
  getAppInsights,
  disposeAppInsights,
  trackDependency,
  trackEvent,
  trackMetric,
  trackException,
  withErrorTracking,
} from './helpers'
