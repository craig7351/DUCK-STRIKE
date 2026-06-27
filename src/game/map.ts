// ============================================================================
// map.ts — 競技場地圖（程序地面 + 環境道具掩體 + 碰撞盒）。
// 道具是資產層；佈局是資料層；建構流程是引擎層。
// ============================================================================
import {
  Scene, MeshBuilder, Vector3, StandardMaterial, Color3, DynamicTexture,
  Mesh, TransformNode, AbstractMesh,
} from '@babylonjs/core'
import { loadModel, instantiateStatic, scaleForHeight } from './model-loader'
import { WORLD } from './config'

export interface Cover { min: Vector3; max: Vector3 } // 給 AI 用的 AABB（俯視）

// 鏤空 / 透空物件：仍阻擋走位，但子彈與視線可從縫隙穿過（不擋射線/LOS）
const SEE_THROUGH = new Set(['fence', 'fence_long', 'metalfence', 'barrier_single', 'barrier_large', 'tree_1', 'tree_2'])

// 可引爆的桶（爆炸桶 / 瓦斯桶）
export interface Barrel {
  holder: TransformNode
  collider: Mesh
  pos: Vector3
  hp: number
  exploded: boolean
}

export class GameMap {
  scene: Scene
  covers: Cover[] = []
  colliders: Mesh[] = []
  spawnPoints: Vector3[] = []
  barrels: Barrel[] = []

  constructor(scene: Scene) { this.scene = scene }

  async build() {
    this.buildGround()
    this.buildWalls()
    await this.buildProps()
    this.buildSpawnPoints()
  }

  private buildGround() {
    const s = this.scene
    const size = WORLD.arenaHalf * 2 + 8
    const ground = MeshBuilder.CreateGround('ground', { width: size, height: size, subdivisions: 1 }, s)
    ground.checkCollisions = true
    ground.position.y = 0
    ground.metadata = { world: true }

    // 程序柏油貼圖（裂縫 + 黃線 + 髒污）
    const tex = new DynamicTexture('asphalt', { width: 1024, height: 1024 }, s, false)
    const c = tex.getContext() as unknown as CanvasRenderingContext2D
    c.fillStyle = '#2b2e33'; c.fillRect(0, 0, 1024, 1024)
    for (let i = 0; i < 6000; i++) {
      const v = 30 + Math.random() * 40
      c.fillStyle = `rgb(${v},${v + 2},${v + 5})`
      c.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2)
    }
    // 裂縫
    c.strokeStyle = 'rgba(15,15,18,0.7)'; c.lineWidth = 1.5
    for (let i = 0; i < 40; i++) {
      c.beginPath(); let x = Math.random() * 1024, y = Math.random() * 1024
      c.moveTo(x, y)
      for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; c.lineTo(x, y) }
      c.stroke()
    }
    // 黃色道路標線
    c.strokeStyle = 'rgba(220,180,40,0.5)'; c.lineWidth = 8
    c.setLineDash([60, 50]); c.beginPath(); c.moveTo(512, 0); c.lineTo(512, 1024); c.stroke()
    tex.update()

    const mat = new StandardMaterial('groundMat', s)
    mat.diffuseTexture = tex
    ;(tex as any).uScale = 4; (tex as any).vScale = 4
    mat.specularColor = new Color3(0.05, 0.05, 0.05)
    ground.material = mat
  }

  private buildWalls() {
    const s = this.scene
    const h = WORLD.arenaHalf
    const wallMat = new StandardMaterial('wallMat', s)
    wallMat.diffuseColor = new Color3(0.22, 0.24, 0.28)
    wallMat.specularColor = new Color3(0.02, 0.02, 0.02)
    const th = 2, hh = 8
    const defs = [
      { x: 0, z: h + th / 2, w: h * 2 + th * 2, d: th },
      { x: 0, z: -h - th / 2, w: h * 2 + th * 2, d: th },
      { x: h + th / 2, z: 0, w: th, d: h * 2 },
      { x: -h - th / 2, z: 0, w: th, d: h * 2 },
    ]
    for (const d of defs) {
      const w = MeshBuilder.CreateBox('wall', { width: d.w, height: hh, depth: d.d }, s)
      w.position.set(d.x, hh / 2, d.z)
      w.material = wallMat
      w.checkCollisions = true
      w.metadata = { world: true }
      this.colliders.push(w)
    }
  }

  // 道具佈局：[模型, x, z, 旋轉(度), 目標高度, 是否掩體碰撞]
  private layout: [string, number, number, number, number, boolean][] = [
    // 中央雙貨櫃掩體
    ['container_long', 0, 0, 0, 3.2, true],
    ['container_small', -8, 6, 30, 3, true],
    ['container_small', 8, -6, -30, 3, true],
    // 四個角落結構
    ['brickwall_1', -22, 22, 0, 4, true],
    ['brickwall_2', 22, 22, 90, 4, true],
    ['brickwall_1', -22, -22, 90, 4, true],
    ['brickwall_2', 22, -22, 0, 4, true],
    // 沙包掩體群
    ['sacktrench', -14, 0, 0, 1.4, true],
    ['sacktrench', 14, 0, 0, 1.4, true],
    ['sacktrench_small', 0, 16, 90, 1.2, true],
    ['sacktrench_small', 0, -16, 90, 1.2, true],
    // 木箱 / 紙箱散佈
    ['crate', -18, 10, 15, 1.6, true],
    ['crate', 18, -10, -15, 1.6, true],
    ['cardboardboxes_1', 10, 14, 0, 1.4, true],
    ['cardboardboxes_2', -10, -14, 0, 1.4, true],
    ['crate', 6, 22, 0, 1.6, true],
    ['crate', -6, -22, 0, 1.6, true],
    // 障礙與護欄
    ['barrier_large', -30, 0, 90, 1.2, true],
    ['barrier_large', 30, 0, 90, 1.2, true],
    ['barrier_single', 0, 30, 0, 1, true],
    ['barrier_single', 0, -30, 0, 1, true],
    // 爆炸桶 / 瓦斯桶（裝飾，可加爆炸後續）
    ['explodingbarrel', 12, 8, 0, 1.4, true],
    ['explodingbarrel', -12, -8, 0, 1.4, true],
    ['gastank', -26, 14, 0, 2.2, true],
    // 環境裝飾（無碰撞或低矮）
    ['trafficcone', 4, 4, 0, 0.8, false],
    ['trafficcone', -4, -4, 0, 0.8, false],
    ['tree_1', -38, 38, 0, 6, true],
    ['tree_2', 38, -38, 0, 6, true],
    ['tree_1', 38, 38, 0, 6, true],
    ['watertank_floor', -34, -30, 0, 6, true],
    ['debris_brokencar', 30, 30, 45, 2.4, true],
    ['tank', -32, 32, 30, 3, true],

    // ── 擴充：柵欄分隔動線（破壞長距離視線，製造側翼路線）──
    ['fence_long', -20, 12, 0, 1.4, true],
    ['fence_long', 20, -12, 0, 1.4, true],
    ['metalfence', -16, -20, 90, 1.6, true],
    ['metalfence', 16, 20, 90, 1.6, true],
    ['fence', 7, -16, 0, 1.2, true],
    ['fence', -7, 16, 0, 1.2, true],
    ['fence', 24, 2, 90, 1.2, true],
    ['fence', -24, -2, 90, 1.2, true],
    // ── 擴充：更多木箱 / 紙箱掩體 ──
    ['crate', -24, -7, 0, 1.6, true],
    ['crate', 24, 7, 0, 1.6, true],
    ['crate', 0, -25, 0, 1.6, true],
    ['cardboardboxes_1', -2, -10, 30, 1.4, true],
    ['cardboardboxes_2', 2, 10, -30, 1.4, true],
    ['cardboardboxes_1', -28, 6, 0, 1.4, true],
    // ── 擴充：棧板（低矮地面裝飾，不阻擋）──
    ['pallet', -18, 13, 20, 0.3, false],
    ['pallet', 18, -13, -20, 0.3, false],
    ['pallet', 9, 13, 0, 0.3, false],
    ['pallet', -9, -13, 0, 0.3, false],
    // ── 擴充：更多爆炸桶 / 瓦斯桶（手榴彈連鎖更爽）──
    ['explodingbarrel', 20, 14, 0, 1.4, true],
    ['explodingbarrel', -20, -14, 0, 1.4, true],
    ['explodingbarrel', -3, 21, 0, 1.4, true],
    ['gastank', 26, -16, 0, 2.2, true],
    ['gastank', 3, -21, 0, 2.2, true],
    // ── 擴充：路牌（薄、不阻擋，氛圍用）──
    ['sign', -44, 10, 90, 3, false],
    ['sign', 44, -10, 90, 3, false],
    ['sign', -14, 4, 0, 2.6, false],
    // ── 擴充：交通錐散佈 ──
    ['trafficcone', 14, -3, 0, 0.8, false],
    ['trafficcone', -14, 3, 0, 0.8, false],
    ['trafficcone', 9, -19, 0, 0.8, false],
    ['trafficcone', -9, 19, 0, 0.8, false],
    // ── 擴充：對角區更多大型場景裝飾 ──
    ['tree_2', -38, -38, 0, 6, true],
    ['debris_brokencar', -32, -32, 20, 2.4, true],
    ['tree_1', 34, -34, 0, 6, true],
    ['watertank_floor', 34, 14, 0, 6, true],
  ]

  private async buildProps() {
    for (const [name, x, z, rotDeg, th, collide] of this.layout) {
      try {
        const model = await loadModel(this.scene, `/models/env/${name}.gltf`)
        const scale = scaleForHeight(model, th)
        const inst = instantiateStatic(this.scene, model, scale)
        inst.holder.position.set(x, 0, z)
        inst.holder.rotation.y = (rotDeg * Math.PI) / 180
        // 視覺 mesh 不參與射線；交給不可見 box collider（穩定且便宜）
        inst.meshes.forEach((m) => { m.isPickable = false })
        const isBarrel = name === 'explodingbarrel' || name === 'gastank'
        if (isBarrel) this.addBarrel(name, inst.holder, model.size, scale, x, z, th, rotDeg)
        else if (collide) this.addBoxCollider(inst.holder, model.size, scale, x, z, th, rotDeg, !SEE_THROUGH.has(name))
      } catch (e) {
        console.warn('prop load failed', name, e)
      }
    }
  }

  // 用不可見 box 當碰撞體（比 glTF mesh 碰撞穩定且便宜）
  private addBoxCollider(holder: TransformNode, size: Vector3, scale: number, x: number, z: number, h: number, rotDeg: number, blockShots = true) {
    const w = Math.max(size.x * scale, 0.6)
    const d = Math.max(size.z * scale, 0.6)
    const box = MeshBuilder.CreateBox('col', { width: w, height: h, depth: d }, this.scene)
    box.position.set(x, h / 2, z)
    box.rotation.y = (rotDeg * Math.PI) / 180
    box.checkCollisions = true        // 仍阻擋玩家走位
    box.isVisible = false
    if (blockShots) box.metadata = { world: true }   // 實心：阻擋射線 / LOS
    else box.isPickable = false                        // 鏤空：子彈與視線穿過縫隙
    this.colliders.push(box)
    // AABB（不考慮旋轉，取較大邊當保守半徑）給 AI 避障
    const r = Math.max(w, d) / 2
    this.covers.push({ min: new Vector3(x - r, 0, z - r), max: new Vector3(x + r, 0, z + r) })
  }

  // 可引爆桶：collider 帶 metadata.barrel，可被射線命中並引爆
  private addBarrel(name: string, holder: TransformNode, size: Vector3, scale: number, x: number, z: number, h: number, rotDeg: number) {
    const w = Math.max(size.x * scale, 0.6)
    const d = Math.max(size.z * scale, 0.6)
    const box = MeshBuilder.CreateBox('barrelCol', { width: w, height: h, depth: d }, this.scene)
    box.position.set(x, h / 2, z)
    box.rotation.y = (rotDeg * Math.PI) / 180
    box.checkCollisions = true
    box.isVisible = false
    const barrel: Barrel = { holder, collider: box, pos: new Vector3(x, h * 0.5, z), hp: name === 'gastank' ? 80 : 28, exploded: false }
    box.metadata = { barrel }
    this.colliders.push(box)
    this.barrels.push(barrel)
    const r = Math.max(w, d) / 2
    this.covers.push({ min: new Vector3(x - r, 0, z - r), max: new Vector3(x + r, 0, z + r) })
  }

  private buildSpawnPoints() {
    // 沿外圈生成敵人
    const r = WORLD.arenaHalf - 6
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      this.spawnPoints.push(new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
    }
  }

  /** 是否與任一掩體 AABB（含半徑緩衝）重疊 — 給 AI 用。 */
  blocked(x: number, z: number, pad = 0.5): boolean {
    for (const c of this.covers) {
      if (x > c.min.x - pad && x < c.max.x + pad && z > c.min.z - pad && z < c.max.z + pad) return true
    }
    return false
  }
}
