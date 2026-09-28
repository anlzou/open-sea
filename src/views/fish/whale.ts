import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { virtualAquarium } from './config.js'

const WHALE_URL = new URL('./models/whale.glb', import.meta.url)

/**
 * Swim / Turn / Cycle only (Breach / FreeSwim / SceneSwim unused).
 * Bind-pose mesh: nose +Z, dorsal +Y, right +X (root bone remaps Blender -Y forward).
 * Surface leaps come from Cycle breach windows + height sync.
 */
const ANIM = {
  swim: 'Swim',
  turn: 'Turn',
  cycle: 'Cycle',
} as const

type CruiseAnim = typeof ANIM.swim | typeof ANIM.turn | typeof ANIM.cycle

const STRIP_ROOT_NODES = ['Whale']
const ALLOWED_CLIPS = new Set<string>([ANIM.swim, ANIM.turn, ANIM.cycle])

const FADE = 0.55
/** Closer to the surface so the whale reads clearly from above */
const CRUISE_DEPTH = 3.8
const BREACH_APEX = 4.5
/** How often to force a Cycle (surface leaps live inside Cycle) */
const CYCLE_FORCE_MIN = 10
const CYCLE_FORCE_MAX = 20
const OUTER_CLEARANCE = 10
const MODEL_SCALE = 3.0
/** Brighten dark whale skin under ocean lighting */
const MATERIAL_BRIGHTEN = 1.7
const MATERIAL_EMISSIVE = 0x243848
const MATERIAL_EMISSIVE_INTENSITY = 0.28
/** Lift mid/high albedo (belly white) without blowing out the dark dorsal */
const BELLY_LIFT = 0.62
const BELLY_LIFT_LO = 0.16
const BELLY_LIFT_HI = 0.52

/** Cycle (20s @ 24fps) breach windows from whale.md */
const CYCLE_DURATION = 20
const CYCLE_BREACH_A = [2.0, 7.0] as const
const CYCLE_BREACH_B = [15.0, 20.0] as const

const HOLD_SWIM = [12, 22] as const
const HOLD_TURN = [5, 9] as const
const HOLD_CYCLE = [CYCLE_DURATION, CYCLE_DURATION + 1] as const

const tmpFwd = new THREE.Vector3()
const tmpRight = new THREE.Vector3()
const tmpLook = new THREE.Vector3()
const tmpUp = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpMat = new THREE.Matrix4()
const tmpCenter = new THREE.Vector3()
const worldUp = new THREE.Vector3(0, 1, 0)

export interface WhaleSystem {
  ready: boolean
  enabled: boolean
  setEnabled(on: boolean): void
  update(dt: number): void
  resizePath(): void
  dispose(): void
}

export function createWhaleSystem(scene: THREE.Scene): WhaleSystem {
  const root = new THREE.Group()
  root.name = 'whale-root'
  root.visible = false
  scene.add(root)

  let model: THREE.Object3D | null = null
  let mixer: THREE.AnimationMixer | null = null
  const actions: Partial<Record<string, THREE.AnimationAction>> = {}
  let currentAnim = ''
  let ready = false
  let enabled = true
  let loadPromise: Promise<void> | null = null

  /** Increasing angle = counterclockwise when viewed from above (+Y). */
  let angle = Math.random() * Math.PI * 2
  let angularSpeed = 0.2
  let radiusX = 20
  let radiusZ = 20
  let cruiseY = -CRUISE_DEPTH
  let cruiseSpeed = 12
  let bobPhase = Math.random() * Math.PI * 2
  let headingSmoothed = new THREE.Quaternion()
  let headingInitialized = false

  let animHold = 0
  let lastTimeScale = -1
  /** Force Cycle (with leaps) on this cadence */
  let cycleForceIn = 6 + Math.random() * 6
  let swimsSinceCycle = 0

  resizePath()

  function resizePath(): void {
    const hs = virtualAquarium.halfSize
    radiusX = Math.max(14, hs.x + OUTER_CLEARANCE)
    radiusZ = Math.max(14, hs.z + OUTER_CLEARANCE)
    cruiseY = virtualAquarium.surfaceY - CRUISE_DEPTH
    const meanR = (radiusX + radiusZ) * 0.5
    const perimeter =
      Math.PI *
      (3 * (radiusX + radiusZ) - Math.sqrt((3 * radiusX + radiusZ) * (radiusX + 3 * radiusZ)))
    const targetLap = THREE.MathUtils.clamp(26 + meanR * 0.3, 32, 80)
    cruiseSpeed = perimeter / targetLap
    angularSpeed = cruiseSpeed / Math.max(meanR, 1)
  }

  async function ensureLoaded(): Promise<void> {
    if (loadPromise) return loadPromise
    loadPromise = (async () => {
      const gltf = await loadGltf(WHALE_URL.href)
      const sceneRoot = gltf.scene as THREE.Object3D
      sceneRoot.scale.setScalar(MODEL_SCALE)
      sceneRoot.rotation.set(0, 0, 0)
      sceneRoot.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(sceneRoot)
      box.getCenter(tmpCenter)
      sceneRoot.position.sub(tmpCenter)

      sceneRoot.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.SkinnedMesh)) return
        obj.castShadow = true
        obj.receiveShadow = false
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const m of mats) {
          if (!m) continue
          const mat = m as THREE.MeshStandardMaterial
          const isSkin = !mat.name || mat.name === 'WhaleSkin' || /skin/i.test(mat.name)

          if (isSkin && mat.map) {
            mat.map = liftBellyAlbedo(mat.map)
            mat.map.colorSpace = THREE.SRGBColorSpace
            mat.map.needsUpdate = true
          }

          if ('color' in mat && mat.color) {
            mat.color.multiplyScalar(isSkin ? MATERIAL_BRIGHTEN : 1.15)
            mat.color.r = Math.min(1, mat.color.r)
            mat.color.g = Math.min(1, mat.color.g)
            mat.color.b = Math.min(1, mat.color.b)
          }
          if (isSkin && 'emissive' in mat && mat.emissive) {
            mat.emissive.setHex(MATERIAL_EMISSIVE)
            mat.emissiveIntensity = MATERIAL_EMISSIVE_INTENSITY
          }
          if ('roughness' in mat) mat.roughness = Math.min(0.68, mat.roughness ?? 0.55)
          if ('metalness' in mat) mat.metalness = 0
          mat.needsUpdate = true
        }
      })

      model = sceneRoot
      root.add(model)
      mixer = new THREE.AnimationMixer(model)

      for (const clip of gltf.animations as THREE.AnimationClip[]) {
        if (!ALLOWED_CLIPS.has(clip.name)) continue
        const cleaned = stripRootMotion(clip, STRIP_ROOT_NODES)
        const action = mixer.clipAction(cleaned)
        action.enabled = false
        action.weight = 0
        action.setLoop(THREE.LoopRepeat, Infinity)
        actions[cleaned.name] = action
      }

      setAnim(ANIM.swim, 0)
      pickNextCruiseHold()
      root.visible = enabled
      ready = true
      placeOnOrbit(1 / 60)
    })().catch((err) => {
      console.error('Whale model failed to load', err)
      ready = false
    })
    return loadPromise
  }

  ensureLoaded()

  function setAnim(name: string, fade = FADE): void {
    const next = actions[name]
    if (!next) return
    if (
      currentAnim === name &&
      next.isRunning() &&
      next.enabled &&
      next.getEffectiveWeight() > 0.55
    ) {
      return
    }

    const cur = currentAnim && currentAnim !== name ? actions[currentAnim] : undefined
    const ts = readAnimTimeScale(name)
    lastTimeScale = ts
    next.setEffectiveTimeScale(ts)
    next.setLoop(THREE.LoopRepeat, Infinity)
    // reset() re-enables; weight must be 1 because fadeIn multiplies by this.weight
    next.reset()
    next.weight = 1
    next.play()
    if (cur && fade > 0) {
      next.fadeIn(fade)
      cur.fadeOut(fade)
    } else {
      next.setEffectiveWeight(1)
      if (cur) cur.stop()
    }
    currentAnim = name
  }

  function readAnimTimeScale(name: string): number {
    const pace = THREE.MathUtils.clamp(cruiseSpeed / 12, 0.9, 1.2)
    if (name === ANIM.turn) return 1.05 * pace
    if (name === ANIM.cycle) return 1.0
    return 1.05 * pace
  }

  function randRange(range: readonly [number, number]): number {
    return range[0] + Math.random() * (range[1] - range[0])
  }

  function pickNextCruiseHold(): void {
    if (currentAnim === ANIM.cycle) {
      animHold = randRange(HOLD_CYCLE)
      return
    }
    if (currentAnim === ANIM.turn) {
      animHold = randRange(HOLD_TURN)
      return
    }
    animHold = randRange(HOLD_SWIM)
  }

  function pickCruiseAnim(): CruiseAnim {
    if (cycleForceIn <= 0 || swimsSinceCycle >= 2) return ANIM.cycle
    const cornerness = Math.abs(Math.sin(2 * angle))
    if (cornerness > 0.55 && Math.random() < 0.35) return ANIM.turn
    const roll = Math.random()
    if (roll < 0.3) return ANIM.cycle
    if (roll < 0.5) return ANIM.turn
    return ANIM.swim
  }

  function applyCruisePick(next: CruiseAnim): void {
    if (next === currentAnim) {
      pickNextCruiseHold()
      return
    }
    setAnim(next, FADE)
    if (next === ANIM.cycle) {
      swimsSinceCycle = 0
      cycleForceIn = randRange([CYCLE_FORCE_MIN, CYCLE_FORCE_MAX])
    } else if (next === ANIM.swim) {
      swimsSinceCycle += 1
    }
    pickNextCruiseHold()
  }

  /**
   * Mesh nose = +Z, dorsal = +Y.
   * Right-handed basis (det=+1). Positive pitch = nose up.
   */
  function writeHeading(forward: THREE.Vector3, pitch: number, dt: number): void {
    tmpLook.copy(forward).normalize()

    tmpRight.crossVectors(tmpLook, worldUp)
    if (tmpRight.lengthSq() < 1e-8) tmpRight.set(1, 0, 0)
    tmpRight.normalize()

    if (Math.abs(pitch) > 1e-5) {
      tmpLook.applyAxisAngle(tmpRight, pitch).normalize()
    }

    tmpRight.crossVectors(worldUp, tmpLook)
    if (tmpRight.lengthSq() < 1e-8) tmpRight.set(1, 0, 0)
    tmpRight.normalize()
    tmpUp.crossVectors(tmpLook, tmpRight).normalize()
    if (tmpUp.dot(worldUp) < 0) tmpUp.negate()
    tmpRight.crossVectors(tmpUp, tmpLook).normalize()
    tmpUp.crossVectors(tmpLook, tmpRight).normalize()

    tmpMat.makeBasis(tmpRight, tmpUp, tmpLook)
    tmpQuat.setFromRotationMatrix(tmpMat)

    if (!headingInitialized) {
      headingSmoothed.copy(tmpQuat)
      headingInitialized = true
    } else {
      const onLeap = Math.abs(pitch) > 0.08
      const response = onLeap ? 14 : 8
      const alpha = 1 - Math.exp(-response * Math.max(0, dt))
      headingSmoothed.slerp(tmpQuat, alpha)
    }
    root.quaternion.copy(headingSmoothed)
  }

  function cycleBreachLift(): number {
    const action = actions[ANIM.cycle]
    if (!action || currentAnim !== ANIM.cycle) return 0
    const t = action.time % CYCLE_DURATION
    const amp = BREACH_APEX + CRUISE_DEPTH * 0.35
    const lift = (lo: number, hi: number) => {
      if (t < lo || t > hi) return 0
      const u = (t - lo) / Math.max(hi - lo, 1e-3)
      return Math.sin(Math.PI * u) * amp
    }
    return Math.max(lift(CYCLE_BREACH_A[0], CYCLE_BREACH_A[1]), lift(CYCLE_BREACH_B[0], CYCLE_BREACH_B[1]))
  }

  function cycleBreachPitch(): number {
    const action = actions[ANIM.cycle]
    if (!action || currentAnim !== ANIM.cycle) return 0
    const t = action.time % CYCLE_DURATION
    const pitchOf = (lo: number, hi: number) => {
      if (t < lo || t > hi) return 0
      const u = (t - lo) / Math.max(hi - lo, 1e-3)
      const dy = Math.PI * Math.cos(Math.PI * u)
      return Math.atan2(dy, 2.5) * 0.85
    }
    const a = pitchOf(CYCLE_BREACH_A[0], CYCLE_BREACH_A[1])
    const b = pitchOf(CYCLE_BREACH_B[0], CYCLE_BREACH_B[1])
    return Math.abs(a) > Math.abs(b) ? a : b
  }

  /** Counterclockwise orbit (viewed from above): θ↑, tangent (−sin, cos). */
  function placeOnOrbit(dt: number): void {
    const c = virtualAquarium.center
    const x = c.x + Math.cos(angle) * radiusX
    const z = c.z + Math.sin(angle) * radiusZ
    bobPhase += dt * 0.85
    const bob = Math.sin(bobPhase) * 0.25
    const lift = cycleBreachLift()
    root.position.set(x, cruiseY + bob + lift, z)
    tmpFwd.set(-Math.sin(angle) * radiusX, 0, Math.cos(angle) * radiusZ).normalize()
    writeHeading(tmpFwd, cycleBreachPitch(), dt)
  }

  function update(dt: number): void {
    if (!ready || !enabled || dt <= 0) return
    const simDt = Math.min(dt, 1 / 30)

    angle += angularSpeed * simDt
    if (angle > Math.PI * 2) angle -= Math.PI * 2

    if (currentAnim !== ANIM.cycle && cycleForceIn > 0) cycleForceIn -= simDt

    placeOnOrbit(simDt)

    animHold -= simDt
    if (animHold <= 0) {
      // Timer force → Cycle for leaps; otherwise normal Swim/Turn/Cycle mix
      if (cycleForceIn <= 0 && currentAnim !== ANIM.cycle) {
        applyCruisePick(ANIM.cycle)
      } else {
        applyCruisePick(pickCruiseAnim())
      }
    }

    const action = actions[currentAnim]
    if (action) {
      const ts = readAnimTimeScale(currentAnim)
      if (Math.abs(ts - lastTimeScale) > 0.01) {
        action.setEffectiveTimeScale(ts)
        lastTimeScale = ts
      }
    }

    mixer?.update(simDt)
  }

  function setEnabled(on: boolean): void {
    enabled = on
    root.visible = on && ready
  }

  function dispose(): void {
    mixer?.stopAllAction()
    if (model) {
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) {
          obj.geometry?.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const m of mats) m?.dispose()
        }
      })
      root.remove(model)
    }
    scene.remove(root)
    model = null
    mixer = null
  }

  return {
    get ready() { return ready },
    get enabled() { return enabled },
    setEnabled,
    update,
    resizePath,
    dispose,
  }
}

function stripRootMotion(clip: THREE.AnimationClip, roots: string[]): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => {
    const name = track.name
    return !roots.some((r) => name === r || name.startsWith(`${r}.`))
  })
  return new THREE.AnimationClip(clip.name, clip.duration, tracks)
}

/** Raise belly/light texels toward white; leave dark dorsal mostly unchanged. */
function liftBellyAlbedo(texture: THREE.Texture): THREE.Texture {
  const image = texture.image as { width?: number; height?: number } | undefined
  if (!image?.width || !image?.height || typeof document === 'undefined') return texture

  const w = image.width
  const h = image.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return texture

  try {
    ctx.drawImage(image as CanvasImageSource, 0, 0)
  } catch {
    return texture
  }

  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!
    const g = px[i + 1]!
    const b = px[i + 2]!
    const lum = (r + g + b) / (3 * 255)
    const t = THREE.MathUtils.smoothstep(lum, BELLY_LIFT_LO, BELLY_LIFT_HI) * BELLY_LIFT
    if (t <= 0) continue
    px[i] = Math.min(255, Math.round(r + (255 - r) * t))
    px[i + 1] = Math.min(255, Math.round(g + (255 - g) * t))
    px[i + 2] = Math.min(255, Math.round(b + (255 - b) * t))
  }
  ctx.putImageData(data, 0, 0)

  const next = new THREE.CanvasTexture(canvas)
  next.colorSpace = texture.colorSpace ?? THREE.SRGBColorSpace
  next.flipY = texture.flipY
  next.wrapS = texture.wrapS
  next.wrapT = texture.wrapT
  next.magFilter = texture.magFilter
  next.minFilter = texture.minFilter
  next.needsUpdate = true
  return next
}

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

function loadGltf(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.setDRACOLoader(dracoLoader)
    loader.load(url, resolve, undefined, reject)
  })
}
