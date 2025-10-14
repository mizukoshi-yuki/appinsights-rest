# appinsights-rest

A lightweight, framework-independent Application Insights REST API client for Node.js applications, optimized for Nuxt 4 and other modern frameworks.

## Features

- 🚀 **Easy Integration** - Helper functions reduce implementation burden by 75%
- 🎯 **Framework-independent** - Works with any Node.js framework (Nuxt, Express, Fastify, etc.)
- 📊 **Full Telemetry Support** - Events, requests, dependencies, exceptions, traces, metrics
- 🔄 **Automatic Batching & Retry** - Exponential backoff for failed requests
- 🔗 **Correlation ID Support** - Built-in distributed tracing
- 📦 **Zero Dependencies** - Core functionality has no external dependencies
- 🎨 **TypeScript Support** - Full type definitions included

## Installation

```bash
npm install appinsights-rest
```

## Quick Start (Nuxt 4 / Nitro)

### 1. Create a Plugin

Create `server/plugins/appinsights.ts`:

```typescript
import { initializeAppInsights, disposeAppInsights } from 'appinsights-rest'

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const connectionString = config.applicationInsights?.connectionString

  if (!connectionString) {
    console.warn('[AppInsights] Connection string not configured')
    return
  }

  // Initialize Application Insights
  initializeAppInsights(connectionString, {
    role: 'my-app',
    appVersion: '1.0.0',
  })

  // Cleanup on server shutdown
  nitroApp.hooks.hook('close', async () => {
    await disposeAppInsights()
  })
})
```

### 2. Create Request Tracking Middleware

Create `server/middleware/appinsights-request.ts`:

```typescript
import { createRequestId, getAppInsights } from 'appinsights-rest'

export default defineEventHandler(async (event) => {
  const logger = getAppInsights()
  if (!logger) return

  const startTime = Date.now()
  const url = event.node.req.url || '/'
  const method = event.node.req.method || 'GET'
  const requestId = createRequestId()

  // Store request ID for correlation
  event.context.appInsights = { requestId, startTime }

  // Track request on completion
  event.node.res.once('finish', () => {
    const duration = Date.now() - startTime
    const statusCode = event.node.res.statusCode || 200
    const success = statusCode >= 200 && statusCode < 400

    logger.trackRequest({
      id: requestId,
      name: `${method} ${url}`,
      url: `${event.node.req.headers.host || 'localhost'}${url}`,
      duration,
      responseCode: statusCode,
      success,
      properties: { method, correlationId: requestId },
    })
  })
})
```

### 3. Use Helper Functions in Your API

Create `server/api/example.ts`:

```typescript
import { trackDependency, trackEvent, trackException } from 'appinsights-rest'

export default defineEventHandler(async (event) => {
  try {
    // Track an external API call
    const data = await trackDependency(
      event,
      'External API Call',
      'https://api.example.com',
      'HTTP',
      async () => {
        return await fetch('https://api.example.com/data').then(r => r.json())
      }
    )

    // Track a custom event
    trackEvent(event, 'data_fetched', {
      recordCount: data.length,
      source: 'external-api',
    })

    return { success: true, data }
  } catch (error) {
    // Track exceptions
    trackException(event, error as Error, {
      endpoint: '/api/example',
    })
    throw error
  }
})
```

### 4. Configure Environment Variables

Add to your `.env` file:

```bash
NUXT_APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx;IngestionEndpoint=https://xxx.applicationinsights.azure.com/
```

Add to `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  runtimeConfig: {
    applicationInsights: {
      connectionString: process.env.NUXT_APPLICATIONINSIGHTS_CONNECTION_STRING,
      role: process.env.NUXT_APPLICATIONINSIGHTS_ROLE || 'web-portal',
      appVersion: process.env.NUXT_APPLICATIONINSIGHTS_APP_VERSION || '1.0.0',
    },
  },
})
```

## API Reference

### Helper Functions

#### `initializeAppInsights(connectionString, options?)`

Initialize the global Application Insights logger. Call this once at application startup.

```typescript
import { initializeAppInsights } from 'appinsights-rest'

const logger = initializeAppInsights(connectionString, {
  role: 'my-app',           // Application role name
  appVersion: '1.0.0',      // Application version
  batchSize: 16,            // Batch size (default: 16)
  flushIntervalMs: 1000,    // Flush interval (default: 1000ms)
})
```

#### `getAppInsights()`

Get the global Application Insights logger instance.

```typescript
import { getAppInsights } from 'appinsights-rest'

const logger = getAppInsights()
if (logger) {
  logger.trackEvent('my_event')
}
```

#### `disposeAppInsights()`

Clean up and flush remaining telemetry. Call this on application shutdown.

```typescript
import { disposeAppInsights } from 'appinsights-rest'

await disposeAppInsights()
```

#### `trackDependency(event, name, target, type, fn)`

Track external dependencies (API calls, database queries, etc.) with automatic timing and error handling.

```typescript
import { trackDependency } from 'appinsights-rest'

const result = await trackDependency(
  event,
  'Database Query',
  'users-db',
  'SQL',
  async () => {
    return await db.query('SELECT * FROM users')
  }
)
```

**Dependency Types:**
- `'HTTP'` - External HTTP/REST API calls
- `'SQL'` - Database queries
- `'Azure'` - Azure service calls (Storage, Cosmos DB, etc.)
- `'Other'` - Other dependencies

#### `trackEvent(event, eventName, properties?)`

Track custom events.

```typescript
import { trackEvent } from 'appinsights-rest'

trackEvent(event, 'user_registered', {
  userId: '123',
  plan: 'premium',
})
```

#### `trackMetric(event, metricName, value, properties?)`

Track custom metrics.

```typescript
import { trackMetric } from 'appinsights-rest'

trackMetric(event, 'queue_length', 42, {
  queueName: 'processing',
})
```

#### `trackException(event, error, properties?)`

Track exceptions and errors.

```typescript
import { trackException } from 'appinsights-rest'

try {
  // your code
} catch (error) {
  trackException(event, error as Error, {
    operation: 'user_registration',
  })
  throw error
}
```

#### `withErrorTracking(event, handler)`

Wrap async functions to automatically track exceptions.

```typescript
import { withErrorTracking } from 'appinsights-rest'

export default defineEventHandler(async (event) => {
  return await withErrorTracking(event, async () => {
    // Your code here - exceptions will be tracked automatically
    return { success: true }
  })
})
```

### Utility Functions

#### `createRequestId(operationId?)`

Generate an Application Insights compatible request ID.

```typescript
import { createRequestId } from 'appinsights-rest'

const requestId = createRequestId()
// Returns: "|abc123...def456"
```

#### `createDependencyId(operationId?)`

Generate an Application Insights compatible dependency ID.

```typescript
import { createDependencyId } from 'appinsights-rest'

const dependencyId = createDependencyId()
```

#### `generateGuid()`

Generate a GUID (v4 UUID format).

```typescript
import { generateGuid } from 'appinsights-rest'

const guid = generateGuid()
// Returns: "550e8400-e29b-41d4-a716-446655440000"
```

#### `formatDuration(ms)`

Format duration in milliseconds to Application Insights format.

```typescript
import { formatDuration } from 'appinsights-rest'

const duration = formatDuration(1500)
// Returns: "00:00:01.500"
```

## Advanced Usage

### Direct Logger Access

For advanced use cases, you can use the `AppInsightsLogger` class directly:

```typescript
import { AppInsightsLogger } from 'appinsights-rest'

const logger = new AppInsightsLogger({
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  role: 'my-app',
  appVersion: '1.0.0',
  batchSize: 16,
  flushIntervalMs: 1000,
})

// Track telemetry
logger.trackEvent('custom_event', { foo: 'bar' })
logger.trackRequest({
  name: 'GET /api/users',
  url: 'https://example.com/api/users',
  duration: 150,
  responseCode: 200,
  success: true,
})

// Clean up
await logger.dispose()
```

### Correlation and Distributed Tracing

Correlation IDs are automatically managed when using helper functions:

```typescript
// In your API handler
export default defineEventHandler(async (event) => {
  // The middleware sets event.context.appInsights.requestId

  // trackDependency automatically uses the request ID for correlation
  const data = await trackDependency(event, 'API Call', 'api.example.com', 'HTTP', async () => {
    return await fetch('https://api.example.com/data').then(r => r.json())
  })

  // trackEvent also includes correlation
  trackEvent(event, 'operation_completed', { status: 'success' })

  return { data }
})
```

### Custom Properties

Add custom properties to any telemetry:

```typescript
trackEvent(event, 'user_action', {
  userId: '123',
  sessionId: 'abc',
  customDimension: 'value',
})

trackException(event, error, {
  errorCode: 'ERR_001',
  userId: '123',
  endpoint: '/api/users',
})
```

## Configuration

### Connection String

Get your connection string from the Azure Portal:

1. Navigate to your Application Insights resource
2. Go to **Overview** page
3. Copy the **Connection String**
4. Format: `InstrumentationKey=xxx;IngestionEndpoint=https://xxx.applicationinsights.azure.com/`

### Batching and Performance

The library automatically batches telemetry for optimal performance:

- **Default batch size**: 16 items
- **Default flush interval**: 1000ms
- **Automatic retry**: 429 (rate limit) and 5xx errors
- **Exponential backoff**: Up to 60 seconds

You can customize these settings:

```typescript
initializeAppInsights(connectionString, {
  role: 'my-app',
  batchSize: 32,           // Larger batches (less frequent sends)
  flushIntervalMs: 5000,   // Flush every 5 seconds
})
```

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import type {
  AppInsightsConfig,
  TelemetryEnvelope,
  TrackRequestOptions,
  TrackDependencyOptions,
  Dict,
} from 'appinsights-rest'
```

## Other Frameworks

While optimized for Nuxt/Nitro, the library works with any Node.js framework:

### Express

```typescript
import express from 'express'
import { initializeAppInsights, getAppInsights, disposeAppInsights } from 'appinsights-rest'

const app = express()

// Initialize
initializeAppInsights(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING, {
  role: 'express-app',
})

// Middleware for request tracking
app.use((req, res, next) => {
  const logger = getAppInsights()
  const startTime = Date.now()

  res.on('finish', () => {
    logger?.trackRequest({
      name: `${req.method} ${req.path}`,
      url: req.url,
      duration: Date.now() - startTime,
      responseCode: res.statusCode,
      success: res.statusCode >= 200 && res.statusCode < 400,
    })
  })

  next()
})

// Cleanup on exit
process.on('SIGTERM', async () => {
  await disposeAppInsights()
  process.exit(0)
})
```

## Migration from Official SDK

If you're migrating from `applicationinsights` (the official SDK):

**Before (Official SDK):**
```typescript
import appInsights from 'applicationinsights'

appInsights.setup(connectionString).start()
const client = appInsights.defaultClient

client.trackEvent({ name: 'my_event' })
```

**After (appinsights-rest):**
```typescript
import { initializeAppInsights, getAppInsights } from 'appinsights-rest'

initializeAppInsights(connectionString, { role: 'my-app' })
const logger = getAppInsights()

logger?.trackEvent('my_event')
```

## Troubleshooting

### Logger not initialized

If you see warnings about logger not being initialized:

1. Check that `initializeAppInsights()` is called in your plugin
2. Verify the connection string is set in environment variables
3. Ensure the plugin runs before any API handlers

### Telemetry not appearing in Azure

1. Verify your connection string is correct
2. Check for console errors indicating invalid instrumentation key
3. Wait 2-5 minutes for telemetry to appear in Azure Portal
4. Check Application Insights Live Metrics for real-time validation

### Correlation not working

Ensure you're passing the `event` object to helper functions:

```typescript
// ✅ Correct
trackEvent(event, 'my_event')

// ❌ Wrong
trackEvent(null, 'my_event')
```

## License

MIT

## Repository

[https://github.com/mizukoshi-yuki/appinsights-rest](https://github.com/mizukoshi-yuki/appinsights-rest)

## Author

Yuki Mizukoshi

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
