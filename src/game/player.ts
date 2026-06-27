// ============================================================================
// player.ts — 第一人稱控制器（引擎層）：相機、滑鼠看視、WASD 移動、
// 跳躍/重力、蹲下、碰撞、血量/護甲/回血。
// 水平碰撞用不可見 collider mesh 的 moveWithCollisions；垂直（跳/蹲）走相機。
// ============================================================================
import { Scene, FreeCamera, Vector3, MeshBuilder, Mesh } from '@babylonjs/core'
import { Input } from './input'
import { PLAYER, WORLD } from './config'
import { SFX } from './sound'

export class Player {
  scene: Scene
  camera: FreeCamera
  input: Input
  body: Mesh

  yaw = 0
  pitch = 0
  vy = 0
  grounded = true
  crouching = false
  eyeHeight = PLAYER.height

  hp = PLAYER.maxHp
  maxHp = PLAYER.maxHp
  armor = PLAYER.startArmor
  alive = true
  money = 0
  frenzyT = 0               // 限時狂暴剩餘秒數
  // meta 永久加成（第三批套用）
  speedMult = 1
  damageMult = 1
  private lastHurt = -99
  private eyeY = PLAYER.height
  onDamage?: () => void
  onDeath?: () => void

  aiming = false
  baseFov = 0.95
  private targetFov = 0.95

  // 鏡頭震動（trauma 模型：累加、平方套用、衰減）
  private shakeTrauma = 0
  // 該幀滑鼠位移（給武器晃動 sway 用，weapons.update 在 player.update 之後讀取）
  lookDX = 0
  lookDY = 0
  moving = false

  constructor(scene: Scene, input: Input) {
    this.scene = scene
    this.input = input
    this.camera = new FreeCamera('fpsCam', new Vector3(0, PLAYER.height, -WORLD.arenaHalf + 8), scene)
    this.camera.minZ = 0.05
    this.camera.maxZ = 400
    this.camera.fov = this.baseFov
    this.camera.inertia = 0

    // 水平碰撞用的隱形身體
    this.body = MeshBuilder.CreateBox('playerBody', { width: PLAYER.radius * 2, height: PLAYER.height, depth: PLAYER.radius * 2 }, scene)
    this.body.isVisible = false
    this.body.isPickable = false
    this.body.checkCollisions = true
    this.body.ellipsoid = new Vector3(PLAYER.radius, PLAYER.height / 2, PLAYER.radius)
    this.body.position.set(0, PLAYER.height / 2, -WORLD.arenaHalf + 8)
  }

  spawn(pos: Vector3) {
    this.body.position.set(pos.x, PLAYER.height / 2, pos.z)
    this.hp = this.maxHp
    this.alive = true
    this.frenzyT = 0
    this.vy = 0
    this.eyeY = this.eyeHeight
    this.yaw = 0; this.pitch = 0
    this.syncCamera()
  }

  takeDamage(dmg: number) {
    if (!this.alive) return
    let d = dmg
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, d * 0.5)
      this.armor -= absorbed
      d -= absorbed
    }
    this.hp -= d
    this.lastHurt = performance.now() / 1000
    SFX.playerHurt()
    this.onDamage?.()
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.onDeath?.() }
  }

  update(dt: number) {
    if (!this.alive) return
    // --- 滑鼠看視 ---
    const [dx, dy] = this.input.consumeMouse()
    this.lookDX = dx; this.lookDY = dy
    this.yaw += dx * PLAYER.mouseSensitivity
    this.pitch += dy * PLAYER.mouseSensitivity
    const lim = Math.PI / 2 - 0.05
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch))

    // --- 蹲下 ---
    this.crouching = this.input.keys.has('ControlLeft') || this.input.keys.has('KeyC') || this.input.touchCrouch
    const targetEye = this.crouching ? PLAYER.height * 0.62 : PLAYER.height

    // --- 水平移動 ---
    const forward = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    let move = Vector3.Zero()
    if (this.input.keys.has('KeyW')) move.addInPlace(forward)
    if (this.input.keys.has('KeyS')) move.subtractInPlace(forward)
    if (this.input.keys.has('KeyD')) move.addInPlace(right)
    if (this.input.keys.has('KeyA')) move.subtractInPlace(right)
    // 觸控搖桿
    if (this.input.touchMoveX !== 0 || this.input.touchMoveY !== 0) {
      move.addInPlace(forward.scale(this.input.touchMoveY))
      move.addInPlace(right.scale(this.input.touchMoveX))
    }

    const running = (this.input.keys.has('ShiftLeft') || this.input.touchRun) && !this.crouching
    const speed = (this.crouching ? PLAYER.crouchSpeed : running ? PLAYER.runSpeed : PLAYER.walkSpeed) * this.speedMult
    const isMoving = move.lengthSquared() > 0
    this.moving = isMoving && this.grounded
    if (isMoving) {
      move.normalize().scaleInPlace(speed * dt)
      this.body.moveWithCollisions(new Vector3(move.x, 0, move.z))
    }
    this.body.position.y = PLAYER.height / 2

    // 邊界夾制
    const h = WORLD.arenaHalf - 0.6
    this.body.position.x = Math.max(-h, Math.min(h, this.body.position.x))
    this.body.position.z = Math.max(-h, Math.min(h, this.body.position.z))

    // --- 跳躍 / 重力（相機 Y） ---
    if (this.grounded && (this.input.keys.has('Space') || this.input.consumeJump()) && !this.crouching) {
      this.vy = PLAYER.jumpSpeed
      this.grounded = false
    }
    this.vy += WORLD.gravity * dt
    let ny = this.eyeY + this.vy * dt
    if (ny <= targetEye) {
      ny = targetEye; this.vy = 0; this.grounded = true
      // 蹲站平滑
      ny = this.lerp(this.eyeY, targetEye, Math.min(1, dt * 12))
    } else {
      this.grounded = false
    }
    this.eyeY = ny

    // --- 回血 ---
    const now = performance.now() / 1000
    if (now - this.lastHurt > PLAYER.regenDelay && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + PLAYER.regenRate * dt)
    }

    // --- 狂暴計時 ---
    if (this.frenzyT > 0) this.frenzyT = Math.max(0, this.frenzyT - dt)

    // --- FOV 過渡 ---
    this.camera.fov = this.lerp(this.camera.fov, this.targetFov, Math.min(1, dt * 14))

    // --- 鏡頭震動衰減 ---
    if (this.shakeTrauma > 0) this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.8)

    this.syncCamera()
  }

  /** 觸發鏡頭震動（0~1，可累加）。開火/受傷/爆炸時呼叫。 */
  addShake(amount: number) { this.shakeTrauma = Math.min(1, this.shakeTrauma + amount) }

  private syncCamera() {
    this.camera.position.set(this.body.position.x, this.eyeY, this.body.position.z)
    // trauma 平方讓小震動柔和、大震動明顯；只抖 pitch/yaw，不滾轉 roll（避免地平線歪掉暈眩）
    const s = this.shakeTrauma * this.shakeTrauma
    if (s > 0.0001) {
      const sp = (Math.random() * 2 - 1) * s * 0.05
      const sy = (Math.random() * 2 - 1) * s * 0.05
      this.camera.rotation.set(this.pitch + sp, this.yaw + sy, 0)
    } else {
      this.camera.rotation.set(this.pitch, this.yaw, 0)
    }
  }

  heal(amount: number) { this.hp = Math.min(this.maxHp, this.hp + amount) }
  grantFrenzy(sec: number) { this.frenzyT = Math.max(this.frenzyT, sec) }

  setFov(f: number) { this.targetFov = f }
  resetFov() { this.targetFov = this.baseFov }

  get position() { return this.camera.position }
  private lerp(a: number, b: number, t: number) { return a + (b - a) * t }
}
