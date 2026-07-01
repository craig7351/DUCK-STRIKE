<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Music, MUSIC_TRACKS } from '../game/music'

const DEFAULT_TRACK = 3   // 電子（0緊張 1輕快 2史詩 3電子 4安靜）
const sel = ref(DEFAULT_TRACK)
onMounted(() => { Music.start(DEFAULT_TRACK) })   // 預設開啟電子（音訊於首次互動時解鎖）

function pick(i: number) {
  if (sel.value === i) { sel.value = -1; Music.stop() }
  else { sel.value = i; Music.start(i) }
}
</script>

<template>
  <div class="absolute top-3 right-3 z-50 flex flex-col items-end gap-1 hud-text select-none">
    <div class="text-[10px] text-white/50 tracking-widest mb-0.5">♪ 音樂</div>
    <button v-for="(t, i) in MUSIC_TRACKS" :key="i"
      @click="pick(i)"
      class="px-2.5 py-1 rounded text-xs font-bold tracking-wide transition cursor-pointer w-16 text-center"
      :class="sel === i ? 'bg-yellow-400 text-black' : 'bg-black/40 text-white/70 hover:bg-white/20'">
      {{ sel === i ? '▶ ' : '' }}{{ t.name }}
    </button>
    <button v-if="sel !== -1" @click="pick(sel)"
      class="px-2.5 py-1 rounded text-[11px] font-bold bg-black/40 text-white/50 hover:bg-white/20 cursor-pointer w-16 text-center">
      ✕ 關閉
    </button>
  </div>
</template>
