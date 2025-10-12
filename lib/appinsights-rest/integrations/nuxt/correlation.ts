// Correlation ID management for Nuxt/H3

import { H3Event, getHeader, setHeader } from 'h3'
import { randomUUID } from 'crypto'

// Symbol key for storing correlation ID
const CORRELATION_ID_KEY = Symbol('correlationId')

/**
 * Get or create Correlation ID from request
 * Retrieved from "x-cid" header, or generates a new one if not present
 */
export function getOrCreateCorrelationId(event: H3Event): string {
  // Reuse if already set
  const existing = (event.context as any)[CORRELATION_ID_KEY]
  if (existing) {
    return existing
  }

  // Try to get from header
  const headerCid = getHeader(event, 'x-cid')
  const cid = headerCid || randomUUID()

  // Save to context
  ;(event.context as any)[CORRELATION_ID_KEY] = cid

  // Set response header
  setHeader(event, 'x-cid', cid)

  return cid
}

/**
 * Get the current request's Correlation ID
 */
export function getCorrelationId(event: H3Event): string | undefined {
  return (event.context as any)[CORRELATION_ID_KEY]
}
