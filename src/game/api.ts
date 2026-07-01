// ============================================================================
// api.ts — 前端全球後端 client（Cloudflare Pages Functions + D1）。
// 無後端（純 vite dev / 未部署）時所有呼叫回 null / false，由 UI 自動退回本地。
// 判斷方式：非 JSON 回應（vite dev SPA fallback 會回 index.html）即視為離線。
// ============================================================================

const NAME_KEY = 'ds:name'
const DEVICE_KEY = 'ds:deviceId'

export function getPlayerName(): string {
  try { return (localStorage.getItem(NAME_KEY) || '').trim() } catch { return '' }
}
export function setPlayerName(name: string) {
  try { localStorage.setItem(NAME_KEY, name.trim().slice(0, 16)) } catch { /* ignore */ }
}
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now().toString(36)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch { return 'anon' }
}

export interface LeaderRow { name: string; score: number; wave: number; kills: number; difficulty: string; at: number }
export interface Msg { id: number; name: string; text: string; parentId: number; at: number }
export interface GlobalStats { plays: number; totalKills: number; peakOnline: number }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } })
    if (!r.ok) return null
    if (!(r.headers.get('content-type') || '').includes('application/json')) return null
    return (await r.json()) as T
  } catch { return null }
}
async function postJson(url: string, body: unknown): Promise<any | null> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!(r.headers.get('content-type') || '').includes('application/json')) return null
    return await r.json()
  } catch { return null }
}

export function submitScore(run: { name: string; score: number; wave: number; kills: number; difficulty: string }) {
  void postJson('/api/run', { ...run, deviceId: getDeviceId() })   // fire-and-forget
}
export function fetchLeaderboard(limit = 10, difficulty?: string): Promise<LeaderRow[] | null> {
  const q = new URLSearchParams({ limit: String(limit) })
  if (difficulty) q.set('difficulty', difficulty)
  return getJson<LeaderRow[]>(`/api/leaderboard?${q.toString()}`)
}
export function fetchMessages(): Promise<Msg[] | null> { return getJson<Msg[]>('/api/messages') }
export async function postMessage(name: string, text: string, parentId = 0): Promise<boolean> {
  const r = await postJson('/api/messages', { name, text, parentId, deviceId: getDeviceId() })
  return !!(r && r.ok)
}
export async function deleteMessage(id: number, key: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/messages?id=${id}&key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    if (!(r.headers.get('content-type') || '').includes('application/json')) return false
    return !!(await r.json()).ok
  } catch { return false }
}
export function sendHeartbeat() { void postJson('/api/heartbeat', { deviceId: getDeviceId() }) }
export function fetchOnline(): Promise<{ online: number; peak: number } | null> { return getJson('/api/online') }
export function fetchStats(): Promise<GlobalStats | null> { return getJson<GlobalStats>('/api/stats') }
