// ============================================================================
// weapons.ts — 武器系統（引擎層）：視角模型、命中射線(hitscan)、散布、
// 後座、彈匣/換彈、開火節奏、瞄準/開鏡、近戰。資料來自 WEAPONS 表。
// ============================================================================
import {
  Scene, TransformNode, Vector3, Ray, AbstractMesh, Quaternion, Matrix,
} from '@babylonjs/core'
import { WEAPONS, WeaponId, WeaponDef, DROP } from './config'
import { loadModel, instantiateStatic, scaleForWidth } from './model-loader'
import { Player } from './player'
import { Input } from './input'
import { Effects } from './effects'
import { SFX } from './sound'

export interface HitResult {
  point: Vector3
  normal: Vector3
  mesh: AbstractMesh
}
// 命中解析器：由 game.ts 提供（含敵人 + 世界）
export type HitResolver = (origin: Vector3, dir: Vector3, range: number) => HitResult | null
// 敵人受擊回報
export type DamageDealer = (mesh: AbstractMesh, dmg: number, headMult: number, point: Vector3) => void

interface WeaponInstance {
  def: WeaponDef
  holder: TransformNode | null
  mag: number
  reserve: number
  muzzle: TransformNode | null   // 槍管尖端節點（掛在 holder 下，跟著晃動/後座）
}

const GUN_TARGET_LEN = 0.34 // 視角模型統一長度（公尺，最長邊）

export class WeaponSystem {
  scene: Scene
  player: Player
  input: Input
  effects: Effects
  resolveHit: HitResolver
  dealDamage: DamageDealer

  owned: WeaponId[] = ['knife', 'pistol']
  slots: Partial<Record<WeaponId, WeaponInstance>> = {}
  current: WeaponId = 'pistol'

  private cooldown = 0
  private reloading = 0
  private recoilPitch = 0
  private recoilYaw = 0
  private vmKick = 0           // 視角模型後座位移
  private vmRoot: TransformNode
  private swapping = 0
  private bobPhase = 0         // 走路擺動相位

  onAmmoChange?: () => void
  onWeaponChange?: () => void

  constructor(scene: Scene, player: Player, input: Input, effects: Effects, resolver: HitResolver, dealer: DamageDealer) {
    this.scene = scene; this.player = player; this.input = input
    this.effects = effects; this.resolveHit = resolver; this.dealDamage = dealer
    this.vmRoot = new TransformNode('vmRoot', scene)
    this.vmRoot.parent = player.camera
  }

  async init() {
    for (const id of this.owned) await this.ensureLoaded(id)
    await this.equip(this.current)
  }

  private async ensureLoaded(id: WeaponId) {
    if (this.slots[id]) return
    const def = WEAPONS[id]
    const model = await loadModel(this.scene, `/models/guns/${def.model}.gltf`)
    // 用最長邊正規化成統一尺寸
    const longest = Math.max(model.size.x, model.size.y, model.size.z) || 1
    const scale = (GUN_TARGET_LEN / longest) * def.vm.scale
    const inst = instantiateStatic(this.scene, model, scale)
    const holder = inst.holder
    holder.parent = this.vmRoot
    holder.position.set(...def.vm.pos)
    holder.rotation.set(...def.vm.rot)
    holder.setEnabled(false)
    // 視角模型不被自己的射線/碰撞影響
    inst.meshes.forEach((m) => { m.isPickable = false; m.checkCollisions = false })
    // 槍口節點：掛在 holder 下，定位在模型包圍盒的槍管尖端（素材槍管沿 local +X）。
    // footOnGround 已把模型沿 Y 下移 minY，故節點 Y 用相對高度；X 取最前端、Z 取中心。
    const muzzle = new TransformNode(`muzzle_${id}`, this.scene)
    muzzle.parent = holder
    muzzle.position.set(
      model.max.x,
      (model.min.y + model.max.y) / 2 - model.minY,   // 約槍身中線（含貼地補償）
      (model.min.z + model.max.z) / 2,
    )
    this.slots[id] = { def, holder, mag: def.magSize, reserve: def.reserve, muzzle }
  }

  async giveWeapon(id: WeaponId, autoEquip = true) {
    if (!this.owned.includes(id)) this.owned.push(id)
    await this.ensureLoaded(id)
    if (autoEquip) await this.equip(id)
  }

  refillAmmo() {
    for (const id of this.owned) {
      const s = this.slots[id]; if (!s) continue
      s.mag = s.def.magSize; s.reserve = s.def.reserve
    }
    this.onAmmoChange?.()
  }

  async equip(id: WeaponId) {
    if (!this.slots[id]) await this.ensureLoaded(id)
    if (this.slots[this.current]?.holder) this.slots[this.current]!.holder!.setEnabled(false)
    this.current = id
    this.reloading = 0
    this.swapping = 0.35
    this.slots[id]!.holder!.setEnabled(true)
    this.player.resetFov(); this.player.aiming = false
    this.onWeaponChange?.(); this.onAmmoChange?.()
  }

  get cur(): WeaponInstance { return this.slots[this.current]! }

  private startReload() {
    const s = this.cur
    if (s.def.melee || this.reloading > 0) return
    if (s.mag >= s.def.magSize || s.reserve <= 0) return
    this.reloading = s.def.reloadTime
    SFX.reload()
  }

  private finishReload() {
    const s = this.cur
    const need = s.def.magSize - s.mag
    const take = Math.min(need, s.reserve)
    s.mag += take; s.reserve -= take
    this.onAmmoChange?.()
  }

  private tryFire() {
    const s = this.cur
    if (this.cooldown > 0 || this.reloading > 0 || this.swapping > 0) return
    if (s.def.melee) { this.melee(); this.cooldown = 60 / s.def.rpm; return }
    if (s.mag <= 0) { SFX.dryFire(); this.cooldown = 0.2; this.startReload(); return }

    const frenzy = this.player.frenzyT > 0
    const dmgMult = (frenzy ? DROP.frenzyDmgMult : 1) * this.player.damageMult
    const rpm = s.def.rpm * (frenzy ? DROP.frenzyRpmMult : 1)

    s.mag--
    this.cooldown = 60 / rpm
    this.onAmmoChange?.()
    SFX.shoot(s.def.id)

    const cam = this.player.camera
    const origin = cam.position.clone()
    const baseDir = cam.getForwardRay().direction.normalize()
    const spread = this.player.aiming ? s.def.spreadAim : s.def.spreadHip
    // 移動時散布增加
    const moveSpread = this.player.grounded ? 1 : 1.8

    const muzzleWorld = this.muzzleWorldPos()
    this.effects.muzzleFlash(muzzleWorld, baseDir)

    for (let p = 0; p < s.def.pellets; p++) {
      const dir = this.applySpread(baseDir, spread * moveSpread)
      const hit = this.resolveHit(origin, dir, s.def.range)
      const end = hit ? hit.point : origin.add(dir.scale(s.def.range))
      this.effects.tracer(muzzleWorld, end)
      if (hit) {
        const isEnemy = !!(hit.mesh.metadata && hit.mesh.metadata.enemyRef)
        this.effects.impact(hit.point, hit.normal, isEnemy ? 'enemy' : 'world')
        this.dealDamage(hit.mesh, s.def.damage * dmgMult, s.def.headMult, hit.point)
      }
    }

    // 後座 + 鏡頭震動
    this.recoilPitch += s.def.recoil
    this.recoilYaw += (Math.random() - 0.5) * s.def.recoil * 0.8
    this.vmKick = Math.min(0.12, this.vmKick + 0.05)
    this.player.addShake(Math.min(0.5, 0.05 + s.def.recoil * 4))
  }

  private melee() {
    const s = this.cur
    SFX.shoot('knife')
    this.vmKick = 0.08
    const cam = this.player.camera
    const hit = this.resolveHit(cam.position.clone(), cam.getForwardRay().direction.normalize(), s.def.range)
    if (hit) {
      const isEnemy = !!(hit.mesh.metadata && hit.mesh.metadata.enemyRef)
      this.effects.impact(hit.point, hit.normal, isEnemy ? 'enemy' : 'world')
      this.dealDamage(hit.mesh, s.def.damage * this.player.damageMult, s.def.headMult, hit.point)
    }
  }

  private applySpread(dir: Vector3, spread: number): Vector3 {
    if (spread <= 0) return dir
    const up = Math.abs(dir.y) < 0.99 ? Vector3.Up() : Vector3.Right()
    const right = Vector3.Cross(dir, up).normalize()
    const realUp = Vector3.Cross(right, dir).normalize()
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * spread
    return dir.add(right.scale(Math.cos(a) * r)).add(realUp.scale(Math.sin(a) * r)).normalize()
  }

  // 槍口位置：直接讀槍口節點的世界座標（精準落在槍管尖端，且跟著晃動/後座/開鏡）。
  private muzzleWorldPos(): Vector3 {
    const m = this.cur.muzzle
    if (m) {
      m.computeWorldMatrix(true)
      return m.getAbsolutePosition()
    }
    // 後備：相機相對偏移
    const cam = this.player.camera
    return cam.position.add(cam.getForwardRay().direction.normalize().scale(0.6))
  }

  update(dt: number) {
    // 換武器 / 換彈計時
    if (this.swapping > 0) this.swapping -= dt
    if (this.reloading > 0) {
      this.reloading -= dt
      if (this.reloading <= 0) { this.reloading = 0; this.finishReload() }
    }
    if (this.cooldown > 0) this.cooldown -= dt

    // 數字鍵切換武器
    const map: Record<string, WeaponId> = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'ak', Digit4: 'shotgun', Digit5: 'sniper', Digit3b: 'knife' }
    for (const code in map) {
      if (this.input.justPressed(code.replace('b', '')) && this.owned.includes(map[code])) {
        if (this.current !== map[code]) this.equip(map[code])
      }
    }
    if (this.input.justPressed('KeyQ')) this.equip('knife')
    // 滾輪換槍
    const w = this.input.consumeWheel()
    if (w !== 0) {
      const i = this.owned.indexOf(this.current)
      const ni = (i + (w > 0 ? 1 : -1) + this.owned.length) % this.owned.length
      if (this.owned[ni] !== this.current) this.equip(this.owned[ni])
    }
    if (this.input.justPressed('KeyR')) this.startReload()

    // 瞄準 / 開鏡（右鍵）
    const s = this.cur
    const wantAim = this.input.rightDown && !s.def.melee && this.swapping <= 0
    this.player.aiming = wantAim
    if (wantAim) this.player.setFov(s.def.scope ? (s.def.scope * Math.PI) / 180 : this.player.baseFov * 0.72)
    else this.player.resetFov()

    // 開火
    if (s.def.auto) { if (this.input.leftDown) this.tryFire() }
    else { if (this.input.justLeftClick()) this.tryFire() }

    // 後座恢復（鏡頭回正）
    const recover = Math.min(1, dt * 6)
    const dp = this.recoilPitch * recover
    const dyaw = this.recoilYaw * recover
    this.player.pitch -= dp     // 抬升（pitch 變小=往上）
    this.player.yaw += dyaw
    this.recoilPitch -= dp
    this.recoilYaw -= dyaw

    // 武器晃動：走路上下擺動 (bob) + 轉視角延遲 (sway)
    const aim = this.player.aiming
    const bobSpeed = this.player.moving ? (this.input.keys.has('ShiftLeft') ? 13 : 8.5) : 0
    this.bobPhase += dt * bobSpeed
    const bobAmp = aim ? 0.003 : this.player.moving ? 0.013 : 0
    const bobX = Math.cos(this.bobPhase) * bobAmp
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmp
    const swayK = aim ? 0.0002 : 0.0005
    const swayX = Math.max(-0.03, Math.min(0.03, -this.player.lookDX * swayK))
    const swayY = Math.max(-0.03, Math.min(0.03, this.player.lookDY * swayK))
    const vr = this.vmRoot
    const tx = bobX + swayX, ty = bobY * 0.5 + swayY
    vr.position.x += (tx - vr.position.x) * Math.min(1, dt * 12)
    vr.position.y += (ty - vr.position.y) * Math.min(1, dt * 12)
    const tRotY = Math.max(-0.05, Math.min(0.05, -this.player.lookDX * 0.0006))
    const tRotX = Math.max(-0.05, Math.min(0.05, this.player.lookDY * 0.0006))
    vr.rotation.y += (tRotY - vr.rotation.y) * Math.min(1, dt * 8)
    vr.rotation.x += (tRotX - vr.rotation.x) * Math.min(1, dt * 8)

    // 視角模型後座位移恢復 + 瞄準靠中
    this.vmKick = Math.max(0, this.vmKick - dt * 0.6)
    const holder = this.cur.holder
    if (holder) {
      const aimLerp = this.player.aiming && !s.def.scope ? 0.5 : 0
      const tx = s.def.vm.pos[0] * (1 - aimLerp)
      const ty = s.def.vm.pos[1] + (this.player.aiming ? 0.02 : 0)
      const tz = s.def.vm.pos[2] - this.vmKick
      holder.position.x += (tx - holder.position.x) * Math.min(1, dt * 14)
      holder.position.y += (ty - holder.position.y) * Math.min(1, dt * 14)
      holder.position.z += (tz - holder.position.z) * Math.min(1, dt * 18)
      // 開鏡時藏槍（避免擋準心）
      const hideForScope = !!s.def.scope && this.player.aiming
      holder.setEnabled(!hideForScope)
    }
  }

  // HUD 用 getter
  get ammoMag() { return this.cur.def.melee ? -1 : this.cur.mag }
  get ammoReserve() { return this.cur.def.melee ? -1 : this.cur.reserve }
  get weaponName() { return this.cur.def.name }
  get isReloading() { return this.reloading > 0 }
}
