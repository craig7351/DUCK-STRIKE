// GET /api/online — 目前在線人數（90 秒視窗）+ 歷史最高；順便清理過期紀錄。
import { Ctx, json } from './_lib'

export const onRequestGet = async ({ env }: Ctx): Promise<Response> => {
  const now = Date.now()
  try {
    const cur = await env.DB.prepare('SELECT COUNT(*) AS c FROM presence WHERE last_seen > ?').bind(now - 90_000).first<any>()
    const online = cur?.c || 0
    const st = await env.DB.prepare('SELECT peak_online FROM stats WHERE id=1').first<any>()
    let peak = st?.peak_online || 0
    if (online > peak) {
      peak = online
      await env.DB.prepare('UPDATE stats SET peak_online=?, peak_online_at=? WHERE id=1').bind(peak, now).run()
    }
    await env.DB.prepare('DELETE FROM presence WHERE last_seen < ?').bind(now - 600_000).run()
    return json({ online, peak })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}
