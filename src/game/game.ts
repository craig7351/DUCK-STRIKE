// ============================================================================
// game.ts — 主迴圈總指揮（引擎層）：場景/光照、命中解析、波次、經濟、
// 計分、購買、狀態機。把可重用流程與資料/資產解耦。
// ============================================================================
import {
  Engine, Scene, Vector3, HemisphericLight, DirectionalLight, Color3, Color4,
  Ray, GlowLayer, AbstractMesh, MeshBuilder, StandardMaterial, Matrix,
} from '@babylonjs/core'
import { Input } from './input'
import { Player } from './player'
import { GameMap } from './map'
import { Effects } from './effects'
import { WeaponSystem } from './weapons'
import { EnemyManager, Enemy } from './enemies'
import { PickupManager } from './pickups'
import { GrenadeManager } from './grenades'
import { Meta } from './meta'
import {
  WEAPONS, WeaponId, ENEMIES, EnemyId, waveSpec, ECONOMY, PLAYER,
  DIFFICULTIES, Difficulty, DROP, KILLSTREAK, PickupKind, GRENADE,
} from './config'
import { SFX, initAudio } from './sound'

export type Phase = 'loading' | 'menu' | 'playing' | 'buy' | 'paused' | 'dead'

// 螢幕飄字（傷害數字 / 擊殺獎勵）
export interface FloatText {
  id: number; x: number; y: number; text: string; color: string; born: number; big: boolean
}

export interface GameState {
  phase: Phase
  hp: number
  armor: number
  money: number
  weaponName: string
  ammoMag: number
  ammoReserve: number
  reloading: boolean
  aiming: boolean
  wave: number
  enemiesLeft: number
  kills: number
  score: number
  streak: number
  bestStreak: number
  hitMarker: number       // 時間戳，UI 用來閃命中標記
  headshotMarker: number
  damageFlash: number
  message: string
  owned: WeaponId[]
  current: WeaponId
  loadPct: number
  floats: FloatText[]
  difficulty: Difficulty
  frenzyT: number          // 狂暴剩餘秒數（HUD 顯示）
  isBossWave: boolean
  damageDir: number        // 受擊方向（相對玩家朝向的角度，rad）；用 damageDirAt 計時顯示
  damageDirAt: number
  metaCoins: number
  board: { score: number; wave: number; date: string }[]
  runCoins: number         // 本場結束獲得的 meta 金幣
  grenades: number         // 手榴彈攜帶數
}

export function createGameState(): GameState {
  return {
    phase: 'loading', hp: 100, armor: 0, money: 0, weaponName: '', ammoMag: 0, ammoReserve: 0,
    reloading: false, aiming: false, wave: 0, enemiesLeft: 0, kills: 0, score: 0, streak: 0,
    bestStreak: 0, hitMarker: 0, headshotMarker: 0, damageFlash: 0, message: '', owned: [], current: 'pistol', loadPct: 0,
    floats: [],
    difficulty: 'normal', frenzyT: 0, isBossWave: false, damageDir: 0, damageDirAt: 0,
    metaCoins: 0, board: [], runCoins: 0, grenades: 0,
  }
}

export class Game {
  engine: Engine
  scene: Scene
  input: Input
  player!: Player
  map!: GameMap
  effects!: Effects
  weapons!: WeaponSystem
  enemies!: EnemyManager
  pickups!: PickupManager
  grenades!: GrenadeManager
  state: GameState

  private spawnQueue: EnemyId[] = []
  private spawnTimer = 0
  private waveActive = false
  private ready = false
  private floatSeq = 0
  private diffCountMult = 1
  private diffReward = 1
  private diffBase = { hp: 1, dmg: 1, spd: 1 }   // 難度基準倍率（波次成長疊乘在上）
  private grenadeCd = 0
  touchMode = false        // 觸控裝置（手機 / ?touch）：不請求指標鎖定，改用虛擬搖桿

  constructor(canvas: HTMLCanvasElement, state: GameState) {
    this.state = state
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true)
    this.scene = new Scene(this.engine)
    this.scene.collisionsEnabled = true
    this.scene.gravity = new Vector3(0, -0.5, 0)
    this.scene.clearColor = new Color4(0.45, 0.55, 0.68, 1)
    this.scene.fogMode = Scene.FOGMODE_LINEAR
    this.scene.fogColor = new Color3(0.45, 0.55, 0.68)
    this.scene.fogStart = 70; this.scene.fogEnd = 160
    this.input = new Input(canvas)
  }

  async init() {
    const s = this.scene
    // 光照
    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.2), s)
    hemi.intensity = 0.85
    hemi.groundColor = new Color3(0.35, 0.35, 0.4)
    const dir = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.4), s)
    dir.intensity = 1.0
    dir.position = new Vector3(40, 60, 40)

    const glow = new GlowLayer('glow', s)
    glow.intensity = 0.7

    this.state.loadPct = 10
    this.player = new Player(s, this.input)
    this.player.onDamage = () => { this.state.damageFlash = performance.now() }
    this.player.onDeath = () => this.gameOver()

    this.effects = new Effects(s)
    this.map = new GameMap(s)
    await this.map.build()
    this.state.loadPct = 55

    this.enemies = new EnemyManager(
      s, this.player, this.map,
      (dmg, from) => { this.player.takeDamage(dmg); if (from) this.registerDamageFrom(from) },
      (e, head) => this.onKill(e, head),
    )
    this.enemies.onDamage = (point, amount, isHead) =>
      this.addFloat(point, String(Math.round(amount)), isHead ? '#ff5b5b' : '#ffffff', isHead)
    this.enemies.onBomberExplode = (pos, radius, dmg) => this.bomberExplode(pos, radius, dmg)
    this.enemies.onEnemyShot = (from, to) => this.effects.enemyTracer(from, to)
    await this.enemies.preload()

    this.pickups = new PickupManager(s, this.player, (kind) => this.collect(kind))
    await this.pickups.preload()

    this.grenades = new GrenadeManager(s, this.map, (pos) => this.grenadeExplode(pos))
    await this.grenades.preload()
    this.state.loadPct = 80

    this.weapons = new WeaponSystem(
      s, this.player, this.input, this.effects,
      (o, d, r) => this.resolveHit(o, d, r),
      (m, dmg, hm, pt) => this.onWeaponHit(m, dmg, hm, pt),
    )
    this.weapons.onAmmoChange = () => this.syncWeaponHud()
    this.weapons.onWeaponChange = () => this.syncWeaponHud()
    await this.weapons.init()
    this.state.loadPct = 100

    // 失去指標鎖定（按 Esc）→ 暫停；事件驅動，避免啟動時的鎖定競態
    this.input.onLockLost = () => { if (this.state.phase === 'playing') this.pause() }
    // 遊玩中若未鎖定（鎖定意外掉失），點擊畫面重新鎖定
    const canvas = this.engine.getRenderingCanvas()
    canvas?.addEventListener('mousedown', () => {
      if (!this.touchMode && this.state.phase === 'playing' && !this.input.locked) this.input.requestLock()
    })

    this.ready = true
    this.state.phase = 'menu'

    // 主迴圈
    this.engine.resize()
    this.engine.runRenderLoop(() => this.frame())
    window.addEventListener('resize', () => this.engine.resize())
    if (import.meta.env.DEV) (window as any).__ds = this
  }

  // ---- 命中解析（hitscan）：敵人受擊盒 + 世界碰撞 ----
  private resolveHit(origin: Vector3, dir: Vector3, range: number) {
    const ray = new Ray(origin, dir, range)
    const pick = this.scene.pickWithRay(ray, (m: AbstractMesh) =>
      m.isPickable && !!(m.metadata && (m.metadata.enemyRef || m.metadata.world)),
    )
    if (pick && pick.hit && pick.pickedPoint) {
      return { point: pick.pickedPoint, normal: pick.getNormal(true) || Vector3.Up(), mesh: pick.pickedMesh! }
    }
    return null
  }

  // ---- 武器命中分派：敵人 or 爆炸桶 ----
  private onWeaponHit(mesh: AbstractMesh, dmg: number, headMult: number, point: Vector3) {
    if (mesh.metadata?.enemyRef) this.enemies.damageMesh(mesh, dmg, headMult, point)
    else if (mesh.metadata?.barrel) this.damageBarrel(mesh.metadata.barrel, dmg)
  }

  private damageBarrel(barrel: any, dmg: number) {
    if (barrel.exploded) return
    barrel.hp -= dmg
    if (barrel.hp <= 0) this.explodeBarrel(barrel)
  }

  private explodeBarrel(barrel: any) {
    if (barrel.exploded) return
    barrel.exploded = true
    const R = 6.5, maxDmg = 95
    const pos: Vector3 = barrel.pos
    this.effects.blast(pos, R)
    SFX.explode()
    // 隱藏視覺 + 移除碰撞
    barrel.holder.setEnabled(false)
    barrel.collider.isPickable = false
    barrel.collider.checkCollisions = false
    barrel.collider.setEnabled(false)
    // 範圍傷害（敵人 + 玩家）
    this.enemies.explodeDamage(pos, R, maxDmg)
    const pd = Vector3.Distance(this.player.position, pos)
    if (pd < R && this.player.alive) {
      this.player.takeDamage(maxDmg * 0.7 * (1 - pd / R))
      this.registerDamageFrom(pos)
      this.player.addShake(0.8)
    } else if (pd < R * 2) {
      this.player.addShake(0.4 * (1 - pd / (R * 2)))
    }
    this.addFloat(pos.add(new Vector3(0, 1.5, 0)), 'BOOM!', '#ff7a00', true)
    // 連鎖引爆鄰近桶
    for (const b of this.map.barrels) {
      if (!b.exploded && Vector3.Distance(b.pos, pos) < R + 1) {
        setTimeout(() => this.explodeBarrel(b), 110 + Math.random() * 120)
      }
    }
  }

  // ---- 自爆兵引爆 ----
  private bomberExplode(pos: Vector3, radius: number, dmg: number) {
    this.effects.blast(pos, radius)
    SFX.explode()
    const pd = Vector3.Distance(this.player.position, pos)
    if (pd < radius && this.player.alive) {
      this.player.takeDamage(dmg * (1 - pd / radius))
      this.registerDamageFrom(pos)
      this.player.addShake(0.6)
    } else if (pd < radius * 1.8) {
      this.player.addShake(0.3 * (1 - pd / (radius * 1.8)))
    }
    this.addFloat(pos.add(new Vector3(0, 1.4, 0)), '💥', '#ff7a00', true)
  }

  // ---- 手榴彈爆炸：範圍傷敵 + 自傷 + 引爆鄰近桶 ----
  private grenadeExplode(pos: Vector3) {
    const R = GRENADE.radius
    this.effects.blast(pos, R)
    SFX.explode()
    this.enemies.explodeDamage(pos, R, GRENADE.damage)
    const pd = Vector3.Distance(this.player.position, pos)
    if (pd < R && this.player.alive) {
      this.player.takeDamage(GRENADE.damage * GRENADE.playerDmgFactor * (1 - pd / R))
      this.registerDamageFrom(pos)
      this.player.addShake(0.7)
    } else if (pd < R * 2) {
      this.player.addShake(0.35 * (1 - pd / (R * 2)))
    }
    this.addFloat(pos.add(new Vector3(0, 1.5, 0)), 'BOOM!', '#ff7a00', true)
    // 引爆範圍內的爆炸桶（連鎖）
    for (const b of this.map.barrels) {
      if (!b.exploded && Vector3.Distance(b.pos, pos) < R) {
        setTimeout(() => this.explodeBarrel(b), 80 + Math.random() * 120)
      }
    }
  }

  // ---- 受擊方向（給 HUD 邊緣指示器）----
  private registerDamageFrom(pos: Vector3) {
    const dx = pos.x - this.player.position.x
    const dz = pos.z - this.player.position.z
    this.state.damageDir = Math.atan2(dx, dz) - this.player.yaw
    this.state.damageDirAt = performance.now()
  }

  // ---- 拾取掉落物 ----
  private floatAtPlayer(text: string, color: string) {
    const cam = this.scene.activeCamera!
    this.addFloat(this.player.position.add(cam.getForwardRay().direction.scale(4)), text, color, true)
  }
  private collect(kind: PickupKind) {
    if (kind === 'heal') { this.player.heal(DROP.healAmount); this.floatAtPlayer(`+${DROP.healAmount} HP`, '#7CFC58') }
    else if (kind === 'ammo') { this.weapons.refillAmmo(); this.floatAtPlayer('彈藥補給', '#ffcc00') }
    else if (kind === 'frenzy') { this.player.grantFrenzy(DROP.frenzyDuration); this.floatAtPlayer('狂暴啟動!', '#ff3b30') }
    this.syncWeaponHud()
  }

  // ---- 螢幕飄字（傷害數字 / 擊殺獎勵）----
  private worldToScreen(p: Vector3): { x: number; y: number; visible: boolean } {
    const canvas = this.engine.getRenderingCanvas()!
    let w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) { w = this.engine.getRenderWidth(); h = this.engine.getRenderHeight() } // 佈局未就緒時退回 backbuffer 尺寸
    const cam = this.scene.activeCamera!
    const v = Vector3.Project(p, Matrix.Identity(), this.scene.getTransformMatrix(), cam.viewport.toGlobal(w, h))
    return { x: v.x, y: v.y, visible: v.z > 0 && v.z < 1 }
  }

  private addFloat(world: Vector3, text: string, color: string, big = false) {
    const s = this.worldToScreen(world)
    if (!s.visible) return
    this.state.floats.push({ id: this.floatSeq++, x: Math.round(s.x), y: Math.round(s.y), text, color, born: performance.now(), big })
    if (this.state.floats.length > 40) this.state.floats.shift()
  }

  private cleanupFloats() {
    const now = performance.now()
    const f = this.state.floats
    for (let i = f.length - 1; i >= 0; i--) if (now - f[i].born > 900) f.splice(i, 1)
  }

  // ================= 狀態流程 =================
  start(difficulty: Difficulty = 'normal') {
    initAudio()
    // 難度
    this.state.difficulty = difficulty
    const diff = DIFFICULTIES[difficulty]
    this.diffBase = { hp: diff.enemyHp, dmg: diff.enemyDmg, spd: diff.enemySpeed }
    this.enemies.diff = { ...this.diffBase }
    this.diffCountMult = diff.count
    this.diffReward = diff.reward
    // meta 永久加成
    const b = Meta.bonuses()
    this.player.maxHp = b.maxHp
    this.player.speedMult = b.speedMult
    this.player.damageMult = b.damageMult
    this.player.spawn(new Vector3(0, PLAYER.height, -40))
    this.player.armor = b.armor
    this.player.money = ECONOMY.startMoney + b.startMoney
    this.state.money = this.player.money
    this.state.armor = Math.round(this.player.armor)
    this.state.kills = 0; this.state.score = 0; this.state.streak = 0; this.state.bestStreak = 0
    this.state.runCoins = 0
    this.weapons.owned = ['knife', 'pistol']
    this.weapons.refillAmmo()
    this.weapons.equip('pistol')
    this.enemies.reset()
    this.pickups.clear()
    this.grenades.clear()
    this.grenadeCd = 0
    this.state.grenades = GRENADE.start
    this.state.floats.length = 0
    this.state.wave = 0
    this.beginWave(1)
    this.state.phase = 'playing'
    this.lockPointer()
  }

  // 觸控模式不鎖指標（讓虛擬搖桿/按鈕可被點擊）；桌機鍵鼠才鎖
  private lockPointer() { if (!this.touchMode) this.input.requestLock() }

  private beginWave(wave: number) {
    // 進入新一波補充手榴彈（第 1 波用起始量，不額外補）
    if (wave > 1) this.state.grenades = Math.min(GRENADE.max, this.state.grenades + GRENADE.refillPerWave)
    // 隨波數成長：敵人越後面越強（血量 +12%/波、傷害 +7%/波、速度 +2%/波 上限 1.5），疊乘在難度基準上
    const hpScale = 1 + (wave - 1) * 0.12
    const dmgScale = 1 + (wave - 1) * 0.07
    const spdScale = Math.min(1.5, 1 + (wave - 1) * 0.02)
    this.enemies.diff = {
      hp: this.diffBase.hp * hpScale,
      dmg: this.diffBase.dmg * dmgScale,
      spd: this.diffBase.spd * spdScale,
    }
    this.state.wave = wave
    const spec = waveSpec(wave)
    this.state.isBossWave = spec.boss
    this.spawnQueue = []
    if (spec.boss) {
      const bossCount = spec.types.filter((t) => t === 'boss').length || 1
      for (let i = 0; i < bossCount; i++) this.spawnQueue.push('boss')
      const adds = Math.max(0, Math.round((spec.count - bossCount) * this.diffCountMult))
      for (let i = 0; i < adds; i++) this.spawnQueue.push(i % 2 === 0 ? 'grunt' : 'rusher')
    } else {
      const count = Math.max(1, Math.round(spec.count * this.diffCountMult))
      for (let i = 0; i < count; i++) this.spawnQueue.push(spec.types[i % spec.types.length])
    }
    // 洗牌
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]]
    }
    this.spawnTimer = 0.5
    this.waveActive = true
    this.weapons.refillAmmo()
    const msg = spec.boss ? `⚠ 王波 — 第 ${wave} 波` : `第 ${wave} 波`
    this.state.message = msg
    SFX.waveStart()
    setTimeout(() => { if (this.state.message === msg) this.state.message = '' }, 1800)
    this.updateEnemyHud()
  }

  private concurrentCap() { return waveSpec(this.state.wave).concurrent }

  private onKill(_e: Enemy, isHead: boolean) {
    this.state.kills++
    this.state.streak++
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak)
    const reward = Math.round((_e.def.reward + (isHead ? ECONOMY.headshotBonus : 0) + this.state.streak * ECONOMY.killBonusStreak) * this.diffReward)
    this.player.money += reward
    this.state.money = this.player.money
    this.state.score += Math.round((_e.def.reward + (isHead ? 150 : 0)) * this.diffReward)
    this.state.hitMarker = performance.now()
    if (isHead) { this.state.headshotMarker = performance.now(); SFX.headshot() } else SFX.hit()
    // 擊殺獎勵飄字
    const top = _e.inst.holder.position.add(new Vector3(0, _e.def.boss ? 4 : 2, 0))
    this.addFloat(top, `+$${reward}`, '#7CFC58', true)
    if (isHead) this.addFloat(_e.inst.holder.position.add(new Vector3(0, 2.4, 0)), '爆頭!', '#ff3b30', true)
    if (_e.def.boss) this.addFloat(top.add(new Vector3(0, 0.6, 0)), '擊敗王!', '#ffcc00', true)

    // 掉落物
    const dropPos = _e.inst.holder.position.clone(); dropPos.y = 0
    if (_e.def.boss) {
      this.pickups.spawn('heal', dropPos)
      this.pickups.spawn('frenzy', dropPos.add(new Vector3(1.6, 0, 0)))
    } else if (Math.random() < DROP.chance) {
      const r = Math.random()
      const kind: PickupKind = r < 0.5 ? 'heal' : r < 0.82 ? 'ammo' : 'frenzy'
      this.pickups.spawn(kind, dropPos)
    }

    // 連殺獎勵
    const st = this.state.streak
    if (st === KILLSTREAK.heal) { this.player.heal(KILLSTREAK.healAmount); this.floatAtPlayer(`連殺 +${KILLSTREAK.healAmount}HP`, '#7CFC58') }
    else if (st === KILLSTREAK.frenzy) { this.player.grantFrenzy(DROP.frenzyDuration); this.floatAtPlayer('連殺狂暴!', '#ff3b30') }
    else if (st === KILLSTREAK.supply) { this.weapons.refillAmmo(); this.floatAtPlayer('彈藥全補!', '#ffcc00') }

    this.updateEnemyHud()
  }

  private updateEnemyHud() {
    this.state.enemiesLeft = this.enemies.aliveCount + this.spawnQueue.length
  }

  private gameOver() {
    this.state.phase = 'dead'
    this.state.message = ''
    SFX.gameOver()
    this.input.exitLock()
    this.state.runCoins = Meta.endRun(this.state.score, this.state.wave)
    this.state.metaCoins = Meta.coins
    this.state.board = [...Meta.board]
  }

  // ---- 購買 ----
  buy(id: WeaponId): boolean {
    const def = WEAPONS[id]
    if (this.weapons.owned.includes(id)) {
      // 已擁有 → 補滿彈藥（半價）
      const cost = Math.floor(def.price * 0.4)
      if (this.player.money < cost || def.melee) return false
      this.player.money -= cost
      this.weapons.refillAmmo()
    } else {
      if (this.player.money < def.price) return false
      this.player.money -= def.price
      this.weapons.giveWeapon(id, true)
    }
    this.state.money = this.player.money
    SFX.buy()
    this.syncWeaponHud()
    return true
  }

  buyArmor(): boolean {
    if (this.player.armor >= 100 || this.player.money < 650) return false
    this.player.money -= 650
    this.player.armor = 100
    this.state.money = this.player.money
    this.state.armor = 100
    SFX.buy()
    return true
  }

  nextWave() {
    if (this.state.phase !== 'buy') return
    this.beginWave(this.state.wave + 1)
    this.state.phase = 'playing'
    this.lockPointer()
  }

  pause() {
    if (this.state.phase !== 'playing') return
    this.state.phase = 'paused'
    this.input.exitLock()
  }

  resume() {
    if (this.state.phase === 'paused') {
      this.state.phase = 'playing'
      this.lockPointer()
    }
  }

  private syncWeaponHud() {
    this.state.weaponName = this.weapons.weaponName
    this.state.ammoMag = this.weapons.ammoMag
    this.state.ammoReserve = this.weapons.ammoReserve
    this.state.owned = [...this.weapons.owned]
    this.state.current = this.weapons.current
  }

  // ================= 每幀 =================
  private frame() {
    if (!this.ready) return
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05)
    const phase = this.state.phase

    if (phase === 'playing') {
      if (this.input.justPressed('KeyB')) { this.openBuyMid(); }
      if (this.grenadeCd > 0) this.grenadeCd -= dt
      if (this.input.justPressed('KeyG')) this.tryThrowGrenade()
      this.player.update(dt)
      this.weapons.update(dt)
      this.enemies.update(dt)
      this.pickups.update(dt)
      this.grenades.update(dt)
      this.effects.update(dt)
      this.tickWave(dt)
      this.syncStatusHud()
    } else {
      // 非遊玩仍渲染 + 更新特效淡出
      this.effects.update(dt)
    }

    this.cleanupFloats()
    this.input.endFrame()
    this.scene.render()
  }

  private openBuyMid() {
    // 遊玩中按 B：開購買選單（暫停動作）
    this.state.phase = 'buy'
    this.input.exitLock()
  }

  private tryThrowGrenade() {
    if (this.grenadeCd > 0 || this.state.grenades <= 0 || !this.player.alive) return
    this.state.grenades--
    this.grenadeCd = GRENADE.cooldown
    const cam = this.player.camera
    const dir = cam.getForwardRay().direction.normalize()
    const origin = cam.position.add(dir.scale(0.8))
    this.grenades.throw(origin, dir)
    SFX.throwGrenade()
  }

  private tickWave(dt: number) {
    if (!this.waveActive) return
    // 持續生成直到佇列清空
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt
      if (this.spawnTimer <= 0 && this.enemies.aliveCount < this.concurrentCap()) {
        const id = this.spawnQueue.shift()!
        const sp = this.map.spawnPoints[Math.floor(Math.random() * this.map.spawnPoints.length)]
        const pos = sp.clone(); pos.y = 0
        this.enemies.spawn(id, pos)
        this.spawnTimer = 0.6 + Math.random() * 0.6
        this.updateEnemyHud()
      }
    } else if (this.enemies.aliveCount === 0 && this.enemies.pendingDead === 0) {
      // 波次完成
      this.waveActive = false
      this.player.money += ECONOMY.roundReward
      this.state.money = this.player.money
      this.state.message = ''
      this.state.phase = 'buy'
      this.input.exitLock()
      SFX.waveClear()
    }
    this.updateEnemyHud()
  }

  private syncStatusHud() {
    this.state.hp = Math.round(this.player.hp)
    this.state.armor = Math.round(this.player.armor)
    this.state.reloading = this.weapons.isReloading
    this.state.aiming = this.player.aiming
    this.state.ammoMag = this.weapons.ammoMag
    this.state.ammoReserve = this.weapons.ammoReserve
    this.state.frenzyT = this.player.frenzyT
  }

  dispose() {
    this.input.dispose()
    this.engine.dispose()
  }
}
