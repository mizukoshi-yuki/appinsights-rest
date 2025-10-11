// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  runtimeConfig: {
    public: {
      applicationInsightsConnectionString: process.env.NUXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING || ''
    }
  }
})
