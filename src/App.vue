<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Game, createGameState } from './game/game'
import type { WeaponId, Difficulty } from './game/config'
import { THEME, DIFFICULTIES } from './game/config'
import { Meta } from './game/meta'
import HUD from './ui/HUD.vue'
import BuyMenu from './ui/BuyMenu.vue'
import UpgradeMenu from './ui/UpgradeMenu.vue'
import TouchControls from './ui/TouchControls.vue'
import MusicMenu from './ui/MusicMenu.vue'
import Landing from './ui/Landing.vue'
import Leaderboard from './ui/Leaderboard.vue'
import MessageBoard from './ui/MessageBoard.vue'
import { getPlayerName, submitScore, sendHeartbeat } from './game/api'
import type { Input } from './game/input'

const canvas = ref<HTMLCanvasElement>()
const state = reactive(createGameState())
const now = ref(0)
let game: Game | null = null
let raf = 0

const bestScore = ref(0)
const metaCoins = ref(0)
const selectedDiff = ref<Difficulty>('normal')
const showUpgrades = ref(false)
const menuScreen = ref<'home' | 'leaderboard' | 'messages'>('home')
const inputRef = ref<Input | null>(null)
const isMobile = ref(
  matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch'),
)

function refreshMeta() { bestScore.value = Meta.best; metaCoins.value = Meta.coins }
function tick() { now.value = performance.now(); raf = requestAnimationFrame(tick) }

onMounted(async () => {
  game = new Game(canvas.value!, state)
  game.touchMode = isMobile.value
  inputRef.value = game.input
  await game.init()
  refreshMeta()
  tick()
})

// 分數提交（死亡時）+ 在線心跳（遊玩中每 60s）
let hbTimer = 0
watch(() => state.phase, (p, prev) => {
  if (p === 'dead' && prev !== 'dead') {
    submitScore({ name: getPlayerName() || '鴨鴨', score: state.score, wave: state.wave, kills: state.kills, difficulty: state.difficulty })
  }
  if (p === 'playing' && !hbTimer) { sendHeartbeat(); hbTimer = window.setInterval(sendHeartbeat, 60000) }
  else if (p !== 'playing' && hbTimer) { clearInterval(hbTimer); hbTimer = 0 }
})

onUnmounted(() => { cancelAnimationFrame(raf); if (hbTimer) clearInterval(hbTimer); game?.dispose() })

function start(diff: Difficulty) { selectedDiff.value = diff; game?.start(diff) }
function restart() { game?.start(selectedDiff.value) }
function backToMenu() { refreshMeta(); menuScreen.value = 'home'; state.phase = 'menu' }
function closeUpgrades() { showUpgrades.value = false; refreshMeta() }
function buy(id: WeaponId) { game?.buy(id) }
function buyArmor() { game?.buyArmor() }
function buyMedkit() { game?.buyMedkit() }
function nextWave() { game?.nextWave() }
function resume() { game?.resume() }
</script>

<template>
  <canvas id="renderCanvas" ref="canvas"></canvas>

  <!-- 右上角：背景音樂選單（5 種曲風 + 關閉），loading 以外皆顯示 -->
  <MusicMenu v-if="state.phase !== 'loading'" />

  <!-- 載入中 -->
  <div v-if="state.phase === 'loading'" class="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-50">
    <div class="text-4xl font-black text-yellow-400 mb-6 tracking-widest">{{ THEME.title }}</div>
    <div class="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
      <div class="h-full bg-yellow-400 transition-all" :style="{ width: state.loadPct + '%' }"></div>
    </div>
    <div class="text-white/40 text-sm mt-3">載入中… {{ state.loadPct }}%</div>
  </div>

  <!-- 主選單（首頁 / 排行榜 / 留言板） -->
  <template v-else-if="state.phase === 'menu'">
    <Landing v-if="menuScreen === 'home'" :best-score="bestScore" :meta-coins="metaCoins"
      @start="start" @leaderboard="menuScreen = 'leaderboard'" @messages="menuScreen = 'messages'" @upgrades="showUpgrades = true" />
    <Leaderboard v-else-if="menuScreen === 'leaderboard'" @back="menuScreen = 'home'" />
    <MessageBoard v-else-if="menuScreen === 'messages'" @back="menuScreen = 'home'" />
  </template>

  <!-- 永久升級面板 -->
  <UpgradeMenu v-if="showUpgrades" @close="closeUpgrades" />

  <!-- HUD -->
  <HUD v-if="['playing','paused'].includes(state.phase)" :state="state" :now="now" />

  <!-- 手機觸控操作（搖桿 + 按鈕）：僅手機 + 遊玩中顯示 -->
  <TouchControls v-if="isMobile && state.phase === 'playing' && inputRef" :input="inputRef" :state="state" />

  <!-- 購買選單 -->
  <BuyMenu v-if="state.phase === 'buy'" :state="state" @buy="buy" @armor="buyArmor" @medkit="buyMedkit" @next="nextWave" />

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
