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

// RFC 4122 v4 bit positions. Byte 6's high nibble is set to 0100 (version 4),
// and byte 8's top two bits are set to 10 (variant 10, the RFC 4122 layout).
// @see https://datatracker.ietf.org/doc/html/rfc4122#section-4.4
const UUID_V4_BYTE_COUNT = 16
const UUID_V4_VERSION_BYTE_INDEX = 6
const UUID_V4_VARIANT_BYTE_INDEX = 8
const UUID_V4_VERSION_MASK = 0x0f
const UUID_V4_VERSION_BITS = 0x40
const UUID_V4_VARIANT_MASK = 0x3f
const UUID_V4_VARIANT_BITS = 0x80

/**
 * Generate a UUID v4.
 *
 * Prefers `globalThis.crypto.randomUUID()` when available — Node.js >= 19
 * (stable) and every modern browser in a secure (HTTPS) context. For older
 * runtimes and insecure-context browsers where `randomUUID` is missing, falls
 * back to `crypto.getRandomValues()` with RFC 4122 bit manipulation so the
 * library still returns a well-formed v4 UUID instead of throwing.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 * @see https://datatracker.ietf.org/doc/html/rfc4122#section-4.4
 */
export function generateGuid(): string {
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }
  return buildUuidV4FromRandomBytes()
}

/**
 * Build a UUID v4 from 16 cryptographically random bytes, setting the version
 * and variant bits per RFC 4122 section 4.4. Used as a fallback when the host
 * environment does not expose `crypto.randomUUID()`.
 */
function buildUuidV4FromRandomBytes(): string {
  const bytes = new Uint8Array(UUID_V4_BYTE_COUNT)
  globalThis.crypto.getRandomValues(bytes)
  bytes[UUID_V4_VERSION_BYTE_INDEX] =
    ((bytes[UUID_V4_VERSION_BYTE_INDEX] ?? 0) & UUID_V4_VERSION_MASK) | UUID_V4_VERSION_BITS
  bytes[UUID_V4_VARIANT_BYTE_INDEX] =
    ((bytes[UUID_V4_VARIANT_BYTE_INDEX] ?? 0) & UUID_V4_VARIANT_MASK) | UUID_V4_VARIANT_BITS
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
