// ============================================================================
// effects.ts — 打擊感特效（引擎層）：槍口火光、彈道曳光、命中濺射、爆炸。
// 全用物件池避免 GC。
// ============================================================================
import {
  Scene, MeshBuilder, Vector3, Color3, StandardMaterial, Mesh,
  ParticleSystem, Texture, Color4, DynamicTexture,
} from '@babylonjs/core'

export class Effects {
  scene: Scene
  private flash: Mesh
  private flashMat: StandardMaterial
  private flashTimer = 0
  private tracers: { mesh: Mesh; t: number }[] = []
  private sparkTex: Texture
  // 爆炸用的短命動畫網格（閃光球 / 衝擊波環）：縮放 + 淡出後自動釋放
  private transients: { mesh: Mesh; mat: StandardMaterial; t: number; dur: number; r0: number; r1: number; a0: number; flat: boolean }[] = []
  // 敵人開火曳光彈（發光紅橘、會飛行的可見彈道）：物件池
  private shotPool: { mesh: Mesh; from: Vector3; to: Vector3; t: number; dur: number; active: boolean }[] = []
  private shotMat?: StandardMaterial

  constructor(scene: Scene) {
    this.scene = scene
    // 火花/火光貼圖（程序生成的柔邊放射狀漸層，避免硬邊方塊）
    this.sparkTex = this.makeSparkTexture()

    // 槍口火光：永遠面向相機的 billboard，柔邊貼圖 + 加色混合（看起來像光不像方塊）
    this.flash = MeshBuilder.CreatePlane('muzzle', { size: 0.35 }, scene)
    this.flashMat = new StandardMaterial('muzzleMat', scene)
    this.flashMat.emissiveColor = new Color3(1, 0.88, 0.5)
    this.flashMat.diffuseColor = new Color3(0, 0, 0)
    this.flashMat.disableLighting = true
    this.flashMat.emissiveTexture = this.sparkTex
    this.flashMat.opacityTexture = this.sparkTex     // 用貼圖 alpha 做柔邊
    this.flashMat.alphaMode = 1                       // ALPHA_ADD（加色，發光感）
    this.flashMat.backFaceCulling = false
    this.flashMat.alpha = 0
    this.flash.material = this.flashMat
    this.flash.billboardMode = Mesh.BILLBOARDMODE_ALL // 永遠正對相機
    this.flash.isPickable = false
    this.flash.renderingGroupId = 1                   // 蓋在視角模型之上
    this.flash.setEnabled(false)
  }

  private makeSparkTexture(): Texture {
    const t = new DynamicTexture('spark', 64, this.scene, false)
    const ctx = t.getContext() as unknown as CanvasRenderingContext2D
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.4, 'rgba(255,200,90,0.9)')
    g.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
    t.hasAlpha = true; t.update()
    return t
  }

  /** 槍口火光：在 pos 顯示一閃即逝的柔光（billboard，加色）。 */
  muzzleFlash(pos: Vector3, _dir: Vector3) {
    this.flash.setEnabled(true)
    this.flash.position.copyFrom(pos)
    this.flashMat.alpha = 1
    this.flash.scaling.setAll(0.7 + Math.random() * 0.5)
    this.flashTimer = 0.05
  }

  /** 彈道曳光：從 from 到 to 畫一條細線，快速淡出。 */
  tracer(from: Vector3, to: Vector3) {
    const dist = Vector3.Distance(from, to)
    const line = MeshBuilder.CreateCylinder('tracer', { height: dist, diameter: 0.03 }, this.scene)
    const mid = from.add(to).scale(0.5)
    line.position.copyFrom(mid)
    line.lookAt(to)
    line.rotate(new Vector3(1, 0, 0), Math.PI / 2)
    const mat = new StandardMaterial('tracerMat', this.scene)
    mat.emissiveColor = new Color3(1, 0.9, 0.5)
    mat.disableLighting = true
    line.material = mat
    line.isPickable = false
    this.tracers.push({ mesh: line, t: 0.08 })
  }

  /** 命中濺射粒子。enemy=血(紅)，否則=火花(黃灰)。 */
  impact(pos: Vector3, normal: Vector3, kind: 'enemy' | 'world') {
    const ps = new ParticleSystem('impact', 24, this.scene)
    ps.particleTexture = this.sparkTex
    ps.emitter = pos.clone()
    ps.minEmitBox = Vector3.Zero(); ps.maxEmitBox = Vector3.Zero()
    if (kind === 'enemy') {
      ps.color1 = new Color4(0.8, 0.05, 0.05, 1); ps.color2 = new Color4(0.5, 0, 0, 1)
    } else {
      ps.color1 = new Color4(1, 0.8, 0.3, 1); ps.color2 = new Color4(0.6, 0.6, 0.6, 1)
    }
    ps.colorDead = new Color4(0, 0, 0, 0)
    ps.minSize = 0.04; ps.maxSize = 0.14
    ps.minLifeTime = 0.1; ps.maxLifeTime = 0.3
    ps.emitRate = 300
    ps.direction1 = normal.add(new Vector3(-0.6, 0.2, -0.6))
    ps.direction2 = normal.add(new Vector3(0.6, 0.8, 0.6))
    ps.minEmitPower = 2; ps.maxEmitPower = 5
    ps.gravity = new Vector3(0, -9, 0)
    ps.blendMode = ParticleSystem.BLENDMODE_ADD
    ps.start()
    setTimeout(() => { ps.stop(); setTimeout(() => ps.dispose(), 400) }, 60)
  }

  /** 爆炸（爆炸桶）。 */
  explosion(pos: Vector3) {
    const ps = new ParticleSystem('boom', 200, this.scene)
    ps.particleTexture = this.sparkTex
    ps.emitter = pos.clone()
    ps.minEmitBox = new Vector3(-0.3, 0, -0.3); ps.maxEmitBox = new Vector3(0.3, 0.5, 0.3)
    ps.color1 = new Color4(1, 0.7, 0.2, 1); ps.color2 = new Color4(1, 0.3, 0, 1)
    ps.colorDead = new Color4(0.2, 0.1, 0.1, 0)
    ps.minSize = 0.3; ps.maxSize = 1.2
    ps.minLifeTime = 0.2; ps.maxLifeTime = 0.6
    ps.emitRate = 2000
    ps.direction1 = new Vector3(-3, 2, -3); ps.direction2 = new Vector3(3, 6, 3)
    ps.minEmitPower = 3; ps.maxEmitPower = 9
    ps.gravity = new Vector3(0, -6, 0)
    ps.blendMode = ParticleSystem.BLENDMODE_ADD
    ps.start()
    setTimeout(() => { ps.stop(); setTimeout(() => ps.dispose(), 800) }, 120)
  }

  /** 敵人開火曳光：發光彈道從 from 飛向 to（純視覺，不造成傷害）。 */
  enemyTracer(from: Vector3, to: Vector3) {
    if (!this.shotMat) {
      const m = new StandardMaterial('enemyShotMat', this.scene)
      m.emissiveColor = new Color3(1, 0.35, 0.12)   // 紅橘，配合 GlowLayer 發光
      m.diffuseColor = new Color3(0, 0, 0)
      m.disableLighting = true
      this.shotMat = m
    }
    let s = this.shotPool.find((x) => !x.active)
    if (!s) {
      const mesh = MeshBuilder.CreateCylinder('enemyShot', { height: 1, diameter: 0.09, tessellation: 6 }, this.scene)
      mesh.material = this.shotMat
      mesh.isPickable = false
      mesh.scaling.set(1, 0.6, 1)        // 短促的條狀彈道（沿 local Y）
      mesh.setEnabled(false)
      s = { mesh, from: Vector3.Zero(), to: Vector3.Zero(), t: 0, dur: 0, active: false }
      this.shotPool.push(s)
    }
    const dist = Vector3.Distance(from, to)
    s.active = true
    s.from.copyFrom(from); s.to.copyFrom(to)
    s.dur = Math.min(0.56, Math.max(0.14, dist / 35))   // 約 35 m/s 飛行（放慢一半）
    s.t = s.dur
    s.mesh.setEnabled(true)
    s.mesh.position.copyFrom(from)
    s.mesh.lookAt(to)                    // 對齊行進方向（+Z）
    s.mesh.rotate(new Vector3(1, 0, 0), Math.PI / 2)   // 讓 cylinder 的 Y 沿 +Z
  }

  /** 強化爆炸：火球 + 煙霧 + 地面衝擊波環 + 閃光球。手榴彈 / 爆炸桶 / 自爆兵共用。 */
  blast(pos: Vector3, radius = 6) {
    this.explosion(pos)        // 既有火球粒子（核心）
    this.smoke(pos)
    this.flashBall(pos)
    this.shockwave(pos, radius)
  }

  /** 上升煙霧（深灰、較慢、壽命長）。 */
  private smoke(pos: Vector3) {
    const ps = new ParticleSystem('smoke', 60, this.scene)
    ps.particleTexture = this.sparkTex
    ps.emitter = pos.clone()
    ps.minEmitBox = new Vector3(-0.3, 0, -0.3); ps.maxEmitBox = new Vector3(0.3, 0.4, 0.3)
    ps.color1 = new Color4(0.26, 0.26, 0.26, 0.7); ps.color2 = new Color4(0.12, 0.12, 0.12, 0.55)
    ps.colorDead = new Color4(0.08, 0.08, 0.08, 0)
    ps.minSize = 0.8; ps.maxSize = 2.4
    ps.minLifeTime = 0.5; ps.maxLifeTime = 1.1
    ps.emitRate = 220
    ps.direction1 = new Vector3(-0.6, 1.5, -0.6); ps.direction2 = new Vector3(0.6, 3, 0.6)
    ps.minEmitPower = 1; ps.maxEmitPower = 2.5
    ps.gravity = new Vector3(0, 1.4, 0)        // 煙往上飄
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD
    ps.start()
    setTimeout(() => { ps.stop(); setTimeout(() => ps.dispose(), 1300) }, 150)
  }

  /** 中心瞬間閃光球（加色、快速膨脹淡出）。 */
  private flashBall(pos: Vector3) {
    const m = MeshBuilder.CreateSphere('blastFlash', { diameter: 1, segments: 8 }, this.scene)
    m.position.set(pos.x, Math.max(pos.y, 0.6), pos.z)
    m.isPickable = false
    const mat = new StandardMaterial('blastFlashMat', this.scene)
    mat.emissiveColor = new Color3(1, 0.92, 0.7)
    mat.diffuseColor = new Color3(0, 0, 0)
    mat.disableLighting = true
    mat.alphaMode = 1            // ALPHA_ADD
    mat.backFaceCulling = false
    m.material = mat
    this.transients.push({ mesh: m, mat, t: 0.14, dur: 0.14, r0: 1.2, r1: 3.6, a0: 1, flat: false })
  }

  /** 地面衝擊波環（向外擴張、淡出）。 */
  private shockwave(pos: Vector3, radius: number) {
    const m = MeshBuilder.CreateTorus('shock', { diameter: 1, thickness: 0.16, tessellation: 40 }, this.scene)
    m.position.set(pos.x, 0.12, pos.z)   // Babylon torus 預設躺平在 XZ 平面，免旋轉
    m.isPickable = false
    const mat = new StandardMaterial('shockMat', this.scene)
    mat.emissiveColor = new Color3(1, 0.6, 0.2)
    mat.diffuseColor = new Color3(0, 0, 0)
    mat.disableLighting = true
    mat.alphaMode = 1
    mat.backFaceCulling = false
    m.material = mat
    this.transients.push({ mesh: m, mat, t: 0.45, dur: 0.45, r0: 0.6, r1: radius * 1.9, a0: 0.8, flat: true })
  }

  update(dt: number) {
    // 敵人曳光彈：沿 from→to 飛行，壽命到就回收
    for (const s of this.shotPool) {
      if (!s.active) continue
      s.t -= dt
      const p = 1 - Math.max(0, s.t) / s.dur
      s.mesh.position.set(
        s.from.x + (s.to.x - s.from.x) * p,
        s.from.y + (s.to.y - s.from.y) * p,
        s.from.z + (s.to.z - s.from.z) * p,
      )
      if (s.t <= 0) { s.active = false; s.mesh.setEnabled(false) }
    }
    // 短命動畫網格：依進度縮放 + 淡出
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const x = this.transients[i]
      x.t -= dt
      const p = 1 - Math.max(0, x.t) / x.dur     // 0 → 1
      const s = x.r0 + (x.r1 - x.r0) * p
      if (x.flat) x.mesh.scaling.set(s, 1, s)     // 衝擊波環只在 XZ 擴張，貼地
      else x.mesh.scaling.setAll(s)
      x.mat.alpha = Math.max(0, 1 - p) * x.a0
      if (x.t <= 0) { x.mesh.dispose(); x.mat.dispose(); this.transients.splice(i, 1) }
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      this.flashMat.alpha = Math.max(0, this.flashTimer / 0.05) * 0.95
      if (this.flashTimer <= 0) this.flash.setEnabled(false)
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]
      tr.t -= dt
      const m = tr.mesh.material as StandardMaterial
      m.alpha = Math.max(0, tr.t / 0.08)
      if (tr.t <= 0) { tr.mesh.dispose(); this.tracers.splice(i, 1) }
    }
  }
}
