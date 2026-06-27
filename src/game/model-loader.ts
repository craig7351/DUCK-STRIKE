// ============================================================================
// model-loader.ts — glTF 載入 / 正規化 / 動畫池（引擎層）。
// 封裝踩過的坑：尺寸正規化、貼地、__root__ 四元數、動畫名稱比對。
// 動畫單位用 AssetContainer.instantiateModelsToScene（正確複製骨架+動畫）。
// ============================================================================
import {
  Scene, TransformNode, AbstractMesh, AnimationGroup, Vector3,
  LoadAssetContainerAsync, AssetContainer, InstantiatedEntries,
} from '@babylonjs/core'
import '@babylonjs/loaders/glTF'

export interface LoadedModel {
  container: AssetContainer
  size: Vector3       // 模板原始包圍盒尺寸
  minY: number
  min: Vector3        // 包圍盒最小角（模型本地座標）
  max: Vector3        // 包圍盒最大角
}

const cache = new Map<string, Promise<LoadedModel>>()

/** 載入一個 glTF 成 AssetContainer（不加進場景，作為模板複製來源）。會被快取。 */
export function loadModel(scene: Scene, url: string): Promise<LoadedModel> {
  if (cache.has(url)) return cache.get(url)!
  const p = LoadAssetContainerAsync(url, scene).then((container: AssetContainer) => {
    container.animationGroups.forEach((g) => g.stop())
    // 量測尺寸：暫時加入、量測、再移除
    container.addAllToScene()
    const root = container.meshes.find((m) => !m.parent) as AbstractMesh
    const { min, max } = root.getHierarchyBoundingVectors()
    const size = max.subtract(min)
    const minY = min.y
    container.removeAllFromScene()
    return { container, size, minY, min: min.clone(), max: max.clone() }
  })
  cache.set(url, p)
  return p
}

/** 依目標身高計算縮放。 */
export function scaleForHeight(model: LoadedModel, targetHeight: number): number {
  return targetHeight / (model.size.y || 1)
}

/** 扁平模型（血跡、地磚）用寬度正規化，避免爆炸縮放。 */
export function scaleForWidth(model: LoadedModel, targetWidth: number): number {
  return targetWidth / (Math.max(model.size.x, model.size.z) || 1)
}

export function findAnim(groups: AnimationGroup[], re: RegExp): AnimationGroup | undefined {
  return groups.find((g) => re.test(g.name))
}

export interface ModelInstance {
  holder: TransformNode       // 轉這個（避開 __root__ 四元數問題）
  entries: InstantiatedEntries
  meshes: AbstractMesh[]
  anims: Record<string, AnimationGroup>
}

let instCounter = 0

/**
 * 從模板複製一個帶動畫的實例。
 * @param scale 縮放
 * @param animNames key->正則，用名稱比對抓動畫群組
 * @param footOnGround true=底部貼 holder 原點（角色）；false=置中
 */
export function instantiate(
  scene: Scene,
  model: LoadedModel,
  scale: number,
  animNames: Record<string, RegExp>,
  footOnGround = true,
): ModelInstance {
  const id = instCounter++
  const holder = new TransformNode(`unit_${id}`, scene)
  const entries = model.container.instantiateModelsToScene(
    (name) => `${name}_${id}`,
    false,
    { doNotInstantiate: false },
  )

  const meshes: AbstractMesh[] = []
  entries.rootNodes.forEach((n) => {
    n.parent = holder
    n.getChildMeshes().forEach((m) => meshes.push(m as AbstractMesh))
  })

  // 貼地：把整體往下移 minY*scale
  if (footOnGround) {
    entries.rootNodes.forEach((n) => {
      if (n instanceof TransformNode) n.position.y -= model.minY
    })
  }
  holder.scaling.setAll(scale)

  const anims: Record<string, AnimationGroup> = {}
  for (const key in animNames) {
    const g = findAnim(entries.animationGroups, animNames[key])
    if (g) anims[key] = g
  }

  return { holder, entries, meshes, anims }
}

/** 簡單複製靜態模型（無動畫，環境道具）。回傳 holder。 */
export function instantiateStatic(scene: Scene, model: LoadedModel, scale: number): ModelInstance {
  return instantiate(scene, model, scale, {}, true)
}

export function disposeInstance(inst: ModelInstance) {
  Object.values(inst.anims).forEach((a) => a.dispose())
  inst.entries.rootNodes.forEach((n) => n.dispose())
  inst.holder.dispose()
}
