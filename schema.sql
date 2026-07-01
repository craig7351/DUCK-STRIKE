-- DUCK STRIKE 全球後端資料庫（Cloudflare D1 / SQLite）
-- 套用：wrangler d1 execute duck-strike-db --file=./schema.sql --local   （本地）
--       wrangler d1 execute duck-strike-db --file=./schema.sql --remote  （線上）

-- 排行榜：每場結束的一筆成績（波次生存 FPS）
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  TEXT    NOT NULL DEFAULT '',
  name       TEXT    NOT NULL DEFAULT '鴨鴨',
  score      INTEGER NOT NULL DEFAULT 0,
  wave       INTEGER NOT NULL DEFAULT 0,
  kills      INTEGER NOT NULL DEFAULT 0,
  difficulty TEXT    NOT NULL DEFAULT 'normal',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_runs_score ON runs(score DESC);
CREATE INDEX IF NOT EXISTS idx_runs_diff  ON runs(difficulty, score DESC);

-- 全站累積統計（單列 id=1）
CREATE TABLE IF NOT EXISTS stats (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  plays          INTEGER NOT NULL DEFAULT 0,
  total_kills    INTEGER NOT NULL DEFAULT 0,
  peak_online    INTEGER NOT NULL DEFAULT 0,
  peak_online_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO stats (id, plays, total_kills, peak_online, peak_online_at) VALUES (1, 0, 0, 0, 0);

-- 即時在線（心跳，90 秒視窗）
CREATE TABLE IF NOT EXISTS presence (
  device_id TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL DEFAULT 0
);

-- 每小時在線峰值（歷史圖表用）
CREATE TABLE IF NOT EXISTS online_hourly (
  hour INTEGER PRIMARY KEY,
  peak INTEGER NOT NULL DEFAULT 0
);

-- 留言板（兩層：parent_id=0 為主留言，>0 為回覆）
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL DEFAULT '鴨鴨',
  text       TEXT    NOT NULL DEFAULT '',
  device_id  TEXT    NOT NULL DEFAULT '',
  parent_id  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_id ON messages(id DESC);
