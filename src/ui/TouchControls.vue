<script setup lang="ts">
import { ref } from 'vue'

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
  nextWeapon(): void
}

const props = defineProps<{ input: TouchInput }>()

// ---- 左下虛擬搖桿 ----
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

// ---- 看視拖曳（畫面其餘區域）----
let lookId: number | null = null, lastX = 0, lastY = 0
const LOOK_SENS = 1.5
function lookStart(e: PointerEvent) { if (lookId !== null) return; lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY }
function lookMove(e: PointerEvent) {
  if (e.pointerId !== lookId) return
  props.input.addLook((e.clientX - lastX) * LOOK_SENS, (e.clientY - lastY) * LOOK_SENS)
  lastX = e.clientX; lastY = e.clientY
}
function lookEnd(e: PointerEvent) { if (e.pointerId === lookId) lookId = null }

// ---- 動作按鈕 ----
const aimOn = ref(false), crouchOn = ref(false)
function fire(d: boolean) { props.input.setFire(d) }
function toggleAim() { aimOn.value = !aimOn.value; props.input.setAim(aimOn.value) }
function toggleCrouch() { crouchOn.value = !crouchOn.value; props.input.setCrouch(crouchOn.value) }
function jump() { props.input.queueJump() }
function reload() { props.input.reloadPress() }
function grenade() { props.input.throwGrenade() }
function nextW() { props.input.nextWeapon() }
</script>

<template>
  <div class="absolute inset-0 z-20" style="touch-action:none">
    <!-- 看視層（最底，空白處拖曳轉視角） -->
    <div class="absolute inset-0" style="touch-action:none"
      @pointerdown="lookStart" @pointermove="lookMove" @pointerup="lookEnd" @pointercancel="lookEnd"></div>

    <!-- 左下虛擬搖桿 -->
    <div ref="stickBase"
      class="absolute left-8 bottom-10 rounded-full bg-white/10 border border-white/20"
      style="width:130px;height:130px;touch-action:none"
      @pointerdown.prevent="joyStart" @pointermove="joyMove" @pointerup="joyEnd" @pointercancel="joyEnd">
      <div class="absolute rounded-full bg-white/35 border border-white/40"
        style="width:60px;height:60px;left:35px;top:35px"
        :style="{ transform: `translate(${stickX}px, ${stickY}px)` }"></div>
    </div>

    <!-- 右下：射擊大鈕 -->
    <button class="absolute rounded-full bg-red-500/40 border-2 border-red-400/70 text-white font-black active:bg-red-500/70 select-none"
      style="right:30px;bottom:120px;width:96px;height:96px;touch-action:none"
      @pointerdown.prevent="fire(true)" @pointerup="fire(false)" @pointerleave="fire(false)" @pointercancel="fire(false)">
      射擊
    </button>

    <!-- 右側動作鈕群 -->
    <button class="absolute rounded-full border-2 text-white font-bold select-none"
      :class="aimOn ? 'bg-yellow-400/60 border-yellow-300' : 'bg-black/30 border-white/30'"
      style="right:140px;bottom:150px;width:66px;height:66px;touch-action:none"
      @pointerdown.prevent="toggleAim">瞄準</button>

    <button class="absolute rounded-full bg-black/30 border-2 border-white/30 text-white font-bold select-none active:bg-white/20"
      style="right:30px;bottom:230px;width:66px;height:66px;touch-action:none"
      @pointerdown.prevent="jump">跳</button>

    <button class="absolute rounded-full border-2 text-white font-bold select-none"
      :class="crouchOn ? 'bg-cyan-400/50 border-cyan-300' : 'bg-black/30 border-white/30'"
      style="right:140px;bottom:70px;width:60px;height:60px;touch-action:none"
      @pointerdown.prevent="toggleCrouch">蹲</button>

    <button class="absolute rounded-full bg-black/30 border-2 border-white/30 text-white text-sm font-bold select-none active:bg-white/20"
      style="right:215px;bottom:90px;width:60px;height:60px;touch-action:none"
      @pointerdown.prevent="reload">換彈</button>

    <button class="absolute rounded-full bg-black/30 border-2 border-white/30 text-white text-sm font-bold select-none active:bg-white/20"
      style="right:215px;bottom:165px;width:60px;height:60px;touch-action:none"
      @pointerdown.prevent="nextW">切槍</button>

    <button class="absolute rounded-full bg-orange-500/30 border-2 border-orange-400/60 text-white text-2xl font-bold select-none active:bg-orange-500/60"
      style="right:120px;bottom:235px;width:60px;height:60px;touch-action:none"
      @pointerdown.prevent="grenade">💣</button>
  </div>
</template>
