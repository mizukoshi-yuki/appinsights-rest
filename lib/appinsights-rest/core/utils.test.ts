import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createDependencyId,
  createRequestId,
  formatDuration,
  generateGuid,
} from './utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

// RFC 4122 v4 UUID: 8-4-4-4-12 hex with version nibble 4 and variant nibble [89ab].
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// App Insights legacy hierarchical ID: "|<32-hex-trace>.<8-hex-span>".
const APP_INSIGHTS_ID_PATTERN = /^\|[0-9a-f]{32}\.[0-9a-f]{8}$/

describe('formatDuration', () => {
  test('formats zero as 00:00:00.000', () => {
    expect(formatDuration(0)).toBe('00:00:00.000')
  })

  test('formats 1500ms as 00:00:01.500', () => {
    expect(formatDuration(1500)).toBe('00:00:01.500')
  })

  test('formats exactly one hour as 01:00:00.000', () => {
    expect(formatDuration(60 * 60 * 1000)).toBe('01:00:00.000')
  })

  test('formats 90 minutes 15.123 seconds as 01:30:15.123', () => {
    expect(formatDuration(90 * 60 * 1000 + 15 * 1000 + 123)).toBe('01:30:15.123')
  })

  test('pads millisecond component to three digits', () => {
    expect(formatDuration(7)).toBe('00:00:00.007')
  })
})

describe('generateGuid', () => {
  test('returns a well-formed RFC 4122 v4 UUID', () => {
    expect(generateGuid()).toMatch(UUID_V4_PATTERN)
  })

  test('returns unique values on successive calls', () => {
    const first = generateGuid()
    const second = generateGuid()
    expect(first).not.toBe(second)
  })

  test('falls back to getRandomValues when randomUUID is unavailable', () => {
    // Simulate a runtime (older Node, insecure-context browser) where
    // `crypto.randomUUID` is missing but `crypto.getRandomValues` exists.
    const realCrypto = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    })
    expect(generateGuid()).toMatch(UUID_V4_PATTERN)
  })

  test('fallback still yields unique values across calls', () => {
    const realCrypto = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    })
    expect(generateGuid()).not.toBe(generateGuid())
  })
})

describe('createRequestId', () => {
  test('returns a well-formed App Insights legacy ID', () => {
    expect(createRequestId()).toMatch(APP_INSIGHTS_ID_PATTERN)
  })

  test('reuses an operation ID (hyphens stripped) as the trace portion', () => {
    const operationId = '12345678-1234-1234-1234-123456789abc'
    const requestId = createRequestId(operationId)
    expect(requestId).toMatch(/^\|12345678123412341234123456789abc\.[0-9a-f]{8}$/)
  })

  test('generates a fresh trace portion when operation ID is omitted', () => {
    const first = createRequestId()
    const second = createRequestId()
    expect(first).not.toBe(second)
  })

  test('generates a fresh trace portion when operation ID is an empty string', () => {
    expect(createRequestId('')).toMatch(APP_INSIGHTS_ID_PATTERN)
  })
})

describe('createDependencyId', () => {
  test('returns a well-formed App Insights legacy ID', () => {
    expect(createDependencyId()).toMatch(APP_INSIGHTS_ID_PATTERN)
  })

  test('shares the trace portion with the parent operation ID', () => {
    const operationId = '12345678-1234-1234-1234-123456789abc'
    const dependencyId = createDependencyId(operationId)
    expect(dependencyId).toMatch(/^\|12345678123412341234123456789abc\.[0-9a-f]{8}$/)
  })
})
