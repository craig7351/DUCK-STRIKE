<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { THEME, DIFFICULTIES, type Difficulty } from '../game/config'
import { getPlayerName, setPlayerName, fetchOnline, fetchStats, type GlobalStats } from '../game/api'

const props = defineProps<{ bestScore: number; metaCoins: number }>()
const emit = defineEmits<{
  (e: 'start', difficulty: Difficulty): void
  (e: 'leaderboard'): void
  (e: 'messages'): void
  (e: 'upgrades'): void
}>()

const diffs = Object.entries(DIFFICULTIES).map(([id, d]) => ({ id: id as Difficulty, name: d.name }))
const name = ref(getPlayerName())
const selectedDiff = ref<Difficulty>('normal')
const canStart = computed(() => name.value.trim().length > 0)

const online = ref<number | null>(null)
const peak = ref(0)
const stats = reactive<GlobalStats>({ plays: 0, totalKills: 0, peakOnline: 0 })
const hasStats = ref(false)
let timer = 0

function saveName() { setPlayerName(name.value); name.value = getPlayerName() }
function onStart() { if (!canStart.value) return; saveName(); emit('start', selectedDiff.value) }

async function refreshOnline() {
  const d = await fetchOnline()
  if (d) { online.value = d.online; peak.value = d.peak }
}
onMounted(async () => {
  void refreshOnline()
  timer = window.setInterval(refreshOnline, 60000)
  const s = await fetchStats()
  if (s) { Object.assign(stats, s); hasStats.value = true }
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="absolute inset-0 overflow-auto bg-black/70 backdrop-blur-sm z-40 flex flex-col items-center justify-center py-8">
    <div class="text-center px-4 w-full max-w-2xl">
      <h1 class="text-6xl sm:text-7xl font-black text-yellow-400 tracking-tighter drop-shadow-2xl">{{ THEME.title }}</h1>
      <p class="text-xl sm:text-2xl text-white/80 font-bold tracking-[0.3em] mt-1">{{ THEME.subtitle }}</p>

      <!-- 線上人數 -->
      <div class="mt-3 flex items-center justify-center gap-2 text-sm">
        <template v-if="online !== null">
          <span class="relative flex h-2.5 w-2.5">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-lime-400"></span>
          </span>
          <span class="text-lime-300 font-bold">{{ online }}</span><span class="text-white/60">人在線</span>
        </template>
        <span v-else class="text-white/30">離線模式（未連後端）</span>
      </div>

      <!-- 暱稱 -->
      <div class="mt-5">
        <input v-model="name" maxlength="16" placeholder="輸入暱稱後開始"
          @change="saveName" @blur="saveName"
          class="w-64 max-w-full rounded-full bg-black/40 px-5 py-2 text-center font-bold text-white outline-none ring-1 backdrop-blur"
          :class="canStart ? 'ring-white/15' : 'ring-rose-400/50'" />
        <p v-if="!canStart" class="mt-1 text-xs text-rose-300/80">請先輸入暱稱</p>
      </div>

      <!-- 難度 -->
      <div class="mt-4">
        <div class="text-xs text-white/40 tracking-widest mb-2">難度</div>
        <div class="flex gap-2 justify-center flex-wrap">
          <button v-for="d in diffs" :key="d.id" @click="selectedDiff = d.id"
            class="px-4 py-2 rounded-lg font-bold text-sm transition cursor-pointer"
            :class="selectedDiff === d.id ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'">
            {{ d.name }}
          </button>
        </div>
      </div>

      <!-- CTA -->
      <div class="mt-5 flex flex-col items-center gap-3">
        <button @click="onStart" :disabled="!canStart"
          class="px-10 py-4 font-black text-2xl rounded-xl transition"
          :class="canStart ? 'bg-yellow-400 text-black hover:bg-yellow-300 hover:scale-105 cursor-pointer' : 'bg-white/10 text-white/40 cursor-not-allowed'">
          開始遊戲 ▶
        </button>
        <div class="flex gap-2 flex-wrap justify-center">
          <button @click="emit('leaderboard')" class="px-4 py-2 bg-white/10 text-white/80 font-bold rounded-lg hover:bg-white/20 transition cursor-pointer">🏆 排行榜</button>
          <button @click="emit('messages')" class="px-4 py-2 bg-white/10 text-white/80 font-bold rounded-lg hover:bg-white/20 transition cursor-pointer">💬 留言板</button>
          <button @click="emit('upgrades')" class="px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 font-bold rounded-lg hover:bg-cyan-500/30 transition cursor-pointer">⏳ 永久升級 · ★{{ metaCoins }}</button>
        </div>
      </div>

      <!-- 累積統計 -->
      <div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div class="bg-white/5 rounded-lg py-2"><div class="text-xl font-black text-yellow-400 tabular-nums">{{ hasStats ? stats.plays : '—' }}</div><div class="text-[10px] text-white/50 tracking-widest">總場次</div></div>
        <div class="bg-white/5 rounded-lg py-2"><div class="text-xl font-black text-red-300 tabular-nums">{{ hasStats ? stats.totalKills : '—' }}</div><div class="text-[10px] text-white/50 tracking-widest">總擊殺</div></div>
        <div class="bg-white/5 rounded-lg py-2"><div class="text-xl font-black text-lime-300 tabular-nums">{{ hasStats ? stats.peakOnline : (peak || '—') }}</div><div class="text-[10px] text-white/50 tracking-widest">最高在線</div></div>
        <div class="bg-white/5 rounded-lg py-2"><div class="text-xl font-black text-white tabular-nums">{{ bestScore || '—' }}</div><div class="text-[10px] text-white/50 tracking-widest">你的最高分</div></div>
      </div>

      <!-- 玩法說明 -->
      <div class="mt-6 mx-auto text-left bg-white/5 border border-white/10 rounded-xl px-5 py-4">
        <div class="text-yellow-400 font-bold text-sm tracking-widest mb-2">玩法說明</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-white/70 leading-relaxed">
          <div>🎯 <b class="text-white/90">無盡波次生存</b>：撐越久波數越高分越高；敵人越後面越多、越強。</div>
          <div>👑 <b class="text-white/90">每 5 波王波</b>：擊敗放大的紫色王，必掉補給。</div>
          <div>🔫 <b class="text-white/90">戰鬥</b>：左鍵射擊、右鍵瞄準、G 丟手榴彈，可射爆爆炸桶連鎖。</div>
          <div>⏳ <b class="text-white/90">大絕 (F)</b>：時間緩慢；每殺 5 隻 +1 秒、最多存 10 秒。</div>
          <div>🛒 <b class="text-white/90">軍火庫</b>：每波清空後自動開啟，買槍 / 補彈 / 護甲。</div>
          <div>👾 <b class="text-white/90">敵種</b>：雜兵/突擊兵/刀兵(衝鋒砍)/重裝兵/自爆兵。</div>
        </div>
      </div>

      <div class="mt-5 text-xs text-white/40 leading-relaxed">
        WASD 移動 · 滑鼠 瞄準 · 左鍵 射擊 · 右鍵 瞄準/開鏡 · R 換彈 · G 手榴彈 · F 大絕 · 1-5 換槍 · Q 軍刀 · Shift 跑 · Ctrl/C 蹲 · Esc 暫停
      </div>
    </div>
  </div>
</template>
