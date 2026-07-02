// POST /api/run — 提交一場成績到排行榜，並累加全站統計。
import { Ctx, json, clampInt, sanitizeText, verifyTurnstile, DIFFICULTIES } from './_lib'

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let b: any
  try { b = await request.json() } catch { return json({ error: 'bad json' }, 400) }
  if (!(await verifyTurnstile(b.token, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP')))) {
    return json({ error: 'turnstile' }, 403)
  }

  const name = sanitizeText(b.name, 16) || '鴨鴨'
  const difficulty = DIFFICULTIES.includes(b.difficulty) ? b.difficulty : 'normal'
  const score = clampInt(b.score, 0, 100_000_000)
  const wave = clampInt(b.wave, 0, 100_000)
  const kills = clampInt(b.kills, 0, 1_000_000)
  const deviceId = sanitizeText(b.deviceId, 64)

  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO runs (device_id,name,score,wave,kills,difficulty,created_at) VALUES (?,?,?,?,?,?,?)',
      ).bind(deviceId, name, score, wave, kills, difficulty, Date.now()),
      env.DB.prepare('UPDATE stats SET plays=plays+1, total_kills=total_kills+? WHERE id=1').bind(kills),
    ])
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}
