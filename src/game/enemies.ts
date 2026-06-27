// ============================================================================
// enemies.ts — 敵人系統（引擎層）：動畫池、AI（追擊/開火/閃白/死亡）。
// 資料來自 ENEMIES 表 + 模型路徑（資料/資產層）。
// 骨架動畫單位用 instantiateModelsToScene（見 model-loader）。
// ============================================================================
import {
  Scene, Vector3, MeshBuilder, AbstractMesh, Mesh, Ray,
  StandardMaterial, Color3, TransformNode, AnimationGroup,
} from '@babylonjs/core'
import { ENEMIES, EnemyId, EnemyDef, WORLD } from './config'
import { loadModel, instantiate, scaleForHeight, ModelInstance } from './model-loader'
import { Player } from './player'
import { GameMap } from './map'
import { BulletManager } from './projectiles'
import { SFX } from './sound'

const ANIM_NAMES = {
  idle: /idle$/i,
  run: /^run$|run_gun|^walk$/i,
  shoot: /idle_shoot|run_shoot|shoot/i,
  death: /death/i,
  hit: /hitreact|hit/i,
}

type State = 'idle' | 'chase' | 'attack' | 'dead'

export class Enemy {
  def: EnemyDef
  inst: ModelInstance
  body: Mesh
  head: Mesh
  hp = 0
  state: State = 'idle'
  active = false
  private attackCd = 0
  private overlayT = 0
  private deathT = 0
  private detourSign = 1     // 繞行慣用側（避免左右抖動）
  private detourT = 0        // 繞行計時：>0 時暫時不直走、固定繞同一側
  private curAnim: AnimationGroup | null = null
  private targetHeight: number
  exploding = false               // 自爆兵：本幀觸發自爆
  private tint: Color3 | null = null
  private mods = { hp: 1, dmg: 1, spd: 1 }   // 難度倍率
  // 王招式狀態
  private bossCastCd = 3
  private bossCastType = 0
  private bossEnraged = false
  private bossSummonStage = 0
  private maxHpRuntime = 0
  bossFire?: (pos: Vector3, dir: Vector3, speed: number, dmg: number) => void
  bossSummon?: (n: number) => void
  shoot?: (from: Vector3, to: Vector3) => void   // 開火曳光（視覺）
  // 頭頂血條
  private barBG!: Mesh
  private barFill!: Mesh
  private barFillMat!: StandardMaterial
  private barFullW = 0.78

  constructor(public scene: Scene, def: EnemyDef, inst: ModelInstance, targetHeight: number) {
    this.def = def
    this.inst = inst
    this.targetHeight = targetHeight
    // 受擊判定盒（身體 + 頭），不可見、可被射線選取
    const h = targetHeight
    this.body = MeshBuilder.CreateBox('enemyBody', { width: 0.7, height: h * 0.78, depth: 0.5 }, scene)
    this.head = MeshBuilder.CreateBox('enemyHead', { width: 0.42, height: h * 0.22, depth: 0.42 }, scene)
    this.body.isVisible = false; this.head.isVisible = false
    this.body.isPickable = true; this.head.isPickable = true
    this.body.metadata = { enemyRef: this, head: false }
    this.head.metadata = { enemyRef: this, head: true }
    this.body.parent = inst.holder
    this.head.parent = inst.holder
    // 相對 holder（holder 已縮放，這裡用未縮放單位 → 除以 scale）
    const sc = inst.holder.scaling.x || 1
    this.body.position.set(0, (h * 0.39) / sc, 0)
    this.body.scaling.setAll(1 / sc)
    this.head.position.set(0, (h * 0.89) / sc, 0)
    this.head.scaling.setAll(1 / sc)
    this.buildHealthBar(sc, h)
    if (def.tint) this.tint = new Color3(def.tint[0], def.tint[1], def.tint[2])
    this.setColliders(false)
  }

  // 頭頂血條：底板（深色）+ 填充（綠→黃→紅），billboard 永遠面向相機。
  private buildHealthBar(sc: number, h: number) {
    const barW = 0.86, barH = 0.13
    const yTop = (h + 0.35) / sc       // 頭頂上方
    this.barBG = MeshBuilder.CreatePlane('hpbg', { width: barW, height: barH }, this.scene)
    const bgMat = new StandardMaterial('hpbgMat', this.scene)
    bgMat.emissiveColor = new Color3(0.02, 0.02, 0.02)
    bgMat.diffuseColor = new Color3(0, 0, 0)
    bgMat.disableLighting = true
    bgMat.backFaceCulling = false
    this.barBG.material = bgMat
    this.barBG.parent = this.inst.holder
    this.barBG.position.set(0, yTop, 0)
    this.barBG.scaling.setAll(1 / sc)
    this.barBG.billboardMode = Mesh.BILLBOARDMODE_ALL
    this.barBG.isPickable = false

    this.barFill = MeshBuilder.CreatePlane('hpfill', { width: this.barFullW, height: barH * 0.66 }, this.scene)
    this.barFillMat = new StandardMaterial('hpfillMat', this.scene)
    this.barFillMat.emissiveColor = new Color3(0.25, 0.9, 0.25)
    this.barFillMat.diffuseColor = new Color3(0, 0, 0)
    this.barFillMat.disableLighting = true
    this.barFillMat.backFaceCulling = false
    this.barFillMat.disableDepthWrite = true   // 永遠畫在底板之上，避免 z-fighting
    this.barFill.material = this.barFillMat
    this.barFill.parent = this.barBG
    this.barFill.position.set(0, 0, -0.01)      // 朝相機方向（底板 billboard 後的 -z）
    this.barFill.isPickable = false
  }

  private updateBar() {
    const ratio = Math.max(0, Math.min(1, this.hp / this.def.hp))
    this.barFill.scaling.x = ratio
    this.barFill.position.x = -(this.barFullW / 2) * (1 - ratio)  // 從右往左縮
    if (ratio > 0.5) this.barFillMat.emissiveColor.set(0.25, 0.9, 0.25)
    else if (ratio > 0.25) this.barFillMat.emissiveColor.set(0.95, 0.8, 0.1)
    else this.barFillMat.emissiveColor.set(0.95, 0.2, 0.15)
  }

  private setBarVisible(on: boolean) {
    this.barBG.setEnabled(on)
    this.barFill.setEnabled(on)
  }

  private setColliders(on: boolean) {
    this.body.isPickable = on; this.head.isPickable = on
    this.body.setEnabled(on); this.head.setEnabled(on)
  }

  spawn(pos: Vector3, mods?: { hp: number; dmg: number; spd: number }) {
    if (mods) this.mods = mods
    this.hp = this.def.hp * this.mods.hp
    this.state = 'chase'
    this.active = true
    this.deathT = 0
    this.attackCd = 0
    this.detourT = 0
    this.exploding = false
    this.inst.holder.setEnabled(true)
    this.inst.holder.position.copyFrom(pos)
    this.setColliders(true)
    this.updateBar()
    this.setBarVisible(true)
    this.play('run', true)
  }

  private play(key: keyof typeof ANIM_NAMES, loop: boolean) {
    const g = this.inst.anims[key]
    if (!g || this.curAnim === g) return
    this.curAnim?.stop()
    g.start(loop, 1.0, g.from, g.to)
    this.curAnim = g
  }

  hurt(dmg: number, isHead: boolean, headMult: number): { killed: boolean; isHead: boolean; dealt: number } {
    if (this.state === 'dead') return { killed: false, isHead, dealt: 0 }
    const real = isHead ? dmg * headMult : dmg
    this.hp -= real
    this.overlayT = 0.08
    this.updateBar()
    SFX.enemyHit()
    if (this.hp <= 0) { this.die(); return { killed: true, isHead, dealt: real } }
    return { killed: false, isHead, dealt: real }
  }

  private die() {
    this.state = 'dead'
    this.deathT = 2.2
    this.setColliders(false)
    this.setBarVisible(false)
    SFX.enemyDie()
    this.play('death', false)
  }

  /** AI 更新。回傳對玩家造成的傷害（0=無）。 */
  update(dt: number, player: Player, map: GameMap, scene: Scene): number {
    // 受擊閃白 + 兵種染色（overlay）
    if (this.overlayT > 0) {
      this.overlayT -= dt
      const done = this.overlayT <= 0
      this.inst.meshes.forEach((m) => {
        if (done && !this.tint) { m.renderOverlay = false; return }
        m.renderOverlay = true
        ;(m as any).overlayAlpha = done ? 0.35 : Math.max(this.overlayT / 0.08, this.tint ? 0.35 : 0)
        m.overlayColor = done ? (this.tint || Color3.White()) : Color3.White()
      })
    } else if (this.tint) {
      this.inst.meshes.forEach((m) => { m.renderOverlay = true; (m as any).overlayAlpha = 0.35; m.overlayColor = this.tint! })
    }

    if (this.state === 'dead') {
      this.deathT -= dt
      if (this.deathT <= 0) this.deactivate()
      return 0
    }

    const pos = this.inst.holder.position
    const toPlayer = player.position.subtract(pos)
    toPlayer.y = 0
    const dist = toPlayer.length()
    const dir = dist > 0.001 ? toPlayer.scale(1 / dist) : new Vector3(0, 0, 1)
    // 面向玩家（轉 holder，避開 __root__ 四元數）
    this.inst.holder.rotation.y = Math.atan2(dir.x, dir.z)

    // 自爆兵：衝向玩家，接觸即引爆（傷害由 manager 處理）
    if (this.def.suicide) {
      if (dist <= this.def.range) { this.exploding = true; this.die(); return 0 }
      this.state = 'chase'
      this.play('run', true)
      this.move(dir, dt, map, pos)
      return 0
    }

    let dmgDealt = 0
    const inRange = dist <= this.def.range
    const los = this.hasLOS(pos, player.position, scene)

    if (inRange && los) {
      this.state = 'attack'
      this.play('shoot', true)
      this.attackCd -= dt
      if (this.attackCd <= 0) {
        this.attackCd = 60 / this.def.rpm
        if (this.def.melee) {
          // 近戰：貼身必中，揮刀音效，不射曳光
          dmgDealt += this.def.damage * this.mods.dmg
          SFX.shoot('knife')
        } else {
          const hit = Math.random() < this.def.accuracy
          if (hit) dmgDealt += this.def.damage * this.mods.dmg
          // 可見曳光：命中=直射玩家，未命中=偏一點從旁掠過
          if (this.shoot) {
            const from = pos.add(new Vector3(0, 1.4, 0)).add(dir.scale(0.5))
            const to = player.position.clone()
            if (!hit) { to.x += (Math.random() - 0.5) * 2.4; to.y += (Math.random() - 0.5) * 1.2; to.z += (Math.random() - 0.5) * 2.4 }
            this.shoot(from, to)
          }
        }
      }
      // 近戰型仍會稍微逼近
      if (this.def.range <= 8 && dist > 1.6) this.move(dir, dt, map, pos)
    } else {
      this.state = 'chase'
      this.play('run', true)
      this.move(dir, dt, map, pos)
    }
    if (this.def.boss) this.updateBoss(dt, player)
    return dmgDealt
  }

  // 王招式：狂暴化、召喚、彈幕
  private updateBoss(dt: number, player: Player) {
    const frac = this.maxHpRuntime > 0 ? this.hp / this.maxHpRuntime : 1
    // 血量 ≤35% 狂暴化（一次性）：加速 + 變紅 + 施法更快
    if (!this.bossEnraged && frac <= 0.35) {
      this.bossEnraged = true
      this.mods.spd *= 1.6
      this.tint = new Color3(1, 0.12, 0.12)
    }
    // 跨血量門檻召喚小兵
    if (this.bossSummonStage === 0 && frac <= 0.66) { this.bossSummonStage = 1; this.bossSummon?.(3) }
    else if (this.bossSummonStage === 1 && frac <= 0.33) { this.bossSummonStage = 2; this.bossSummon?.(4) }
    // 彈幕（環射 / 扇形交替）
    this.bossCastCd -= dt
    if (this.bossCastCd <= 0) {
      this.bossCastCd = this.bossEnraged ? 2.2 : 3.6
      this.castBarrage(player)
    }
  }

  private castBarrage(player: Player) {
    if (!this.bossFire) return
    const origin = this.inst.holder.position.add(new Vector3(0, 1.6, 0))
    const speed = 6                  // 王彈幕速度放慢一半
    const dmg = this.def.damage * 0.7 * this.mods.dmg
    if (this.bossCastType === 0) {
      const n = 18
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        this.bossFire(origin, new Vector3(Math.sin(a), 0, Math.cos(a)), speed, dmg)
      }
    } else {
      const to = player.position.subtract(origin); to.y = 0
      const base = Math.atan2(to.x, to.z)
      for (let k = -2; k <= 2; k++) {
        const a = base + k * 0.16
        this.bossFire(origin, new Vector3(Math.sin(a), 0, Math.cos(a)), speed + 1, dmg)
      }
    }
    this.bossCastType ^= 1
    SFX.enemyHit()
  }

  /** 立即停用（重開遊戲清場用）。 */
  despawn() { this.deactivate() }

  private move(dir: Vector3, dt: number, map: GameMap, pos: Vector3): boolean {
    const step = this.def.speed * this.mods.spd * dt
    const h = WORLD.arenaHalf - 1
    const apply = (vx: number, vz: number) => {
      const nx = pos.x + vx, nz = pos.z + vz
      if (!map.blocked(nx, nz, 0.5) && Math.abs(nx) < h && Math.abs(nz) < h) { pos.x = nx; pos.z = nz; return true }
      return false
    }
    if (this.detourT > 0) this.detourT -= dt

    // 1) 直接朝目標（繞行中暫時略過，避免在角落來回抖）
    if (this.detourT <= 0 && apply(dir.x * step, dir.z * step)) return true

    // 2) 沿軸滑行：分別只走 X 或只走 Z 分量（軸對齊的牆/箱子可順順滑過）
    if (Math.abs(dir.x) > 0.05 && apply(dir.x * step, 0)) return true
    if (Math.abs(dir.z) > 0.05 && apply(0, dir.z * step)) return true

    // 3) 角度偏轉：慣用側優先，左右交替，角度由小到大（最多近 ±110°）可繞過障礙與轉角
    const angles = [0.45, 0.9, 1.35, 1.9]
    for (const a of angles) {
      for (const sgn of [this.detourSign, -this.detourSign]) {
        const ang = a * sgn
        const c = Math.cos(ang), s = Math.sin(ang)
        const nd = new Vector3(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c)
        if (apply(nd.x * step, nd.z * step)) {
          if (a >= 0.9) { this.detourSign = sgn >= 0 ? 1 : -1; this.detourT = 0.5 }  // 需大幅繞行→鎖定這側一陣子
          return true
        }
      }
    }

    // 4) 完全卡住 → 換邊再繞
    this.detourSign = -this.detourSign
    this.detourT = 0.6
    return false
  }

  private hasLOS(from: Vector3, to: Vector3, scene: Scene): boolean {
    const o = from.add(new Vector3(0, 1.4, 0))
    const t = to.clone()
    const d = t.subtract(o)
    const len = d.length()
    const ray = new Ray(o, d.normalize(), len)
    const pick = scene.pickWithRay(ray, (m) => !!(m.metadata && (m as any).metadata.world))
    return !pick || !pick.hit || pick.distance >= len - 0.5
  }

  private deactivate() {
    this.active = false
    this.state = 'idle'
    this.inst.holder.setEnabled(false)
    this.inst.meshes.forEach((m) => { m.renderOverlay = false })
    this.setBarVisible(false)
    this.curAnim?.stop(); this.curAnim = null
  }
}

export class EnemyManager {
  scene: Scene
  player: Player
  map: GameMap
  pool: Enemy[] = []
  alive: Enemy[] = []
  diff = { hp: 1, dmg: 1, spd: 1 }   // 難度倍率（spawn 時傳給敵人）
  onPlayerDamage: (dmg: number, from: Vector3 | null) => void
  onKill: (e: Enemy, isHead: boolean) => void
  onDamage?: (point: Vector3, amount: number, isHead: boolean) => void
  onBomberExplode?: (pos: Vector3, radius: number, dmg: number) => void
  onEnemyShot?: (from: Vector3, to: Vector3) => void
  bullets: BulletManager

  constructor(scene: Scene, player: Player, map: GameMap, onPlayerDamage: (d: number, from: Vector3 | null) => void, onKill: (e: Enemy, h: boolean) => void) {
    this.scene = scene; this.player = player; this.map = map
    this.onPlayerDamage = onPlayerDamage; this.onKill = onKill
    this.bullets = new BulletManager(scene)
  }

  async preload() {
    for (const id in ENEMIES) await loadModel(this.scene, `/models/characters/${ENEMIES[id as EnemyId].model}.gltf`)
  }

  private async makeEnemy(def: EnemyDef): Promise<Enemy> {
    const model = await loadModel(this.scene, `/models/characters/${def.model}.gltf`)
    const targetHeight = 1.7 * def.scale
    const scale = scaleForHeight(model, targetHeight)
    const inst = instantiate(this.scene, model, scale, ANIM_NAMES, true)
    inst.holder.setEnabled(false)
    const e = new Enemy(this.scene, def, inst, targetHeight)
    e.shoot = (from, to) => this.onEnemyShot?.(from, to)
    if (def.boss) {
      e.bossFire = (pos, dir, speed, dmg) => this.bullets.spawn(pos, dir, speed, dmg)
      e.bossSummon = (n) => this.summonAround(e, n)
    }
    this.pool.push(e)
    return e
  }

  /** 王召喚：在王周圍隨機 spawn 小兵。 */
  private summonAround(boss: Enemy, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 3 + Math.random() * 2.5
      const p = boss.inst.holder.position.add(new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
      p.y = 0
      this.spawn(Math.random() < 0.5 ? 'grunt' : 'rusher', p)
    }
  }

  /** 重開遊戲：清掉所有現存敵人與彈幕。 */
  reset() {
    this.alive.forEach((e) => e.despawn())
    this.alive = []
    this.bullets.clear()
  }

  async spawn(id: EnemyId, pos: Vector3) {
    const def = ENEMIES[id]
    // 找閒置且同型的；否則新建
    let e = this.pool.find((p) => !p.active && p.def.id === id)
    if (!e) e = await this.makeEnemy(def)
    e.spawn(pos, { ...this.diff })
    this.alive.push(e)
  }

  update(dt: number) {
    let dmg = 0
    let lastFrom: Vector3 | null = null
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const e = this.alive[i]
      const d = e.update(dt, this.player, this.map, this.scene)
      if (d > 0) { dmg += d; lastFrom = e.inst.holder.position.clone() }
      // 自爆兵引爆（每隻只觸發一次）
      if (e.exploding) {
        e.exploding = false
        this.onBomberExplode?.(e.inst.holder.position.clone(), e.def.explodeRadius || 4, e.def.explodeDmg || 40)
      }
      if (!e.active) this.alive.splice(i, 1)
    }
    if (dmg > 0) this.onPlayerDamage(dmg, lastFrom)
    // 王彈幕飛行 + 撞玩家
    this.bullets.update(dt, this.player, this.map, this.onPlayerDamage)
  }

  /** 武器系統呼叫：對某 mesh 造成傷害。 */
  damageMesh(mesh: AbstractMesh, dmg: number, headMult: number, _point: Vector3) {
    const ref = mesh.metadata?.enemyRef as Enemy | undefined
    if (!ref) return
    const isHead = !!mesh.metadata?.head
    const before = ref.state
    const res = ref.hurt(dmg, isHead, headMult)
    if (res.dealt > 0) this.onDamage?.(_point.clone(), res.dealt, isHead)
    if (res.killed && before !== 'dead') this.onKill(ref, isHead)
  }

  /** 範圍爆炸傷害（爆炸桶）：依距離遞減。 */
  explodeDamage(center: Vector3, radius: number, maxDmg: number) {
    for (const e of this.alive) {
      if (e.state === 'dead') continue
      const d = Vector3.Distance(e.inst.holder.position, center)
      if (d < radius) {
        const dmg = maxDmg * (1 - d / radius)
        const res = e.hurt(dmg, false, 1)
        if (res.dealt > 0) this.onDamage?.(e.inst.holder.position.add(new Vector3(0, 1.4, 0)), res.dealt, false)
        if (res.killed) this.onKill(e, false)
      }
    }
  }

  get aliveCount() { return this.alive.filter((e) => e.state !== 'dead').length }
  get pendingDead() { return this.alive.filter((e) => e.state === 'dead').length }
}
