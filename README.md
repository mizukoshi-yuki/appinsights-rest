# appinsights-rest

[![npm version](https://img.shields.io/npm/v/appinsights-rest.svg)](https://www.npmjs.com/package/appinsights-rest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight, framework-agnostic Azure Application Insights client using REST API. Perfect for modern frameworks like **Nuxt 4** where the official Application Insights SDK doesn't work.

## ✨ Features

- 🚀 **Nuxt 4 Compatible** - Works seamlessly with Nuxt 4 and other modern frameworks
- 📦 **Lightweight** - No heavy SDK dependencies, pure REST API implementation
- 🔄 **Auto-batching** - Efficient telemetry batching with configurable intervals
- ♻️ **Retry Logic** - Built-in exponential backoff for failed requests
- 🎯 **TypeScript** - Full TypeScript support with complete type definitions
- 🔧 **Framework Agnostic** - Use with any JavaScript/TypeScript project
- 📊 **Complete Telemetry** - Support for Events, Exceptions, Traces, Metrics, Requests, and Dependencies

## 📦 Installation

```bash
npm install appinsights-rest
```

## 🚀 Quick Start

### Nuxt 4

1. **Create a plugin file** at `app/plugins/appinsights.client.ts`:

```typescript
import { defineNuxtPlugin } from '#app'
import { AppInsightsLogger } from 'appinsights-rest'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const connectionString = config.public.applicationInsightsConnectionString

  if (!connectionString) {
    console.warn('[AppInsights] No connection string found')
    return
  }

  const logger = new AppInsightsLogger({
    connectionString,
    role: 'my-nuxt-app',
    appVersion: '1.0.0'
  })

  nuxtApp.provide('appInsights', logger)

  // Cleanup on unmount
  nuxtApp.hook('app:beforeUnmount', async () => {
    await logger.dispose()
  })
})
```

2. **Configure runtime config** in `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      applicationInsightsConnectionString: process.env.NUXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING || ''
    }
  }
})
```

3. **Add environment variable** in `.env`:

```bash
NUXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx;IngestionEndpoint=https://xxx
```

4. **Use in your components**:

```vue
<script setup lang="ts">
const { $appInsights } = useNuxtApp()

const trackButtonClick = async () => {
  await $appInsights.trackEvent('ButtonClicked', {
    page: 'home',
    timestamp: new Date().toISOString()
  })
}
</script>
```

### Vanilla JavaScript/TypeScript

```typescript
import { AppInsightsLogger } from 'appinsights-rest'

const logger = new AppInsightsLogger({
  connectionString: 'InstrumentationKey=xxx;IngestionEndpoint=https://xxx',
  role: 'my-app',
  appVersion: '1.0.0',
  batchSize: 16,           // optional, default: 16
  flushIntervalMs: 1000    // optional, default: 1000
})

// Track events
await logger.trackEvent('UserLogin', { userId: '123' })

// Track exceptions
try {
  throw new Error('Something went wrong')
} catch (error) {
  await logger.trackException(error, { context: 'user-action' })
}

// Track traces (logs)
await logger.trackTrace('Application started', 1, { environment: 'production' })

// Track metrics
await logger.trackMetric('ResponseTime', 245, { endpoint: '/api/users' })

// Cleanup
await logger.dispose()
```

## 📖 API Reference

### Constructor Options

```typescript
interface AppInsightsConfig {
  connectionString: string    // Azure Application Insights connection string
  role?: string              // Cloud role name (default: 'web-portal')
  appVersion?: string        // Application version
  batchSize?: number         // Batch size for telemetry (default: 16)
  flushIntervalMs?: number   // Flush interval in ms (default: 1000)
}
```

### Methods

#### `trackEvent(name: string, properties?: Dict)`
Track custom events for business analytics.

```typescript
await logger.trackEvent('PurchaseCompleted', {
  orderId: '12345',
  amount: 99.99,
  currency: 'USD'
})
```

#### `trackException(error: Error, properties?: Dict)`
Track exceptions and errors.

```typescript
try {
  // your code
} catch (error) {
  await logger.trackException(error, {
    context: 'checkout-process',
    userId: currentUser.id
  })
}
```

#### `trackTrace(message: string, severityLevel?: number, properties?: Dict)`
Track log messages.

```typescript
// Severity levels: 0=Verbose, 1=Information, 2=Warning, 3=Error, 4=Critical
await logger.trackTrace('User action completed', 1, {
  action: 'profile-update',
  duration: 120
})
```

#### `trackMetric(name: string, value: number, properties?: Dict)`
Track custom metrics.

```typescript
await logger.trackMetric('PageLoadTime', 1234, {
  page: 'home',
  browser: 'chrome'
})
```

#### `trackRequest(options: TrackRequestOptions)`
Track HTTP requests.

```typescript
await logger.trackRequest({
  name: 'GET /api/users',
  url: 'https://example.com/api/users',
  duration: 245,
  responseCode: 200,
  success: true,
  properties: { userId: '123' }
})
```

#### `trackDependency(options: TrackDependencyOptions)`
Track external dependencies (APIs, databases, etc.).

```typescript
await logger.trackDependency({
  name: 'GET https://api.external.com/data',
  data: 'https://api.external.com/data',
  type: 'HTTP',
  target: 'api.external.com',
  duration: 156,
  resultCode: 200,
  success: true,
  properties: { cached: false }
})
```

#### `dispose()`
Flush all pending telemetry and cleanup resources.

```typescript
await logger.dispose()
```

## 🔧 Configuration

### Connection String

Get your connection string from Azure Portal:
1. Navigate to your Application Insights resource
2. Go to **Properties**
3. Copy the **Connection String**

Format: `InstrumentationKey=xxx;IngestionEndpoint=https://xxx;LiveEndpoint=https://xxx`

### Batching and Retry

The logger automatically batches telemetry data and retries failed requests:

- **Batch Size**: Default 16 items, configurable via `batchSize`
- **Flush Interval**: Default 1000ms, configurable via `flushIntervalMs`
- **Retry Logic**: Exponential backoff (1s → 2s → 4s → ... max 60s)
- **Auto-flush**: Automatic flush on batch size or interval

## 🎯 Use Cases

- ✅ Nuxt 4 applications where official SDK doesn't work
- ✅ Edge runtime environments (Cloudflare Workers, Vercel Edge)
- ✅ Lightweight applications that don't need full SDK
- ✅ Custom telemetry pipelines
- ✅ Server-side rendering (SSR) applications

## 🛠️ Development

This is a monorepo with the following structure:

```
appinsights-rest/
├── lib/appinsights-rest/       # Main library
└── playground/                 # Nuxt 4 test application
```

### Setup

```bash
# Install dependencies
npm install

# Build library
npm run build

# Run playground
npm run dev
```

## 📄 License

MIT © Yuki Mizukoshi

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Issues

Found a bug? Please [open an issue](https://github.com/mizukoshi-yuki/appinsights-rest/issues) with a detailed description.

## 📚 Resources

- [Azure Application Insights Documentation](https://docs.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)
- [Application Insights REST API](https://docs.microsoft.com/en-us/azure/azure-monitor/app/api-custom-events-metrics)
- [Nuxt 4 Documentation](https://nuxt.com/)

---

**If ApplicationInsights doesn't work, let them build REST API** - Yuki Antoinette
