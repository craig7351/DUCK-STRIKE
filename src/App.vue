<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { Game, createGameState } from './game/game'
import type { WeaponId, Difficulty } from './game/config'
import { THEME, DIFFICULTIES } from './game/config'
import { Meta } from './game/meta'
import HUD from './ui/HUD.vue'
import BuyMenu from './ui/BuyMenu.vue'
import UpgradeMenu from './ui/UpgradeMenu.vue'
import TouchControls from './ui/TouchControls.vue'
import type { Input } from './game/input'

const canvas = ref<HTMLCanvasElement>()
const state = reactive(createGameState())
const now = ref(0)
let game: Game | null = null
let raf = 0

const bestScore = ref(0)
const metaCoins = ref(0)
const board = ref<{ score: number; wave: number; date: string }[]>([])
const selectedDiff = ref<Difficulty>('normal')
const showUpgrades = ref(false)
const inputRef = ref<Input | null>(null)
const isMobile = ref(
  matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch'),
)
const diffs = Object.entries(DIFFICULTIES).map(([id, d]) => ({ id: id as Difficulty, name: d.name }))

function refreshMeta() { bestScore.value = Meta.best; metaCoins.value = Meta.coins; board.value = [...Meta.board] }
function tick() { now.value = performance.now(); raf = requestAnimationFrame(tick) }

onMounted(async () => {
  game = new Game(canvas.value!, state)
  game.touchMode = isMobile.value
  inputRef.value = game.input
  await game.init()
  refreshMeta()
  tick()
})
onUnmounted(() => { cancelAnimationFrame(raf); game?.dispose() })

function start() { game?.start(selectedDiff.value) }
function restart() { game?.start(selectedDiff.value) }
function backToMenu() { refreshMeta(); state.phase = 'menu' }
function closeUpgrades() { showUpgrades.value = false; refreshMeta() }
function buy(id: WeaponId) { game?.buy(id) }
function buyArmor() { game?.buyArmor() }
function nextWave() { game?.nextWave() }
function resume() { game?.resume() }
</script>

<template>
  <canvas id="renderCanvas" ref="canvas"></canvas>

  <!-- 載入中 -->
  <div v-if="state.phase === 'loading'" class="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-50">
    <div class="text-4xl font-black text-yellow-400 mb-6 tracking-widest">{{ THEME.title }}</div>
    <div class="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
      <div class="h-full bg-yellow-400 transition-all" :style="{ width: state.loadPct + '%' }"></div>
    </div>
    <div class="text-white/40 text-sm mt-3">載入中… {{ state.loadPct }}%</div>
  </div>

  <!-- 主選單 -->
  <div v-else-if="state.phase === 'menu'" class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-40">
    <div class="text-center">
      <h1 class="text-7xl font-black text-yellow-400 tracking-tighter drop-shadow-2xl">{{ THEME.title }}</h1>
      <p class="text-2xl text-white/80 font-bold tracking-[0.3em] mt-1">{{ THEME.subtitle }}</p>

      <!-- 難度選擇 -->
      <div class="mt-6">
        <div class="text-xs text-white/40 tracking-widest mb-2">難度</div>
        <div class="flex gap-2 justify-center">
          <button v-for="d in diffs" :key="d.id" @click="selectedDiff = d.id"
            class="px-4 py-2 rounded-lg font-bold text-sm transition cursor-pointer"
            :class="selectedDiff === d.id ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'">
            {{ d.name }}
          </button>
        </div>
      </div>

      <div class="flex gap-3 justify-center mt-6">
        <button @click="start" class="px-10 py-4 bg-yellow-400 text-black font-black text-2xl rounded-xl hover:bg-yellow-300 hover:scale-105 transition cursor-pointer">
          開始遊戲 ▶
        </button>
        <button @click="showUpgrades = true" class="px-6 py-4 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 font-bold rounded-xl hover:bg-cyan-500/30 transition cursor-pointer">
          永久升級<br><span class="text-xs text-cyan-300">★ {{ metaCoins }}</span>
        </button>
      </div>

      <div class="flex items-center justify-center gap-8 mt-5">
        <div v-if="bestScore > 0" class="text-white/60">最高分 <b class="text-yellow-400">{{ bestScore }}</b></div>
        <div v-if="board.length" class="text-left text-xs text-white/50">
          <div class="text-white/40 tracking-widest mb-1">排行榜</div>
          <div v-for="(b, i) in board.slice(0, 5)" :key="i" class="tabular-nums">
            {{ i + 1 }}. <b class="text-yellow-400">{{ b.score }}</b> · 第{{ b.wave }}波 · {{ b.date }}
          </div>
        </div>
      </div>

      <!-- 玩法說明 -->
      <div class="mt-6 mx-auto max-w-2xl text-left bg-white/5 border border-white/10 rounded-xl px-5 py-4">
        <div class="text-yellow-400 font-bold text-sm tracking-widest mb-2">玩法說明</div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-white/70 leading-relaxed">
          <div>🎯 <b class="text-white/90">無盡波次生存</b>：撐越久波數越高分越高；敵人越後面越多、越強。</div>
          <div>👑 <b class="text-white/90">每 5 波王波</b>：擊敗放大的紫色王，必掉補給。</div>
          <div>🔫 <b class="text-white/90">戰鬥</b>：左鍵射擊、右鍵瞄準、G 丟手榴彈，可射爆場上爆炸桶連鎖。</div>
          <div>🛒 <b class="text-white/90">軍火庫</b>：波間按 B 買槍 / 補彈 / 護甲。</div>
          <div>🔥 <b class="text-white/90">連殺獎勵</b>：5 連回血、10 連狂暴、15 連補滿彈藥。</div>
          <div>💊 <b class="text-white/90">掉落</b>：補血 / 彈藥 / 限時狂暴，走過自動拾取。</div>
          <div>👾 <b class="text-white/90">敵種</b>：雜兵(遠程)、突擊兵(衝刺)、刀兵(衝鋒砍擊)、重裝兵(厚血)、自爆兵(貼身爆炸)。</div>
          <div>★ <b class="text-white/90">永久升級</b>：用星幣解鎖跨場永久強化。</div>
        </div>
      </div>

      <div class="mt-6 text-xs text-white/40 leading-relaxed">
        WASD 移動 · 滑鼠 瞄準 · 左鍵 射擊 · 右鍵 瞄準/開鏡<br>
        R 換彈 · G 手榴彈 · 1-5 換槍 · Q 軍刀 · Shift 跑 · Ctrl/C 蹲 · B 購買 · Esc 暫停
      </div>
    </div>
  </div>

  <!-- 永久升級面板 -->
  <UpgradeMenu v-if="showUpgrades" @close="closeUpgrades" />

  <!-- HUD -->
  <HUD v-if="['playing','paused'].includes(state.phase)" :state="state" :now="now" />

  <!-- 手機觸控操作（搖桿 + 按鈕）：僅手機 + 遊玩中顯示 -->
  <TouchControls v-if="isMobile && state.phase === 'playing' && inputRef" :input="inputRef" />

  <!-- 購買選單 -->
  <BuyMenu v-if="state.phase === 'buy'" :state="state" @buy="buy" @armor="buyArmor" @next="nextWave" />

  <!-- 暫停 -->
  <div v-if="state.phase === 'paused'" class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-30">
    <div class="text-5xl font-black text-white mb-6">暫停</div>
    <button @click="resume" class="px-10 py-3 bg-yellow-400 text-black font-black text-xl rounded-xl hover:bg-yellow-300 transition cursor-pointer">
      繼續遊戲
    </button>
    <div class="text-white/40 text-sm mt-4">點擊繼續以重新鎖定滑鼠</div>
  </div>

  <!-- 死亡結算 -->
  <div v-if="state.phase === 'dead'" class="absolute inset-0 flex flex-col items-center justify-center bg-red-950/80 backdrop-blur-sm z-40">
    <div class="text-6xl font-black text-red-400 mb-2">陣亡</div>
    <div class="text-white/70 mb-6">你撐到了第 {{ state.wave }} 波 · {{ DIFFICULTIES[state.difficulty].name }}難度</div>
    <div class="grid grid-cols-3 gap-8 text-center mb-4">
      <div><div class="text-4xl font-black text-yellow-400">{{ state.score }}</div><div class="text-xs text-white/50 tracking-widest">分數</div></div>
      <div><div class="text-4xl font-black text-white">{{ state.kills }}</div><div class="text-xs text-white/50 tracking-widest">擊殺</div></div>
      <div><div class="text-4xl font-black text-orange-400">{{ state.bestStreak }}</div><div class="text-xs text-white/50 tracking-widest">最高連殺</div></div>
    </div>
    <div class="text-cyan-300 font-bold mb-6">本場獲得 ★ {{ state.runCoins }} 星幣 <span class="text-white/40 text-sm">（共 ★ {{ state.metaCoins }}）</span></div>
    <div class="flex gap-3">
      <button @click="restart" class="px-10 py-4 bg-yellow-400 text-black font-black text-2xl rounded-xl hover:bg-yellow-300 hover:scale-105 transition cursor-pointer">
        再來一場 ↻
      </button>
      <button @click="backToMenu" class="px-6 py-4 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition cursor-pointer">
        返回選單
      </button>
    </div>
  </div>
</template>
