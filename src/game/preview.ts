// ============================================================================
// preview.ts — 把 glTF 模型離線渲染成縮圖（data URL），給圖鑑顯示素材圖片。
// 單一離屏 Engine 依序載入各模型、截圖、卸載；結果快取，避免重複渲染。
// ============================================================================
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color3, Color4,
  LoadAssetContainerAsync, AssetContainer, AbstractMesh,
} from '@babylonjs/core'
import '@babylonjs/loaders/glTF'

let engine: Engine | null = null
let scene: Scene | null = null
let camera: ArcRotateCamera | null = null
const cache = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()   // 串行化，避免同時多個載入互搶

function ensure() {
  if (engine) return
  const canvas = document.createElement('canvas')
  canvas.width = 220; canvas.height = 220
  engine = new Engine(canvas, true, { preserveDrawingBuffer: true }, true)
  scene = new Scene(engine)
  scene.clearColor = new Color4(0.09, 0.1, 0.12, 1)
  const hemi = new HemisphericLight('ph', new Vector3(0.3, 1, 0.2), scene)
  hemi.intensity = 1.0; hemi.groundColor = new Color3(0.3, 0.3, 0.35)
  const dir = new DirectionalLight('pd', new Vector3(-0.5, -1, -0.4), scene)
  dir.intensity = 1.0
  camera = new ArcRotateCamera('pc', -Math.PI / 2.3, Math.PI / 2.5, 4, Vector3.Zero(), scene)
}

async function renderOne(url: string): Promise<string> {
  ensure()
  const s = scene!, cam = camera!
  let container: AssetContainer | null = null
  try {
    container = await LoadAssetContainerAsync(url, s)
    container.addAllToScene()
    const root = container.meshes.find((m) => !m.parent) as AbstractMesh
    const { min, max } = root.getHierarchyBoundingVectors()
    const center = min.add(max).scale(0.5)
    const r = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) || 1
    cam.target = center
    cam.radius = r * 1.9
    // 等材質就緒後渲染兩幀，再直接從 backbuffer 截圖（preserveDrawingBuffer）
    await new Promise<void>((res) => s.executeWhenReady(() => res()))
    s.render(); s.render()
    const data = (engine!.getRenderingCanvas() as HTMLCanvasElement).toDataURL('image/png')
    return data
  } finally {
    if (container) { container.removeAllFromScene(); container.dispose() }
  }
}

/** 取得模型縮圖（data URL）；快取 + 串行化。失敗回空字串。 */
export function modelThumbnail(url: string): Promise<string> {
  if (cache.has(url)) return Promise.resolve(cache.get(url)!)
  queue = queue.then(async () => {
    if (cache.has(url)) return
    try { cache.set(url, await renderOne(url)) } catch { cache.set(url, '') }
  })
  return queue.then(() => cache.get(url) || '')
}
