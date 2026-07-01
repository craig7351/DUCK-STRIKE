// GET /api/stats — 全站累積統計（場次、總擊殺、歷史最高在線）。
import { Ctx, json } from './_lib'

export const onRequestGet = async ({ env }: Ctx): Promise<Response> => {
  try {
    const row = await env.DB.prepare('SELECT plays,total_kills,peak_online FROM stats WHERE id=1').first<any>()
    return json({ plays: row?.plays || 0, totalKills: row?.total_kills || 0, peakOnline: row?.peak_online || 0 })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}
