<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import type { GameState } from '../game/game'
import { ULTIMATE } from '../game/config'

// 只需觸控注入方法（避免傳入含 private 成員的 class 造成型別摩擦）
interface TouchInput {
  setMove(x: number, y: number): void
  addLook(dx: number, dy: number): void
  setFire(down: boolean): void
  setAim(down: boolean): void
  queueJump(): void
  setCrouch(on: boolean): void
  reloadPress(): void
  throwGrenade(): void
  activateUlt(): void
  nextWeapon(): void
}

const props = defineProps<{ input: TouchInput; state: GameState }>()

const LOOK_SENS = 1.5

// ---- 左下虛擬搖桿（移動）----
const stickBase = ref<HTMLElement>()
const stickX = ref(0), stickY = ref(0)
let joyId: number | null = null, joyOX = 0, joyOY = 0
const R = 55
function joyStart(e: PointerEvent) {
  joyId = e.pointerId
  const r = stickBase.value!.getBoundingClientRect()
  joyOX = r.left + r.width / 2; joyOY = r.top + r.height / 2
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  joyMove(e)
}
function joyMove(e: PointerEvent) {
  if (e.pointerId !== joyId) return
  let dx = e.clientX - joyOX, dy = e.clientY - joyOY
  const d = Math.hypot(dx, dy)
  if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R }
  stickX.value = dx; stickY.value = dy
  props.input.setMove(dx / R, -dy / R)   // 螢幕上=前
}
function joyEnd(e: PointerEvent) {
  if (e.pointerId !== joyId) return
  joyId = null; stickX.value = 0; stickY.value = 0
  props.input.setMove(0, 0)
}

// ---- 空白區拖曳轉視角（不開火，用來純掃視）----
let lookId: number | null = null, lastX = 0, lastY = 0
function lookStart(e: PointerEvent) { if (lookId !== null) return; lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY }
function lookMove(e: PointerEvent) {
  if (e.pointerId !== lookId) return
  props.input.addLook((e.clientX - lastX) * LOOK_SENS, (e.clientY - lastY) * LOOK_SENS)
  lastX = e.clientX; lastY = e.clientY
}
function lookEnd(e: PointerEvent) { if (e.pointerId === lookId) lookId = null }

// ---- 射擊鈕（兼看視）：按住開火，同一指拖曳即可瞄準 → 單拇指可邊打邊瞄 ----
let fireId: number | null = null, fLastX = 0, fLastY = 0
function fireStart(e: PointerEvent) {
  fireId = e.pointerId
  fLastX = e.clientX; fLastY = e.clientY
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  props.input.setFire(true)
}
function fireMove(e: PointerEvent) {
  if (e.pointerId !== fireId) return
  props.input.addLook((e.clientX - fLastX) * LOOK_SENS, (e.clientY - fLastY) * LOOK_SENS)
  fLastX = e.clientX; fLastY = e.clientY
}
function fireEnd(e: PointerEvent) {
  if (e.pointerId !== fireId) return
  fireId = null
  props.input.setFire(false)
}

// ---- 其他動作鈕 ----
const aimOn = ref(false), crouchOn = ref(false)
function toggleAim() { aimOn.value = !aimOn.value; props.input.setAim(aimOn.value) }
function toggleCrouch() { crouchOn.value = !crouchOn.value; props.input.setCrouch(crouchOn.value) }
function jump() { props.input.queueJump() }
function reload() { props.input.reloadPress() }
function grenade() { props.input.throwGrenade() }
function ult() { props.input.activateUlt() }
function nextW() { props.input.nextWeapon() }

// ---- 陀螺儀看視（相對角度差餵進 addLook；與拖曳看視並存）----
const GYRO_SENS = 8          // 每度轉動 ≈ 8px 看視（約 1:1 視角）
const gyroOn = ref(false)
let gyroLast: { a: number; b: number } | null = null
function onOrient(e: DeviceOrientationEvent) {
  if (e.alpha == null || e.beta == null) return
  if (gyroLast) {
    let dYaw = e.alpha - gyroLast.a
    if (dYaw > 180) dYaw -= 360; else if (dYaw < -180) dYaw += 360   // 指北角度環繞處理
    const dPitch = e.beta - gyroLast.b
    props.input.addLook(-dYaw * GYRO_SENS, dPitch * GYRO_SENS)
  }
  gyroLast = { a: e.alpha, b: e.beta }
}
async function toggleGyro() {
  if (gyroOn.value) {
    window.removeEventListener('deviceorientation', onOrient)
    gyroLast = null; gyroOn.value = false
    return
  }
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
  if (DOE && typeof DOE.requestPermission === 'function') {   // iOS 13+ 需授權
    try { if ((await DOE.requestPermission()) !== 'granted') return } catch { return }
  }
  gyroLast = null
  window.addEventListener('deviceorientation', onOrient)
  gyroOn.value = true
}
onUnmounted(() => window.removeEventListener('deviceorientation', onOrient))
</script>

<template>
  <div class="absolute inset-0 z-20 select-none" style="touch-action:none">
    <!-- 看視層（最底，空白處拖曳轉視角，不開火） -->
    <div class="absolute inset-0" style="touch-action:none"
      @pointerdown="lookStart" @pointermove="lookMove" @pointerup="lookEnd" @pointercancel="lookEnd"></div>

    <!-- 左下虛擬搖桿（移動） -->
    <div ref="stickBase"
      class="absolute left-6 bottom-6 rounded-full bg-white/10 border border-white/20"
      style="width:130px;height:130px;touch-action:none"
      @pointerdown.prevent="joyStart" @pointermove="joyMove" @pointerup="joyEnd" @pointercancel="joyEnd">
      <div class="absolute rounded-full bg-white/35 border border-white/40"
        style="width:60px;height:60px;left:35px;top:35px"
        :style="{ transform: `translate(${stickX}px, ${stickY}px)` }"></div>
    </div>

    <!-- 右下主鈕：射擊（按住開火 + 拖曳瞄準） -->
    <button class="absolute rounded-full bg-red-500/40 border-2 border-red-400/70 text-white font-black text-lg active:bg-red-500/70"
      style="right:24px;bottom:28px;width:96px;height:96px;touch-action:none"
      @pointerdown.prevent="fireStart" @pointermove="fireMove" @pointerup="fireEnd" @pointercancel="fireEnd">
      射擊
    </button>

    <!-- 瞄準（切換） -->
    <button class="absolute rounded-full border-2 text-white text-sm font-bold"
      :class="aimOn ? 'bg-yellow-400/60 border-yellow-300' : 'bg-black/35 border-white/30'"
      style="right:132px;bottom:36px;width:64px;height:64px;touch-action:none"
      @pointerdown.prevent="toggleAim">瞄準</button>

    <!-- 跳 -->
    <button class="absolute rounded-full bg-black/35 border-2 border-white/30 text-white text-sm font-bold active:bg-white/20"
      style="right:36px;bottom:134px;width:60px;height:60px;touch-action:none"
      @pointerdown.prevent="jump">跳</button>

    <!-- 蹲（切換） -->
    <button class="absolute rounded-full border-2 text-white text-sm font-bold"
      :class="crouchOn ? 'bg-cyan-400/50 border-cyan-300' : 'bg-black/35 border-white/30'"
      style="right:140px;bottom:116px;width:56px;height:56px;touch-action:none"
      @pointerdown.prevent="toggleCrouch">蹲</button>

    <!-- 換彈 -->
    <button class="absolute rounded-full bg-black/35 border-2 border-white/30 text-white text-xs font-bold active:bg-white/20"
      style="right:212px;bottom:40px;width:56px;height:56px;touch-action:none"
      @pointerdown.prevent="reload">換彈</button>

    <!-- 切槍 -->
    <button class="absolute rounded-full bg-black/35 border-2 border-white/30 text-white text-xs font-bold active:bg-white/20"
      style="right:212px;bottom:110px;width:56px;height:56px;touch-action:none"
      @pointerdown.prevent="nextW">切槍</button>

    <!-- 陀螺儀看視開關 -->
    <button class="absolute rounded-full border-2 text-white text-xs font-bold select-none"
      :class="gyroOn ? 'bg-green-500/50 border-green-300' : 'bg-black/35 border-white/30'"
      style="right:212px;bottom:180px;width:56px;height:56px;touch-action:none"
      @pointerdown.prevent="toggleGyro">陀螺儀</button>

    <!-- 手榴彈（顯示剩餘數） -->
    <button class="absolute rounded-full border-2 flex flex-col items-center justify-center leading-none active:scale-95"
      :class="state.grenades > 0 ? 'bg-orange-500/35 border-orange-400/70 text-white' : 'bg-black/30 border-white/15 text-white/30'"
      style="right:132px;bottom:188px;width:58px;height:58px;touch-action:none"
      @pointerdown.prevent="grenade">
      <span class="text-xl">💣</span><span class="text-[11px] font-bold tabular-nums">{{ state.grenades }}</span>
    </button>

    <!-- 大絕：時間緩慢（顯示充能秒數，就緒/啟動高亮） -->
    <button class="absolute rounded-full border-2 flex flex-col items-center justify-center leading-none active:scale-95"
      :class="state.ultActive ? 'bg-cyan-300/60 border-cyan-200 text-white animate-pulse'
        : state.ultCharge >= ULTIMATE.minActivate ? 'bg-sky-500/45 border-sky-300 text-white'
        : 'bg-black/30 border-white/15 text-white/40'"
      style="right:36px;bottom:206px;width:58px;height:58px;touch-action:none"
      @pointerdown.prevent="ult">
      <span class="text-lg">⏳</span><span class="text-[11px] font-bold tabular-nums">{{ state.ultCharge.toFixed(0) }}s</span>
    </button>
  </div>
</template>
