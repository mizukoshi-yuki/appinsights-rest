// Utility functions for Application Insights Logger

/**
 * Generate a GUID (UUID v4 format)
 */
export function generateGuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Create Request ID in Application Insights format
 * @param operationId - Optional operation ID (correlation ID)
 */
export function createRequestId(operationId?: string): string {
  const base = (operationId ?? '').replace(/-/g, '') || (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 32)
  const suffix = Math.random().toString(16).slice(2, 10)
  return `|${base}.${suffix}`
}

/**
 * Create Dependency ID in Application Insights format
 * @param operationId - Optional operation ID (correlation ID)
 */
export function createDependencyId(operationId?: string): string {
  const base = operationId?.replace(/-/g, '') ?? generateGuid().replace(/-/g, '')
  const suffix = Math.random().toString(16).slice(2, 10)
  return `|${base}.${suffix}`
}

/**
 * Format duration in ISO 8601 format (HH:MM:SS.mmm)
 * @param ms - Duration in milliseconds
 */
export function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const milli = ms % 1000
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${milli.toString().padStart(3,'0')}`
}
