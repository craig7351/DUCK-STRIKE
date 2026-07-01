# 全球後端（排行榜 / 留言板 / 在線人數）

技術：**Cloudflare Pages Functions + D1（SQLite）**。前端無後端時自動退回本地（`vite dev` 仍可玩，排行榜顯示本機、留言板停用）。

## 架構
- `functions/api/*.ts` → 部署後成為 `/api/*` 端點：
  - `POST /api/run`：提交成績（name/score/wave/kills/difficulty）
  - `GET  /api/leaderboard?limit=&difficulty=`：全球排行榜（分數降冪，可篩難度）
  - `GET|POST|DELETE /api/messages`：留言板（兩層回覆；刪除需管理鍵，預設 `7351`，見 `messages.ts`）
  - `GET  /api/stats`：累積場次 / 總擊殺 / 最高在線
  - `GET  /api/online`、`POST /api/heartbeat`：即時在線人數（90 秒視窗）
- `schema.sql`：D1 資料表（runs / stats / presence / online_hourly / messages）
- `wrangler.jsonc`：D1 綁定 `DB`（部署前需填 `database_id`）
- 前端 client：`src/game/api.ts`（暱稱/deviceId 存 localStorage）

## 本地全端測試（含 /api）
純 `pnpm dev`（vite，5200）**沒有** `/api`，會走本地 fallback。要測後端：
```bash
pnpm install                 # 首次：安裝含 wrangler
pnpm build                   # 產生 dist/
pnpm db:local                # 建立本地 D1 並套用 schema
pnpm pages:dev               # wrangler pages dev dist（提供 /api + 靜態檔）
```

## 部署到 Cloudflare Pages
```bash
# 1) 建資料庫，把回傳的 database_id 填進 wrangler.jsonc
wrangler d1 create duck-strike-db

# 2) 套用 schema 到線上
pnpm db:remote               # = wrangler d1 execute duck-strike-db --file=./schema.sql --remote

# 3) 建置 + 部署
pnpm deploy                  # = vite build && wrangler pages deploy dist
```
或用 Dashboard 接 GitHub repo 自動部署，並於 Pages → Settings → Functions → D1 綁定 `DB` = `duck-strike-db`。
（需先 `wrangler login`。）

## 安全 / 防作弊（輕量）
- 後端 `clampInt` / `sanitizeText`（`functions/api/_lib.ts`）夾制數值範圍、去角括號與控制字元。
- 刪留言需管理鍵。可視需要加更嚴格的成績驗證。
