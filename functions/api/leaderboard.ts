// GET /api/leaderboard?limit=10&difficulty=hard — 全球排行榜（分數由高到低，可依難度篩選）。
import { Ctx, json, clampInt, DIFFICULTIES } from './_lib'

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const url = new URL(request.url)
  const limit = clampInt(url.searchParams.get('limit') ?? 10, 1, 50)
  const difficulty = url.searchParams.get('difficulty') || ''

  try {
    const stmt = difficulty && DIFFICULTIES.includes(difficulty)
      ? env.DB.prepare(
          'SELECT name,score,wave,kills,difficulty,created_at FROM runs WHERE difficulty=? ORDER BY score DESC LIMIT ?',
        ).bind(difficulty, limit)
      : env.DB.prepare(
          'SELECT name,score,wave,kills,difficulty,created_at FROM runs ORDER BY score DESC LIMIT ?',
        ).bind(limit)
    const { results } = await stmt.all<any>()
    return json(
      (results || []).map((r) => ({
        name: r.name, score: r.score, wave: r.wave, kills: r.kills, difficulty: r.difficulty, at: r.created_at,
      })),
    )
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
}
