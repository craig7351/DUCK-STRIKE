// /api/messages — 留言板：GET 取最新 100 則、POST 發表/回覆、DELETE 刪除（需管理鍵）。
import { Ctx, json, clampInt, sanitizeText } from './_lib'

const DELETE_KEY = '7351'   // 管理鍵（刪留言）

export const onRequestGet = async ({ env }: Ctx): Promise<Response> => {
  try {
    const { results } = await env.DB.prepare(
      'SELECT id,name,text,parent_id,created_at FROM messages ORDER BY id DESC LIMIT 100',
    ).all<any>()
    return json((results || []).map((m) => ({ id: m.id, name: m.name, text: m.text, parentId: m.parent_id, at: m.created_at })))
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let b: any
  try { b = await request.json() } catch { return json({ ok: false }, 400) }
  const name = sanitizeText(b.name, 16)
  const text = sanitizeText(b.text, 200)
  const parentId = clampInt(b.parentId, 0, 2_000_000_000)
  const deviceId = sanitizeText(b.deviceId, 64)
  if (!name || !text) return json({ ok: false, error: 'empty' }, 400)
  try {
    await env.DB.prepare(
      'INSERT INTO messages (name,text,device_id,parent_id,created_at) VALUES (?,?,?,?,?)',
    ).bind(name, text, deviceId, parentId, Date.now()).run()
    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
}

export const onRequestDelete = async ({ request, env }: Ctx): Promise<Response> => {
  const url = new URL(request.url)
  const id = clampInt(url.searchParams.get('id'), 1, 2_000_000_000)
  const key = url.searchParams.get('key') || ''
  if (key !== DELETE_KEY) return json({ ok: false, error: 'bad key' }, 403)
  try {
    await env.DB.prepare('DELETE FROM messages WHERE id=? OR parent_id=?').bind(id, id).run()
    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
}
