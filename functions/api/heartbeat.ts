// POST /api/heartbeat — 遊玩中定時回報（~60s），標記自己在線並更新峰值。
import { Ctx, json, sanitizeText } from './_lib'

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let b: any
  try { b = await request.json() } catch { return json({ ok: false }, 400) }
  const deviceId = sanitizeText(b.deviceId, 64)
  if (!deviceId) return json({ ok: false }, 400)
  const now = Date.now()
  try {
    await env.DB.prepare(
      'INSERT INTO presence (device_id,last_seen) VALUES (?,?) ON CONFLICT(device_id) DO UPDATE SET last_seen=?',
    ).bind(deviceId, now, now).run()

    const cur = await env.DB.prepare('SELECT COUNT(*) AS c FROM presence WHERE last_seen > ?').bind(now - 90_000).first<any>()
    const online = cur?.c || 0
    const st = await env.DB.prepare('SELECT peak_online FROM stats WHERE id=1').first<any>()
    if (online > (st?.peak_online || 0)) {
      await env.DB.prepare('UPDATE stats SET peak_online=?, peak_online_at=? WHERE id=1').bind(online, now).run()
    }
    const hour = Math.floor(now / 3_600_000)
    await env.DB.prepare(
      'INSERT INTO online_hourly (hour,peak) VALUES (?,?) ON CONFLICT(hour) DO UPDATE SET peak=MAX(peak,?)',
    ).bind(hour, online, online).run()
    return json({ ok: true, online })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
}
