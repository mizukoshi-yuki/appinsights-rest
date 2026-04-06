// Utility functions for Application Insights Logger

// W3C trace context identifier widths.
// Application Insights' legacy hierarchical ID format uses a 32-char trace
// portion and (historically) an 8-char span portion separated by '.'.
// @see https://www.w3.org/TR/trace-context/#trace-id
const TRACE_ID_HEX_LEN = 32
const SPAN_ID_HEX_LEN = 8

// Duration formatting constants for App Insights' `HH:MM:SS.mmm` field.
const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const HHMMSS_PAD_WIDTH = 2 // hours/minutes/seconds are 2-digit zero-padded
const MILLIS_PAD_WIDTH = 3 // milliseconds are 3-digit zero-padded

/**
 * Generate a UUID v4 using the Web Crypto API.
 *
 * Backed by `globalThis.crypto.randomUUID()`, which is available in
 * Node.js >= 19 (stable; experimental on 18) and every modern browser in a
 * secure (HTTPS) context. RFC 4122 v4 with cryptographic randomness.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 */
export function generateGuid(): string {
  return globalThis.crypto.randomUUID()
}

/**
 * Generate a random lowercase hex string of the given length using
 * `crypto.getRandomValues`. Used to mint trace and span identifiers.
 */
function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  globalThis.crypto.getRandomValues(bytes)
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex.slice(0, length)
}

/**
 * Build an Application Insights operation ID in the legacy hierarchical
 * format `|<traceId>.<spanId>`. If a correlation/operation ID is supplied,
 * its hyphen-stripped form is reused as the trace portion so that requests
 * and their child dependencies share the same trace.
 */
function buildAppInsightsId(operationId?: string): string {
  const trimmed = operationId?.replace(/-/g, '') ?? ''
  const traceId = trimmed || randomHex(TRACE_ID_HEX_LEN)
  return `|${traceId}.${randomHex(SPAN_ID_HEX_LEN)}`
}

/**
 * Create a Request ID in the Application Insights legacy format.
 * @param operationId - Optional correlation ID to embed as the trace portion.
 */
export function createRequestId(operationId?: string): string {
  return buildAppInsightsId(operationId)
}

/**
 * Create a Dependency ID in the Application Insights legacy format.
 * @param operationId - Optional parent correlation ID to embed as the trace portion.
 */
export function createDependencyId(operationId?: string): string {
  return buildAppInsightsId(operationId)
}

/**
 * Format a duration as the Application Insights duration string
 * `HH:MM:SS.mmm`. This is the on-the-wire format used by the
 * RequestData / RemoteDependencyData `duration` fields — it is **not**
 * ISO 8601 duration (`PT…`).
 *
 * @param ms - Duration in milliseconds.
 */
export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / MS_PER_HOUR)
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE)
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND)
  const millis = ms % MS_PER_SECOND

  const hh = String(hours).padStart(HHMMSS_PAD_WIDTH, '0')
  const mm = String(minutes).padStart(HHMMSS_PAD_WIDTH, '0')
  const ss = String(seconds).padStart(HHMMSS_PAD_WIDTH, '0')
  const mmm = String(millis).padStart(MILLIS_PAD_WIDTH, '0')
  return `${hh}:${mm}:${ss}.${mmm}`
}
