<script setup lang="ts">
import { computed } from 'vue'
import type { GameState } from '../game/game'
import { WEAPONS } from '../game/config'

const props = defineProps<{ state: GameState; now: number }>()

const showHit = computed(() => props.now - props.state.hitMarker < 140)
const showHead = computed(() => props.now - props.state.headshotMarker < 220)
const dmgAlpha = computed(() => {
  const d = props.now - props.state.damageFlash
  return d < 380 ? Math.max(0, 0.5 * (1 - d / 380)) : 0
})
const hpColor = computed(() => {
  const h = props.state.hp
  return h > 60 ? '#7CFC58' : h > 30 ? '#ffcc00' : '#ff3b30'
})
const aim = computed(() => props.state.aiming)
const ammoList = computed(() =>
  props.state.owned.filter((w) => w !== 'knife').map((w) => ({ id: w, name: WEAPONS[w].name, active: w === props.state.current })),
)

const frenzyOn = computed(() => props.state.frenzyT > 0.05)
const dmgShow = computed(() => props.now - props.state.damageDirAt < 800)
const dmgOpacity = computed(() => Math.max(0, 1 - (props.now - props.state.damageDirAt) / 800))
const dmgRot = computed(() => (props.state.damageDir * 180) / Math.PI)

// 飄字（傷害數字 / 擊殺獎勵）：依年齡往上飄 + 淡出
function floatStyle(f: any) {
  const t = Math.min(1, (props.now - f.born) / 900)
  const dy = -46 * t
  const op = t < 0.12 ? 1 : Math.max(0, 1 - (t - 0.12) / 0.88)
  return {
    left: f.x + 'px',
    top: f.y + dy + 'px',
    transform: `translate(-50%,-50%) scale(${f.big ? 1.25 : 1})`,
    color: f.color,
    opacity: op,
    fontSize: f.big ? '26px' : '17px',
    textShadow: '0 2px 5px rgba(0,0,0,0.95)',
  }
}
</script>

<template>
  <!-- 飄字（傷害 / 擊殺獎勵） -->
  <div class="absolute inset-0 pointer-events-none overflow-hidden">
    <div v-for="f in state.floats" :key="f.id" class="absolute font-black tabular-nums" :style="floatStyle(f)">{{ f.text }}</div>
  </div>

  <!-- 受擊方向指示器 -->
  <div v-if="dmgShow" class="absolute inset-0 flex items-center justify-center pointer-events-none">
    <div :style="{ transform: `rotate(${dmgRot}deg)`, opacity: dmgOpacity }">
      <div style="transform: translateY(-95px); filter: drop-shadow(0 0 4px rgba(0,0,0,0.9))" class="text-red-500 text-4xl font-black leading-none">▲</div>
    </div>
  </div>

  <!-- 受傷紅暈 -->
  <div class="absolute inset-0 pointer-events-none" :style="{
    boxShadow: `inset 0 0 220px 40px rgba(200,0,0,${dmgAlpha})`,
    opacity: dmgAlpha > 0 ? 1 : 0, transition: 'opacity .1s' }" />

  <!-- 準心 -->
  <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
    <div class="relative" :style="{ transform: aim ? 'scale(0.6)' : 'scale(1)', transition: 'transform .1s' }">
      <div class="absolute bg-white/90" style="width:2px;height:9px;left:-1px;top:-13px"></div>
      <div class="absolute bg-white/90" style="width:2px;height:9px;left:-1px;top:5px"></div>
      <div class="absolute bg-white/90" style="height:2px;width:9px;top:-1px;left:-13px"></div>
      <div class="absolute bg-white/90" style="height:2px;width:9px;top:-1px;left:5px"></div>
      <div class="absolute bg-red-500 rounded-full" style="width:3px;height:3px;left:-1.5px;top:-1.5px"></div>
      <!-- 命中標記 -->
      <template v-if="showHit">
        <div class="absolute" :class="showHead ? 'text-red-500' : 'text-white'"
          style="font-size:26px;line-height:1;font-weight:900;left:-9px;top:-13px;text-shadow:0 0 4px #000">✕</div>
      </template>
    </div>
  </div>

  <!-- 開鏡黑框（狙擊） -->
  <div v-if="aim && state.current === 'sniper'" class="absolute inset-0 pointer-events-none">
    <div class="absolute inset-0" style="background:radial-gradient(circle at center, transparent 0, transparent 28%, #000 30%)"></div>
    <div class="absolute left-1/2 top-0 bottom-0 bg-black/70" style="width:1px"></div>
    <div class="absolute top-1/2 left-0 right-0 bg-black/70" style="height:1px"></div>
  </div>

  <!-- 左下：血量 / 護甲 -->
  <div class="absolute left-6 bottom-6 hud-text pointer-events-none">
    <div class="flex items-end gap-3">
      <div>
        <div class="text-5xl font-black tabular-nums" :style="{ color: hpColor }">{{ Math.max(0, state.hp) }}</div>
        <div class="text-xs tracking-widest text-white/60">HEALTH</div>
      </div>
      <div v-if="state.armor > 0">
        <div class="text-3xl font-bold tabular-nums text-sky-300">{{ state.armor }}</div>
        <div class="text-xs tracking-widest text-white/60">ARMOR</div>
      </div>
      <div>
        <div class="text-3xl font-bold tabular-nums" :class="state.grenades > 0 ? 'text-orange-300' : 'text-white/30'">💣 {{ state.grenades }}</div>
        <div class="text-xs tracking-widest text-white/60">GRENADE · G</div>
      </div>
    </div>
  </div>

  <!-- 右下：彈藥 / 武器 -->
  <div class="absolute right-6 bottom-6 hud-text text-right pointer-events-none">
    <div class="text-sm text-white/70 tracking-widest uppercase">{{ state.weaponName }}</div>
    <div v-if="state.ammoMag >= 0" class="flex items-end justify-end gap-2">
      <span class="text-5xl font-black tabular-nums" :class="state.ammoMag === 0 ? 'text-red-500' : 'text-white'">{{ state.ammoMag }}</span>
      <span class="text-2xl font-bold text-white/50 mb-1">/ {{ state.ammoReserve }}</span>
    </div>
    <div v-else class="text-3xl font-black text-white">🔪 近戰</div>
    <div v-if="state.reloading" class="text-yellow-400 text-sm animate-pulse">換彈中…</div>
  </div>

  <!-- 武器槽位 -->
  <div class="absolute right-6 bottom-32 flex flex-col gap-1 items-end pointer-events-none">
    <div v-for="(w, i) in ammoList" :key="w.id"
      class="px-2 py-0.5 rounded text-xs font-bold tracking-wide"
      :class="w.active ? 'bg-yellow-400 text-black' : 'bg-black/40 text-white/70'">
      {{ i + 1 }} · {{ w.name }}
    </div>
  </div>

  <!-- 頂部：波次 / 敵人 / 金錢 / 連殺 -->
  <div class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 hud-text pointer-events-none">
    <div class="text-center">
      <div class="text-2xl font-black" :class="state.isBossWave ? 'text-red-500 animate-pulse' : 'text-yellow-400'">
        {{ state.isBossWave ? '⚠ 王波 ' : 'WAVE ' }}{{ state.wave }}
      </div>
    </div>
    <div class="text-center">
      <div class="text-2xl font-black text-red-400 tabular-nums">☠ {{ state.enemiesLeft }}</div>
      <div class="text-[10px] tracking-widest text-white/50">ENEMIES</div>
    </div>
    <div class="text-center">
      <div class="text-2xl font-black text-green-300 tabular-nums">$ {{ state.money }}</div>
    </div>
  </div>

  <!-- 左上：分數 / 擊殺 -->
  <div class="absolute top-4 left-6 hud-text pointer-events-none text-sm">
    <div class="text-white/80">擊殺 <b class="text-white">{{ state.kills }}</b></div>
    <div class="text-white/80">分數 <b class="text-yellow-400">{{ state.score }}</b></div>
    <div v-if="state.streak > 1" class="text-orange-400 font-bold animate-pulse">🔥 {{ state.streak }} 連殺</div>
  </div>

  <!-- 狂暴計時 -->
  <div v-if="frenzyOn" class="absolute top-16 left-1/2 -translate-x-1/2 text-red-400 font-black text-lg animate-pulse hud-text pointer-events-none">
    ⚡ 狂暴 {{ state.frenzyT.toFixed(1) }}s
  </div>

  <!-- 中央訊息 -->
  <div v-if="state.message" class="absolute top-1/4 left-1/2 -translate-x-1/2 pointer-events-none">
    <div class="text-4xl font-black text-white drop-shadow-lg animate-pulse tracking-wider">{{ state.message }}</div>
  </div>

  <!-- 提示列 -->
  <div class="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-white/40 pointer-events-none">
    WASD 移動 · 滑鼠 瞄準 · 左鍵 射擊 · 右鍵 瞄準 · R 換彈 · G 手榴彈 · 1-5 換槍 · Shift 跑 · Ctrl 蹲 · B 購買
  </div>
</template>
