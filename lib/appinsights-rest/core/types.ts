// Core type definitions for Application Insights Logger

export type Dict = Record<string, any>

export interface AppInsightsConfig {
  connectionString: string
  role?: string
  appVersion?: string
  batchSize?: number
  flushIntervalMs?: number
}

export interface TelemetryEnvelope {
  name: string
  time: string
  iKey: string
  tags?: Record<string, string>
  data: {
    baseType: string
    baseData: any
  }
}

export interface TrackRequestOptions {
  id?: string
  name: string
  url: string
  duration: number
  responseCode: number
  success: boolean
  properties?: Dict
}

export interface TrackDependencyOptions {
  id?: string
  parentId?: string
  name: string
  data: string
  type: string
  target?: string
  duration: number
  resultCode: number
  success: boolean
  properties?: Dict
}
