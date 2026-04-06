import type { AppInsightsLogger } from 'appinsights-rest'

// Nuxt docs recommend augmenting both `#app` and `vue` when a plugin provides
// a helper via `nuxtApp.provide(...)`, so the type is visible both through
// `useNuxtApp().$appInsights` and as `this.$appInsights` / `{{ $appInsights }}`
// inside components and templates.
// @see https://nuxt.com/docs/4.x/directory-structure/app/plugins#typing-plugins
declare module '#app' {
  interface NuxtApp {
    $appInsights: AppInsightsLogger | undefined
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $appInsights: AppInsightsLogger | undefined
  }
}

export {}
