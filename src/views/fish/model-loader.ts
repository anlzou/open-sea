import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { fishConfig } from './config.js'
import type { FishModelInstance } from './types.js'

interface FishModelSource {
  key: string
  url: URL
  /**
   * Bake model local axes into extracted (instanced) geometry.
   * fish.glb bind-pose mesh: length along +Z (nose +Z), height along +Y, width along +X.
   * Pose system expects: nose +Y, dorsal +Z.
   * Proper rotation: Rx(-90°) then Ry(180°) → (x,y,z) → (-x, z, y) roughly for nose/dorsal;
   * Built below as a single Matrix4.
   */
  axes: THREE.Matrix4
}

interface FishModel {
  key: string
  geometry: THREE.BufferGeometry
  material: THREE.Material
  renderScale?: number
}

export interface AnimatedFishTemplate {
  /** Original glTF scene — always clone via SkeletonUtils, never mutate */
  scene: THREE.Object3D
  animations: THREE.AnimationClip[]
  normalizeScale: number
  /** Offset applied on each clone so bbox center ≈ origin (model space) */
  centerOffset: THREE.Vector3
  /** Maps glTF nose +Z / up +Y → pose nose +Y / dorsal +Z */
  orientQuaternion: THREE.Quaternion
}

/** Nose +Z, up +Y → nose +Y, dorsal +Z (Rx -90° · Ry 180°) */
function createFishOrientMatrix(): THREE.Matrix4 {
  const rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2)
  const ry = new THREE.Matrix4().makeRotationY(Math.PI)
  return ry.multiply(rx)
}

const fishOrientMatrix = createFishOrientMatrix()
const fishOrientQuaternion = new THREE.Quaternion().setFromRotationMatrix(fishOrientMatrix)

const fishModelSources: FishModelSource[] = [
  {
    key: 'fish',
    url: new URL('./models/fish.glb', import.meta.url),
    axes: fishOrientMatrix.clone(),
  },
]

const tmpCenter = new THREE.Vector3()
const tmpSize = new THREE.Vector3()

let fishModels: FishModel[] = []
let animatedTemplate: AnimatedFishTemplate | null = null
let loadDone = false
let loadError: string | null = null
let loadProgress = 0
let loadPromise: Promise<void> | null = null

/** Returns true once GLB models have finished loading */
export function isReady(): boolean {
  return loadDone && loadError === null
}

/** Returns the last load error message, or null if loading succeeded */
export function getLoadError(): string | null {
  return loadError
}

/** Returns download progress 0–1, or 0 if not yet started */
export function getLoadProgress(): number {
  return loadProgress
}

/** Returns the list of model keys being loaded */
export function getModelKeys(): string[] {
  return fishModelSources.map((s) => s.key)
}

/** Shared skinned template + clips for optional skeletal animation path */
export function getAnimatedFishTemplate(): AnimatedFishTemplate | null {
  return animatedTemplate
}

export async function loadFishModel(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = _load()
  return loadPromise
}

async function _load(): Promise<void> {
  const MAX_RETRIES = 5
  const RETRY_DELAY = 6 * 1000 // 6 seconds

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    loadError = null
    loadProgress = 0
    const results = await Promise.allSettled(
      fishModelSources.map((s) => loadWithProgress(s.url.href)),
    )
    const loaded: FishModel[] = []
    for (let i = 0; i < results.length; i += 1) {
      const src = fishModelSources[i]
      const r = results[i]
      if (r.status === 'fulfilled') {
        const gltf = r.value
        loaded.push(createFishModelFromGltf(gltf, src))
        if (src.key === 'fish') {
          animatedTemplate = createAnimatedTemplate(gltf, src)
        }
      } else {
        console.warn(`Failed to load ${src.key} fish model (attempt ${attempt}/${MAX_RETRIES}).`, r.reason)
      }
    }
    if (loaded.length) {
      fishModels = loaded
      const base = loaded.find((m) => m.key === 'fish') ?? loaded[0]
      fishModels.push(createKoiModelFromBase(base))
      loadDone = true
      return
    }
    if (attempt < MAX_RETRIES) {
      console.warn(`Fish model load attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${RETRY_DELAY / 1000}s...`)
      await new Promise((r) => setTimeout(r, RETRY_DELAY))
    }
  }
  loadError = '鱼模型文件下载失败，请检查网络连接后刷新页面重试'
  loadDone = true
  console.error('All fish models failed to load after 5 retries.')
}

/** Load a single GLB with XHR progress tracking */
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

function loadWithProgress(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.setDRACOLoader(dracoLoader)
    loader.load(
      url,
      (gltf: any) => resolve(gltf),
      (xhr: ProgressEvent) => {
        if (xhr.total > 0) {
          loadProgress = xhr.loaded / xhr.total
        }
      },
      (err: any) => reject(err),
    )
  })
}

function findPrimaryMesh(root: THREE.Object3D): THREE.Mesh | null {
  let result: THREE.Mesh | null = null
  root.traverse((obj: THREE.Object3D) => {
    if ((obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) && obj.geometry && !result) {
      result = obj as THREE.Mesh
    }
  })
  return result
}

function createFishModelFromGltf(gltf: any, src: FishModelSource): FishModel {
  const scene = gltf.scene ?? gltf
  scene.updateWorldMatrix(true, true)
  const mesh = findPrimaryMesh(scene)
  if (!mesh) throw new Error(`Fish model ${src.key} has no mesh.`)
  // Bind-pose snapshot for InstancedMesh path (no skinning)
  return { key: src.key, geometry: createFishGeometry(mesh, src), material: cloneFishMaterial(mesh.material) }
}

/**
 * Keep the original skinned scene as template (SkeletonUtils.clone only).
 * Normalize metrics so body length ≈ fishConfig.length.
 */
function createAnimatedTemplate(gltf: any, _src: FishModelSource): AnimatedFishTemplate {
  const scene = (gltf.scene ?? gltf) as THREE.Object3D
  scene.updateWorldMatrix(true, true)

  const box = new THREE.Box3().setFromObject(scene)
  box.getCenter(tmpCenter)
  box.getSize(tmpSize)
  const maxDim = Math.max(tmpSize.x, tmpSize.y, tmpSize.z, 0.0001)
  const normalizeScale = (fishConfig.length * 0.5) / maxDim

  // Own materials so roughness/metalness match instanced path
  prepareMaterials(scene)

  const animations: THREE.AnimationClip[] = Array.isArray(gltf.animations)
    ? gltf.animations.map((c: THREE.AnimationClip) => c.clone())
    : []

  return {
    scene,
    animations,
    normalizeScale,
    centerOffset: tmpCenter.clone().multiplyScalar(-1),
    orientQuaternion: fishOrientQuaternion.clone(),
  }
}

function prepareMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.SkinnedMesh)) return
    const src = obj.material
    if (Array.isArray(src)) {
      obj.material = src.map((m) => cloneFishMaterial(m))
    } else {
      obj.material = cloneFishMaterial(src)
    }
    obj.castShadow = true
    obj.receiveShadow = false
  })
}

/* ================================================================
   Koi — 基于 fish 几何体，烘焙白底红纹顶点色（保留原贴图含眼睛）
   ================================================================ */

/**
 * 生成锦鲤顶点色：白底 + 三段红斑（大正三色）+ 背部淡金色 + 头部留白。
 * 同时轻微重塑体形（更圆润的腹部、稍短的身体），接近真实锦鲤。
 *
 * 本几何体半长 = fishConfig.length*0.25 = 0.4，故所有位置常量乘 k=0.5 缩放。
 */
function createKoiGeometry(sourceGeometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = sourceGeometry.clone()
  const position = geometry.getAttribute('position')
  const count = position.count
  const colors = new Float32Array(count * 3)
  const tmpVertex = new THREE.Vector3()
  const white = new THREE.Color(0xfff0dc)
  const red = new THREE.Color(0xd61f16)
  const gold = new THREE.Color(0xf4b24a)
  const tmpColor = new THREE.Color()

  const k = 0.5 // 0.4 / 0.8，适配本几何体尺寸

  for (let i = 0; i < count; i += 1) {
    tmpVertex.fromBufferAttribute(position, i)

    // 头部区域保留白色（含原贴图的眼睛）
    const headKeep = THREE.MathUtils.smoothstep(
      tmpVertex.y,
      fishConfig.length * 0.2 * k,
      fishConfig.length * 0.42 * k,
    )
    const bodyProgress = THREE.MathUtils.clamp(
      1 - Math.abs(tmpVertex.y) / (fishConfig.length * 0.5 * k),
      0,
      1,
    )

    // 体形重塑：腹部更圆、身体略短
    const belly = 1.12 + bodyProgress * 0.46
    const height = 1.04 + bodyProgress * 0.26
    const bodyLen = 0.9
    const bodyBlend = 1 - headKeep
    position.setXYZ(
      i,
      THREE.MathUtils.lerp(tmpVertex.x, tmpVertex.x * belly, bodyBlend),
      THREE.MathUtils.lerp(tmpVertex.y, tmpVertex.y * bodyLen, bodyBlend),
      THREE.MathUtils.lerp(tmpVertex.z, tmpVertex.z * height, bodyBlend),
    )

    // 三段红纹（大正三色）
    const patchA = smoothPatch(tmpVertex.x, tmpVertex.y, 0.02 * k, 0.36 * k, 0.34 * k)
    const patchB = smoothPatch(tmpVertex.x, tmpVertex.y, -0.1 * k, -0.02 * k, 0.3 * k)
    const patchC = smoothPatch(tmpVertex.x, tmpVertex.y, 0.08 * k, -0.36 * k, 0.25 * k)
    const patch = Math.max(patchA, patchB, patchC)

    // 背部淡金
    const dorsal = THREE.MathUtils.clamp((tmpVertex.z + 0.28 * k) / (0.74 * k), 0, 1)

    tmpColor.copy(white).lerp(gold, dorsal * 0.22).lerp(red, patch)
    tmpColor.lerp(white, headKeep)
    colors[i * 3] = tmpColor.r
    colors[i * 3 + 1] = tmpColor.g
    colors[i * 3 + 2] = tmpColor.b
  }

  position.needsUpdate = true
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/** 平滑红纹补丁：中心 (cx,cy)，半径 r，边缘柔和过渡 */
function smoothPatch(x: number, y: number, centerX: number, centerY: number, radius: number): number {
  const distance = Math.hypot(x - centerX, y - centerY)
  return 1 - THREE.MathUtils.smoothstep(distance, radius * 0.58, radius)
}

/** 锦鲤材质：保留 fish 原贴图（含眼睛），叠加顶点色 */
function createKoiMaterial(baseMaterial: THREE.Material): THREE.Material {
  const material = cloneFishMaterial(baseMaterial) as THREE.MeshStandardMaterial
  material.color.setHex(0xffffff)
  material.vertexColors = true
  material.needsUpdate = true
  return material
}

function createKoiModelFromBase(base: FishModel): FishModel {
  const geometry = createKoiGeometry(base.geometry)
  const material = createKoiMaterial(base.material)
  return { key: 'koi', geometry, material, renderScale: 1.15 }
}

/* ================================================================
   Geometry / material helpers
   ================================================================ */

function createFishGeometry(mesh: THREE.Mesh, src: FishModelSource): THREE.BufferGeometry {
  // Prefer bind pose if skinned
  const geo = mesh.geometry.clone()
  // Drop skinning attrs — InstancedMesh path uses curve-deformation shader instead
  geo.deleteAttribute('skinIndex')
  geo.deleteAttribute('skinWeight')
  geo.applyMatrix4(src.axes)
  geo.computeBoundingBox()
  const box = geo.boundingBox!
  box.getCenter(tmpCenter); box.getSize(tmpSize)
  const maxDim = Math.max(tmpSize.x, tmpSize.y, tmpSize.z)
  if (maxDim > 0.0001) {
    geo.translate(-tmpCenter.x, -tmpCenter.y, -tmpCenter.z)
    geo.scale(1 / maxDim, 1 / maxDim, 1 / maxDim)
  }
  geo.scale(fishConfig.length * 0.5, fishConfig.length * 0.5, fishConfig.length * 0.5)
  geo.computeVertexNormals()
  return geo
}

function cloneFishMaterial(material: THREE.Material | THREE.Material[]): THREE.Material {
  const src = Array.isArray(material) ? material[0] : material
  const m = src.clone()
  if ('roughness' in m) (m as THREE.MeshStandardMaterial).roughness = 1
  if ('roughnessMap' in m) (m as THREE.MeshStandardMaterial).roughnessMap = undefined
  if ('metalness' in m) (m as THREE.MeshStandardMaterial).metalness = 0
  if ('metalnessMap' in m) (m as THREE.MeshStandardMaterial).metalnessMap = undefined
  m.side = THREE.FrontSide
  m.needsUpdate = true
  return m
}

/* ================================================================
   Public API
   ================================================================ */

export function createFishModelInstance(variantIndex = 0): FishModelInstance {
  const m = fishModels[variantIndex % fishModels.length] ?? fishModels[0]
  if (!m) throw new Error('Fish models not loaded yet.')
  return { geometry: m.geometry.clone(), material: m.material.clone(), renderScale: m.renderScale ?? 1, useAppearanceVariants: false }
}

export function createFishModelInstanceByKey(key: string): FishModelInstance | null {
  const m = fishModels.find((x) => x.key === key) ?? fishModels[0]
  if (!m) return null
  return { geometry: m.geometry.clone(), material: m.material.clone(), renderScale: m.renderScale ?? 1, useAppearanceVariants: false }
}

export function disposeFishMaterial(material: THREE.Material | null | undefined): void {
  material?.dispose()
}
