import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppInsightsLogger } from './client'

const VALID_CONNECTION_STRING =
  'InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://example.applicationinsights.azure.com/'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AppInsightsLogger construction', () => {
  test('constructs successfully with a valid connection string', async () => {
    const logger = new AppInsightsLogger({ connectionString: VALID_CONNECTION_STRING })
    // Dispose so that the setInterval handle does not keep the test process alive.
    await logger.dispose()
  })

  test('throws when the connection string is missing the InstrumentationKey field', () => {
    expect(
      () =>
        new AppInsightsLogger({
          connectionString: 'IngestionEndpoint=https://example.applicationinsights.azure.com/',
        }),
    ).toThrow(/InstrumentationKey/)
  })

  test('throws when the connection string is missing the IngestionEndpoint field', () => {
    expect(
      () =>
        new AppInsightsLogger({
          connectionString: 'InstrumentationKey=00000000-0000-0000-0000-000000000000',
        }),
    ).toThrow(/IngestionEndpoint/)
  })

  test('error message does not leak the full connection string', () => {
    const leakyConnectionString =
      'IngestionEndpoint=https://secret-tenant.applicationinsights.azure.com/'
    try {
      new AppInsightsLogger({ connectionString: leakyConnectionString })
      throw new Error('expected AppInsightsLogger constructor to throw')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      expect(message).not.toContain(leakyConnectionString)
      expect(message).not.toContain('secret-tenant')
    }
  })

  test('throws with a clear message when batchSize is invalid', () => {
    expect(
      () =>
        new AppInsightsLogger({
          connectionString: VALID_CONNECTION_STRING,
          batchSize: 0,
        }),
    ).toThrow(/batchSize/)
  })

  test('throws with a clear message when flushIntervalMs is invalid', () => {
    expect(
      () =>
        new AppInsightsLogger({
          connectionString: VALID_CONNECTION_STRING,
          flushIntervalMs: 0,
        }),
    ).toThrow(/flushIntervalMs/)
  })

  test('throws with a clear message when maxQueueSize is invalid', () => {
    expect(
      () =>
        new AppInsightsLogger({
          connectionString: VALID_CONNECTION_STRING,
          maxQueueSize: 0,
        }),
    ).toThrow(/maxQueueSize/)
  })
})

describe('AppInsightsLogger.dispose', () => {
  test('is idempotent — a second dispose call is a no-op', async () => {
    const logger = new AppInsightsLogger({ connectionString: VALID_CONNECTION_STRING })
    await logger.dispose()
    await expect(logger.dispose()).resolves.toBeUndefined()
  })

  test('track* calls after dispose are silently dropped instead of queueing', async () => {
    const logger = new AppInsightsLogger({ connectionString: VALID_CONNECTION_STRING })
    await logger.dispose()
    logger.trackEvent('eventAfterDispose')
    logger.trackTrace('traceAfterDispose')
    logger.trackMetric('metricAfterDispose', 1)
    // `queue` is a private field; the test reaches into it to confirm the
    // enqueue path guarded correctly instead of growing the queue on a
    // disposed logger.
    const internals = logger as unknown as { queue: unknown[] }
    expect(internals.queue).toHaveLength(0)
  })
})

describe('AppInsightsLogger browser-environment guard', () => {
  test('construction succeeds when process is undefined (browser runtime)', async () => {
    // Simulate a browser bundle where Vite has not polyfilled `process`.
    // Before the fix, `buildCommonTags` dereferenced `process.env` directly
    // and would throw `ReferenceError: process is not defined`.
    vi.stubGlobal('process', undefined)
    const logger = new AppInsightsLogger({ connectionString: VALID_CONNECTION_STRING })
    await logger.dispose()
  })
})
