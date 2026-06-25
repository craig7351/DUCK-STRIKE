// ============================================================================
// grenades.ts — 手榴彈投擲物（引擎層）：拋物線飛行 + 落地反彈 + 引信爆炸。
// 物件池複用 glTF 模型；爆炸結算交回 game.ts（重用 enemies.explodeDamage 等）。
// ============================================================================
import { Scene, Vector3 } from '@babylonjs/core'
import { loadModel, instantiateStatic, scaleForHeight, LoadedModel, ModelInstance } from './model-loader'
import { GameMap } from './map'
import { GRENADE, WORLD } from './config'

interface Live {
  inst: ModelInstance
  vel: Vector3
  spin: Vector3
  fuse: number
  active: boolean
}

export class GrenadeManager {
  scene: Scene
  map: GameMap
  onExplode: (pos: Vector3) => void

  private model!: LoadedModel
  private scale = 1
  private pool: Live[] = []

  constructor(scene: Scene, map: GameMap, onExplode: (pos: Vector3) => void) {
    this.scene = scene
    this.map = map
    this.onExplode = onExplode
  }

  async preload() {
    this.model = await loadModel(this.scene, '/models/guns/grenade.gltf')
    this.scale = scaleForHeight(this.model, GRENADE.size)
  }

  private make(): Live {
    const inst = instantiateStatic(this.scene, this.model, this.scale)
    inst.meshes.forEach((m) => { m.isPickable = false; m.checkCollisions = false })
    inst.holder.setEnabled(false)
    const g: Live = { inst, vel: Vector3.Zero(), spin: Vector3.Zero(), fuse: 0, active: false }
    this.pool.push(g)
    return g
  }

  /** 從 origin 朝 dir 投擲一顆手榴彈（含上拋分量）。 */
  throw(origin: Vector3, dir: Vector3) {
    const g = this.pool.find((x) => !x.active) || this.make()
    g.active = true
    g.inst.holder.setEnabled(true)
    g.inst.holder.position.copyFrom(origin)
    g.vel = dir.normalize().scale(GRENADE.throwSpeed).add(new Vector3(0, GRENADE.throwUp, 0))
    g.spin = new Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5)
    g.fuse = GRENADE.fuse
  }

  update(dt: number) {
    const floor = GRENADE.size * 0.5
    const h = WORLD.arenaHalf - 0.3
    for (const g of this.pool) {
      if (!g.active) continue
      g.fuse -= dt
      g.vel.y += WORLD.gravity * dt
      const p = g.inst.holder.position
      const px = p.x, pz = p.z
      p.addInPlace(g.vel.scale(dt))

      // 落地反彈（衰減）；速度夠小就停在地面
      if (p.y <= floor) {
        p.y = floor
        g.vel.y = Math.abs(g.vel.y) * GRENADE.restitution
        g.vel.x *= GRENADE.friction
        g.vel.z *= GRENADE.friction
        if (g.vel.y < 0.6) g.vel.y = 0
      }
      // 外牆反彈
      if (p.x < -h || p.x > h) { p.x = Math.max(-h, Math.min(h, p.x)); g.vel.x *= -GRENADE.restitution }
      if (p.z < -h || p.z > h) { p.z = Math.max(-h, Math.min(h, p.z)); g.vel.z *= -GRENADE.restitution }
      // 撞掩體：退回上一格水平位置並反彈水平速度（避免穿牆）
      if (this.map.blocked(p.x, p.z, 0.3)) {
        p.x = px; p.z = pz
        g.vel.x *= -GRENADE.restitution
        g.vel.z *= -GRENADE.restitution
      }

      // 翻滾自旋
      g.inst.holder.rotation.x += g.spin.x * dt
      g.inst.holder.rotation.y += g.spin.y * dt
      g.inst.holder.rotation.z += g.spin.z * dt

      if (g.fuse <= 0) {
        const pos = p.clone()
        this.kill(g)
        this.onExplode(pos)
      }
    }
  }

  private kill(g: Live) {
    g.active = false
    g.inst.holder.setEnabled(false)
  }

  clear() { this.pool.forEach((g) => this.kill(g)) }
}
