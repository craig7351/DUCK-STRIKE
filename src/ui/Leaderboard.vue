<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { DIFFICULTIES, type Difficulty } from '../game/config'
import { Meta } from '../game/meta'
import { fetchLeaderboard, type LeaderRow } from '../game/api'

defineEmits<{ (e: 'back'): void }>()

const diffs: { id: '' | Difficulty; name: string }[] = [
  { id: '', name: '全部' },
  ...Object.entries(DIFFICULTIES).map(([id, d]) => ({ id: id as Difficulty, name: d.name })),
]
const selected = ref<'' | Difficulty>('')
const rows = ref<LeaderRow[]>([])
const isGlobal = ref(false)
const loading = ref(false)

function diffName(id: string) { return (DIFFICULTIES as any)[id]?.name || id }
function fmtDate(ms: number) { try { return new Date(ms).toISOString().slice(0, 10) } catch { return '' } }

async function refresh() {
  loading.value = true
  // 本地 fallback（meta 排行榜沒有暱稱/擊殺）
  rows.value = Meta.board.map((b) => ({ name: '（本機）', score: b.score, wave: b.wave, kills: -1, difficulty: '', at: 0 }))
    .filter((r) => !selected.value)   // 本地未分難度，選特定難度時本地清單就空
    .slice(0, 10)
  isGlobal.value = false
  const g = await fetchLeaderboard(20, selected.value || undefined)
  if (g) { rows.value = g; isGlobal.value = true }
  loading.value = false
}
function pick(id: '' | Difficulty) { selected.value = id; refresh() }
onMounted(refresh)
</script>

<template>
  <div class="absolute inset-0 overflow-auto bg-black/80 backdrop-blur-sm z-40 flex flex-col items-center py-8 px-4">
    <div class="w-full max-w-2xl">
      <div class="flex items-center justify-between mb-4">
        <button @click="$emit('back')" class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer">← 返回</button>
        <h2 class="text-3xl font-black text-yellow-400">🏆 排行榜</h2>
        <span class="px-2 py-1 rounded text-xs font-bold" :class="isGlobal ? 'bg-lime-500/30 text-lime-200' : 'bg-white/10 text-white/50'">{{ isGlobal ? '全球' : '本機' }}</span>
      </div>

      <div class="flex gap-2 justify-center flex-wrap mb-4">
        <button v-for="d in diffs" :key="d.id" @click="pick(d.id)"
          class="px-3 py-1.5 rounded-lg font-bold text-sm transition cursor-pointer"
          :class="selected === d.id ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'">
          {{ d.name }}
        </button>
      </div>

      <div class="bg-zinc-900/80 rounded-xl border border-white/10 overflow-hidden">
        <div class="grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem] gap-2 px-4 py-2 text-[11px] tracking-widest text-white/40 border-b border-white/10">
          <div>#</div><div>玩家</div><div class="text-right">分數</div><div class="text-right">波次</div><div class="text-right">擊殺</div>
        </div>
        <div v-if="loading" class="px-4 py-8 text-center text-white/40">載入中…</div>
        <div v-else-if="!rows.length" class="px-4 py-8 text-center text-white/40">尚無紀錄</div>
        <div v-for="(r, i) in rows" :key="i"
          class="grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem] gap-2 px-4 py-2 text-sm items-center border-b border-white/5"
          :class="i < 3 ? 'bg-yellow-400/5' : ''">
          <div class="font-black" :class="i === 0 ? 'text-yellow-400' : i === 1 ? 'text-white/80' : i === 2 ? 'text-orange-400' : 'text-white/40'">{{ i + 1 }}</div>
          <div class="truncate">
            <span class="font-bold text-white">{{ r.name }}</span>
            <span v-if="r.difficulty" class="ml-2 text-[10px] text-white/40">{{ diffName(r.difficulty) }}</span>
            <span v-if="r.at" class="ml-2 text-[10px] text-white/30">{{ fmtDate(r.at) }}</span>
          </div>
          <div class="text-right font-black text-yellow-400 tabular-nums">{{ r.score }}</div>
          <div class="text-right tabular-nums text-white/80">{{ r.wave }}</div>
          <div class="text-right tabular-nums text-white/60">{{ r.kills < 0 ? '—' : r.kills }}</div>
        </div>
      </div>
      <p v-if="!isGlobal" class="mt-3 text-center text-xs text-white/30">目前顯示本機紀錄（未連線到全球後端）</p>
    </div>
  </div>
</template>
