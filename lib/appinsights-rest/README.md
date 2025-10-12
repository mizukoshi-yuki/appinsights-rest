# appinsights-rest

A lightweight, framework-independent Application Insights REST API client for Node.js applications, optimized for Nuxt 4 and other modern frameworks.

## Features

- Framework-independent core with optional Nuxt integration
- Full telemetry support (events, requests, dependencies, exceptions, traces, metrics)
- Automatic batching and retry with exponential backoff
- TypeScript support with full type definitions
- Zero external dependencies for core functionality
- Correlation ID support for distributed tracing

## Installation

```bash
npm install appinsights-rest
```

## Quick Start

### Basic Usage

```typescript
import { AppInsightsLogger } from 'appinsights-rest'

// Initialize the logger
const logger = new AppInsightsLogger({
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  role: 'my-app',
  appVersion: '1.0.0'
})

// Track an event (synchronous - queued for batching)
logger.trackEvent('user_login', {
  userId: '123',
  method: 'oauth'
})

// Track a request (synchronous - returns request ID)
const requestId = logger.trackRequest({
  name: 'GET /api/users',
  url: 'https://example.com/api/users',
  duration: 150,
  responseCode: 200,
  success: true
})

// Track an exception (synchronous - queued for batching)
try {
  // some code
} catch (error) {
  logger.trackException(error, {
    context: 'user_registration'
  })
}

// Clean up when done (async - waits for flush)
await logger.dispose()
```

## Getting Your Connection String

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to your Application Insights resource
3. Copy the **Connection String** from the Overview page
4. It should look like: `InstrumentationKey=xxx;IngestionEndpoint=https://xxx.applicationinsights.azure.com/`

## API Reference

### Constructor Options

```typescript
interface AppInsightsConfig {
  connectionString: string    // Required: Azure Application Insights connection string
  role?: string              // Optional: Application role name (default: 'web-portal')
  appVersion?: string        // Optional: Application version
  batchSize?: number         // Optional: Batch size for telemetry (default: 16)
  flushIntervalMs?: number   // Optional: Flush interval in ms (default: 1000)
}
```

### Tracking Methods

#### `trackEvent(name, properties?): void`
Track custom events. Synchronous - telemetry is queued and sent in batches.

```typescript
logger.trackEvent('button_clicked', {
  buttonId: 'submit',
  page: 'checkout'
})
```

#### `trackRequest(options): string`
Track HTTP requests. Returns the request ID. Synchronous - telemetry is queued and sent in batches.

```typescript
const requestId = logger.trackRequest({
  name: 'GET /api/users',
  url: 'https://example.com/api/users',
  duration: 150,            // in milliseconds
  responseCode: 200,
  success: true,
  properties: {
    userId: '123'
  }
})
```

#### `trackDependency(options): string`
Track dependencies (external API calls, database queries, etc.). Returns the dependency ID. Synchronous - telemetry is queued and sent in batches.

```typescript
const dependencyId = logger.trackDependency({
  name: 'GET external-api',
  data: 'https://api.example.com/data',
  type: 'HTTP',
  target: 'api.example.com',
  duration: 250,
  resultCode: 200,
  success: true
})
```

#### `trackException(error, properties?): void`
Track exceptions and errors. Synchronous - telemetry is queued and sent in batches.

```typescript
logger.trackException(new Error('Something went wrong'), {
  userId: '123',
  operation: 'checkout'
})
```

#### `trackTrace(message, severityLevel?, properties?): void`
Track trace messages. Synchronous - telemetry is queued and sent in batches.

```typescript
logger.trackTrace('User authenticated', 1, {
  userId: '123'
})
```

Severity levels:
- `0` - Verbose
- `1` - Information (default)
- `2` - Warning
- `3` - Error
- `4` - Critical

#### `trackMetric(name, value, properties?): void`
Track custom metrics. Synchronous - telemetry is queued and sent in batches.

```typescript
logger.trackMetric('response_time', 245, {
  endpoint: '/api/users'
})
```

#### `dispose(): Promise<void>`
Flush remaining telemetry and clean up resources. Async - waits for all telemetry to be sent. Always call this before your application exits.

```typescript
await logger.dispose()
```

## Utility Functions

```typescript
import {
  generateGuid,
  createRequestId,
  createDependencyId,
  formatDuration
} from 'appinsights-rest'

// Generate a GUID
const guid = generateGuid()

// Create Application Insights compatible IDs
const reqId = createRequestId()
const depId = createDependencyId()

// Format duration for Application Insights
const duration = formatDuration(1500) // "00:00:01.500"
```

## Advanced Features

### Correlation IDs

Pass correlation IDs in properties to link related telemetry:

```typescript
const correlationId = generateGuid()

logger.trackRequest({
  name: 'GET /api/users',
  url: 'https://example.com/api/users',
  duration: 150,
  responseCode: 200,
  success: true,
  properties: {
    correlationId
  }
})

logger.trackDependency({
  name: 'Database Query',
  data: 'SELECT * FROM users',
  type: 'SQL',
  duration: 50,
  resultCode: 200,
  success: true,
  properties: {
    correlationId
  }
})
```

### Batching and Retries

The logger automatically batches telemetry and retries failed requests with exponential backoff:

- Default batch size: 16 items
- Default flush interval: 1000ms
- Automatic retry for 429 (rate limit) and 5xx errors
- Exponential backoff up to 60 seconds

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import type {
  AppInsightsConfig,
  TelemetryEnvelope,
  TrackRequestOptions,
  TrackDependencyOptions,
  Dict
} from 'appinsights-rest'
```

## License

MIT

## Repository

[https://github.com/mizukoshi-yuki/appinsights-rest](https://github.com/mizukoshi-yuki/appinsights-rest)

## Author

Yuki Mizukoshi
