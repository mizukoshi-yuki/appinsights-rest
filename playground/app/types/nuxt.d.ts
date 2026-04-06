import type { AppInsightsLogger } from 'appinsights-rest'

declare module '#app' {
  interface NuxtApp {
    $appInsights: AppInsightsLogger | undefined
  }
}

export {}
