// ============================================================================
// input.ts — 鍵盤狀態 + 指標鎖定滑鼠 delta（引擎層）。
// ============================================================================

export class Input {
  keys = new Set<string>()
  mouseDX = 0
  mouseDY = 0
  leftDown = false
  rightDown = false
  locked = false
  wheel = 0
  // 一次性按鍵（這一幀剛按下）
  private pressed = new Set<string>()
  private justLeft = false
  private justRight = false

  private el: HTMLElement
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.code
    if (!this.keys.has(k)) this.pressed.add(k)
    this.keys.add(k)
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault()
  }
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code) }
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) { this.leftDown = true; this.justLeft = true }
    if (e.button === 2) { this.rightDown = true; this.justRight = true }
  }
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.leftDown = false
    if (e.button === 2) this.rightDown = false
  }
  private onWheel = (e: WheelEvent) => { this.wheel += Math.sign(e.deltaY) }
  private onLockChange = () => {
    const was = this.locked
    this.locked = document.pointerLockElement === this.el
    if (was && !this.locked) this.onLockLost?.()
    if (!was && this.locked) this.onLockGained?.()
  }
  private onContext = (e: Event) => e.preventDefault()

  // 鎖定狀態變化回呼（事件驅動，避免每幀輪詢造成的競態）
  onLockLost?: () => void
  onLockGained?: () => void

  // ---- 觸控注入（手機）----
  touchMoveX = 0
  touchMoveY = 0
  touchRun = false
  touchCrouch = false
  private jumpQueued = false

  constructor(el: HTMLElement) {
    this.el = el
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    el.addEventListener('mousemove', this.onMouseMove)
    el.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    el.addEventListener('wheel', this.onWheel, { passive: true })
    el.addEventListener('contextmenu', this.onContext)
    document.addEventListener('pointerlockchange', this.onLockChange)
  }

  requestLock() { this.el.requestPointerLock?.() }
  exitLock() { document.exitPointerLock?.() }

  // ---- 觸控注入 API（由 TouchControls.vue 呼叫）----
  setMove(x: number, y: number) { this.touchMoveX = x; this.touchMoveY = y; this.touchRun = Math.hypot(x, y) > 0.85 }
  addLook(dx: number, dy: number) { this.mouseDX += dx; this.mouseDY += dy }
  setFire(down: boolean) { if (down && !this.leftDown) this.justLeft = true; this.leftDown = down }
  setAim(down: boolean) { if (down && !this.rightDown) this.justRight = true; this.rightDown = down }
  queueJump() { this.jumpQueued = true }
  consumeJump(): boolean { const j = this.jumpQueued; this.jumpQueued = false; return j }
  setCrouch(on: boolean) { this.touchCrouch = on }
  reloadPress() { this.pressed.add('KeyR') }
  throwGrenade() { this.pressed.add('KeyG') }
  nextWeapon() { this.wheel += 1 }
  selectWeapon(code: string) { this.pressed.add(code) }

  /** 取出累積滑鼠位移並清零（每幀呼叫一次）。 */
  consumeMouse(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY]
    this.mouseDX = 0; this.mouseDY = 0
    return d
  }
  /** 一次性查詢：本幀剛按下。 */
  justPressed(code: string): boolean { return this.pressed.has(code) }
  justLeftClick(): boolean { return this.justLeft }
  justRightClick(): boolean { return this.justRight }
  consumeWheel(): number { const w = this.wheel; this.wheel = 0; return w }

  /** 每幀末清除一次性狀態。 */
  endFrame() { this.pressed.clear(); this.justLeft = false; this.justRight = false }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.el.removeEventListener('mousemove', this.onMouseMove)
    this.el.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    this.el.removeEventListener('wheel', this.onWheel)
    this.el.removeEventListener('contextmenu', this.onContext)
    document.removeEventListener('pointerlockchange', this.onLockChange)
  }
}
