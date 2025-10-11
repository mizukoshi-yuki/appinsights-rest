// Correlation ID management for Nuxt/H3

import { H3Event, getHeader, setHeader } from 'h3'
import { randomUUID } from 'crypto'

// Correlation ID用のシンボルキー
const CORRELATION_ID_KEY = Symbol('correlationId')

/**
 * リクエストからCorrelation IDを取得または生成
 * ヘッダー「x-cid」から取得、なければ新規生成
 */
export function getOrCreateCorrelationId(event: H3Event): string {
  // 既に設定されている場合は再利用
  const existing = (event.context as any)[CORRELATION_ID_KEY]
  if (existing) {
    return existing
  }

  // ヘッダーから取得を試みる
  const headerCid = getHeader(event, 'x-cid')
  const cid = headerCid || randomUUID()

  // コンテキストに保存
  ;(event.context as any)[CORRELATION_ID_KEY] = cid

  // レスポンスヘッダーにも設定
  setHeader(event, 'x-cid', cid)

  return cid
}

/**
 * 現在のリクエストのCorrelation IDを取得
 */
export function getCorrelationId(event: H3Event): string | undefined {
  return (event.context as any)[CORRELATION_ID_KEY]
}
