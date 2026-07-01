# DUCK STRIKE · 鴨鴨突擊

低多邊形第一人稱射擊（FPS）。在競技場中迎戰一波波 AI 敵兵，購買軍火、爆頭連殺、活到最後。
技術棧沿用 [GAME.md](./GAME.md) 的可重用心法：**玩法系統與美術/數值解耦，換皮只換 `public/models/` + 改字串。**

技術：**Vue 3 `<script setup>` + TypeScript + Vite + Tailwind v4 + Babylon.js**（前端）＋ **Cloudflare Pages Functions + D1**（全球後端）。
素材：低多邊形射擊包（角色 Soldier/Enemy/Hazmat/German Shepherd + 槍械 + 環境掩體），自包 glTF。

## 🎮 線上遊玩 / 介紹頁
- **立即遊玩**（Cloudflare Pages）：<https://duck-strike.pages.dev>
- **介紹頁**（GitHub Pages）：<https://craig7351.github.io/DUCK-STRIKE/>
- **原始碼**：<https://github.com/craig7351/DUCK-STRIKE>

## 操作
| 鍵 | 動作 |
|---|---|
| `WASD` | 移動 |
| 滑鼠 | 看視/瞄準 |
| 左鍵 | 射擊（自動武器按住連發） |
| 右鍵 | 瞄準 / 狙擊開鏡 |
| `R` | 換彈 |
| `G` | 投擲手榴彈 |
| `F` | 大絕：時間緩慢（子彈時間） |
| `1`~`5` | 切換武器 / `Q` 軍刀 / 滾輪切換 |
| `Shift` | 奔跑 · `Ctrl`/`C` 蹲下 · `Space` 跳 |
| `Esc` | 暫停（購買只在每波之間自動開啟軍火庫） |

**手機**（橫向優先）：自動偵測觸控裝置並顯示虛擬控制——左下搖桿移動、空白區拖曳轉視角；**射擊鈕兼看視**（按住開火、同指拖曳即可瞄準，解決邊看邊打的雙拇指衝突）；另有瞄準/跳/蹲/換彈/切槍、💣 手榴彈（顯示數量）、⏳ 大絕（顯示充能）。觸控模式不鎖指標（桌機可用網址加 `?touch` 參數測試）。

## 玩法
- **波次制 + 王波**：**無盡波次生存**，每波敵人數與強度遞增；並隨波數成長（血 +12%/波、傷害 +7%/波、速度 +2%/波）；**每 5 波為王波**，登場放大的紫色王（高血、高傷、彈幕、必掉補給）。
- **敵人種類**：雜兵（遠程）、突擊兵（近身衝刺）、**刀兵**（士兵外觀，高速衝鋒近戰砍擊）、重裝兵（厚血）、**自爆兵**（橘色，貼身引爆範圍傷害）、**王**。
- **命中**：hitscan 射線，含爆頭倍率、掩體遮蔽（LOS）、散布（移動/腰射放大，瞄準收斂）、後座。
- **手榴彈**（`G`）：拋物線投擲、落地/牆面反彈、引信爆炸；範圍傷害 + 引爆鄰近爆炸桶（含自傷）。
- **大絕・時間緩慢**（`F`）：每殺 5 隻 +1 秒充能（上限 10 秒）；啟動時世界（敵人/敵彈/掉落/特效）減速至 0.3 倍、玩家全速——子彈時間清場。
- **打擊感**：鏡頭震動（只抖 pitch/yaw 不滾轉）、武器走路晃動 + sway、槍口火光/曳光錨定槍口、**敵人開火可見曳光彈**、傷害/金錢飄字、受擊方向指示器、強化爆炸特效（閃光 + 衝擊波環 + 煙）。
- **可引爆爆炸桶**：場上爆炸桶/瓦斯桶可射爆，範圍依距離遞減傷害、**連鎖引爆**。
- **掉落與強化**：敵人機率掉落 補血 / 彈藥 / **限時狂暴**（傷害×2、射速×1.5）；走過去自動拾取。
- **軍犬同伴**（軍火庫購買，最多 1 隻、死掉重買）：主動找怪追咬（引怪 + 咬怪），高血量、每波回滿、脫戰回血；靠近牠的敵人會轉去攻擊牠、替玩家分擔火力。
- **軍火庫**（波間）：買槍 / 補彈 / **護甲** / **補血包（回 50，每次限 1）** / **軍犬**；戰鬥中無法購買。**開局預設護甲全滿**。
- **連殺獎勵**：連殺 5 → 回血、10 → 狂暴、15 → 彈藥全補。
- **背景音樂**：程序合成（零音檔），固定播放「電子」曲風。
- **難度**：簡單 / 普通 / 困難 / 地獄（影響敵人血量、傷害、速度、數量、獎勵倍率）。
- **永久升級（meta）**：每場結束依分數/波次給「★星幣」，主選單可解鎖跨場永久強化（生命/護甲/移速/傷害/起始資金，存 localStorage）。
- **全球後端（Cloudflare Pages + D1）**：暱稱、**全球排行榜**（難度篩選，離線退回本機 Top10）、**留言板**（兩層回覆）、**線上人數 + 歷史（近 30 天）**、累積統計；首頁另有 **📖 圖鑑**（怪物/武器介紹，含模型縮圖）。詳見 [BACKEND.md](./BACKEND.md)。

## 開發
```bash
pnpm install
pnpm dev          # http://localhost:5200（純前端；/api 呼叫失敗會自動退回本地）
pnpm typecheck    # vue-tsc --noEmit
pnpm build

# 全端（含 /api + D1）本地測試與部署見 BACKEND.md：
pnpm pages:dev    # wrangler pages dev dist（提供 /api）
pnpm deploy       # 建置 + wrangler pages deploy
```

## 架構分層（對應 GAME.md §0）
| 層 | 檔案 | 換新遊戲 |
|---|---|---|
| **引擎層（可重用）** | `game.ts` 主迴圈/命中/波次/爆炸/掉落/大絕時間縮放 · `player.ts` FPS 控制器 · `weapons.ts` 武器（含小刀揮舞）· `enemies.ts` AI+動畫池（刀兵近戰/自爆/王/引怪）· `companion.ts` 軍犬 · `grenades.ts` 手榴彈 · `projectiles.ts` 王彈幕 · `pickups.ts` 掉落 · `map.ts` 地圖 · `effects.ts` 特效 · `model-loader.ts`/`preview.ts` glTF 載入/圖鑑縮圖 · `input.ts` 輸入 · `sound.ts`/`music.ts` 音效/音樂 · `api.ts` 後端 client · `functions/api/*` Pages Functions | 幾乎不動 |
| **資料層（每款調）** | `config.ts` 的 `WEAPONS` / `ENEMIES` / `waveSpec` / `DIFFICULTIES` / `DROP` / `KILLSTREAK` / `GRENADE` / `ULTIMATE` / `MEDKIT` / `DOG` / `PLAYER` / `ECONOMY` · `meta.ts` 的 `META_UPGRADES` · `music.ts` 的 `MUSIC_TRACKS` · `schema.sql` 資料表 | 改資料陣列 |
| **資產層（每款換）** | `public/models/{characters,guns,env}/*.gltf` · `THEME` 文案/配色 · favicon | 換檔 + 改字串 |

### 換皮（reskin）三步
1. 丟新 glTF 進 `public/models/`，改 `config.ts` 的 `model` 字串。
2. 調 `WEAPONS`/`ENEMIES`/`waveSpec` 數值。
3. 改 `THEME` 標題/配色、`index.html` 標題、`favicon.svg`。

## 踩過的坑（已封裝）
- **glTF `__root__` 帶四元數** → 一律包 `TransformNode` holder 再轉（`model-loader.ts`）。
- **骨架動畫單位**用 `AssetContainer.instantiateModelsToScene` 正確複製骨架+動畫池（敵人）。
- **`FreeCamera` 無 `moveWithCollisions`** → 用隱形 collider mesh 做水平碰撞，垂直（跳/蹲）走相機。
- **射擊命中**：環境視覺 mesh 設 `isPickable=false`，改用不可見 box collider，穩定又便宜。
- **單體受擊閃白 / 兵種染色**：per-mesh `renderOverlay` + `overlayColor`（需 `Engine(..., { stencil:true })`）；共用材質不能直接改色，用 overlay 才不會污染同模型的其他單位。
- **視角模型軸向**：素材槍管沿 local +X，需繞 Y 轉 −90° 才朝螢幕內；槍口火光改用「相機相對偏移」而非槍模型節點，與各槍軸向解耦。
- **世界座標→螢幕飄字**：`Vector3.Project` 用 `canvas.clientWidth/Height` 投影對齊 HUD（CSS 像素）；佈局未就緒時退回 `engine.getRenderWidth()` 避免投影出 NaN。
- **指標鎖定競態**：不要每幀輪詢 `pointerLockElement` 來暫停（開局請求鎖定是非同步的會誤判）；改用 `pointerlockchange` 事件，只在「真的失去鎖定」時暫停。
- **⚠️ 手機縮放誤觸（重要）**：手機連點畫面（尤其虛擬搖桿中央）會觸發瀏覽器縮放。`user-scalable=no` 在 **iOS Safari 被忽略**；`touch-action: manipulation` 對部分 iOS 的**雙擊縮放也無效**。**最終解**（`main.ts` 全域）：攔截 320ms 內的第二次 `touchend`（double-tap）與 `gesturestart`（pinch）並 `preventDefault()`；再搭配 `touch-action: manipulation`（`style.css`）+ viewport `maximum-scale=1`（`index.html`）。JS 攔截才是治本，缺一不可。

## 待辦（可延伸）
- **盾兵**：正面擋彈、需繞背的敵人（角度判定）。
- 手機陀螺儀瞄準（已有 HTTPS，可接）、第三人稱切換、更多地圖、王的更多招式（震波/衝撞/毒池）。

## 已完成的主要系統
- 全球後端：排行榜 / 留言板 / 線上人數與 30 天歷史 / 累積統計（Cloudflare Pages + D1）；離線自動退回本地。
- 打擊感：鏡頭震動、武器晃動/sway、槍口火光/曳光錨定槍口、敵人可見曳光彈、傷害飄字、受擊方向指示器、可引爆爆炸桶、強化爆炸特效。
- 內容：無盡波次（隨波成長）、王波 + 王彈幕、刀兵（近戰衝鋒）、自爆兵、手榴彈、軍犬同伴、掉落物（補血/彈藥/狂暴）、限時強化。
- 系統：時間緩慢大絕（子彈時間）、軍火庫（護甲/補血包/軍犬，開局滿護甲）、程序合成背景音樂（固定電子）、橫向手機觸控（射擊鈕兼瞄準）、圖鑑（怪物/武器 + 模型縮圖）。
- 成長：永久升級（meta 星幣）、連殺獎勵、4 級難度。
- 發佈：Cloudflare Pages 可玩版 + GitHub Pages 介紹頁。
