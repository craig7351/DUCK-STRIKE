// ============================================================================
// _lib.ts — Pages Functions 共用：D1 型別 stub（免裝 workers-types）、回應與清洗。
// ============================================================================

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>
}
export interface Env { DB: D1Database }
export interface Ctx { request: Request; env: Env }

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

/** 去除角括號與控制字元、trim、限長，避免 XSS 與髒資料。 */
export function sanitizeText(v: unknown, maxLen: number): string {
  const raw = String(v ?? '').replace(/[<>]/g, '')
  let out = ''
  for (const ch of raw) {
    const c = ch.charCodeAt(0)
    out += c < 32 || c === 127 ? ' ' : ch   // 控制字元換成空白
  }
  return out.trim().slice(0, maxLen)
}

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'hell']
