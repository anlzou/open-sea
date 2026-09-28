import * as THREE from 'three/webgpu'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { fishConfig } from './config.js'
import { getAnimatedFishTemplate } from './model-loader.js'
import { readFishDirection, writeFishOrientationQuaternion } from './pose.js'
import type { FishState } from './types.js'

/** Hard max — each fish is a SkinnedMesh + AnimationMixer (not instanced). */
export const SKELETAL_ANIM_HARD_MAX = 96

/** @deprecated use SKELETAL_ANIM_HARD_MAX */
export const SKELETAL_ANIM_SOFT_CAP = SKELETAL_ANIM_HARD_MAX

const ANIM_SWIM = 'Swim'
const ANIM_TURN_LEFT = 'TurnLeft'
const ANIM_TURN_RIGHT = 'TurnRight'
const FADE_DURATION = 0.32

/**
 * Native clip length (fish.md: 48 frames @ 24 fps = 2.00 s).
 * timeScale 1 → 0.5 Hz body cycle.
 */
const CLIP_PERIOD_SECONDS = 2

/** Enter turn clips when |turnBias| exceeds this; exit back to Swim below EXIT. */
const TURN_ENTER = 0.22
const TURN_EXIT = 0.12

const unitScale = new THREE.Vector3(1, 1, 1)
const tmpDirection = new THREE.Vector3()
const tmpQuaternion = new THREE.Quaternion()
const tmpScale = new THREE.Vector3()

type AnimName = typeof ANIM_SWIM | typeof ANIM_TURN_LEFT | typeof ANIM_TURN_RIGHT

interface SkinnedFishActor {
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  actions: Record<string, THREE.AnimationAction>
  current: AnimName
  ownedMaterials: THREE.Material[]
}

export interface SkinnedFishSchool {
  group: THREE.Group
  setCount(count: number): void
  setVisible(visible: boolean): void
  update(fish: FishState[], dt: number): void
  dispose(): void
}

export function createSkinnedFishSchool(
  scene: THREE.Scene,
  options: { capacity: number; renderScale?: number; materialTint?: THREE.ColorRepresentation },
): SkinnedFishSchool | null {
  const template = getAnimatedFishTemplate()
  if (!template || !template.animations.length) return null

  const capacity = Math.max(0, options.capacity)
  const renderScale = options.renderScale ?? 1
  const group = new THREE.Group()
  group.name = 'skinned-fish-school'
  scene.add(group)

  const pool: SkinnedFishActor[] = []
  let activeCount = 0

  function ensurePool(size: number): void {
    const target = Math.min(size, capacity)
    while (pool.length < target) {
      try {
        pool.push(createActor(template, pool.length, options.materialTint))
      } catch (err) {
        console.error('Failed to create skinned fish actor', err)
        break
      }
    }
  }

  function setCount(count: number): void {
    activeCount = Math.max(0, Math.min(count, capacity))
    ensurePool(activeCount)
    for (let i = 0; i < pool.length; i += 1) {
      const actor = pool[i]
      if (!actor) continue
      const on = i < activeCount
      actor.root.visible = on
      if (on && !actor.root.parent) group.add(actor.root)
      if (!on && actor.root.parent) group.remove(actor.root)
    }
  }

  function setVisible(visible: boolean): void {
    group.visible = visible
  }

  function update(fish: FishState[], dt: number): void {
    if (!group.visible || activeCount <= 0 || dt <= 0) return
    const count = Math.min(fish.length, activeCount, pool.length)
    const fishScale = fishConfig.renderScale * renderScale * template.normalizeScale

    for (let i = 0; i < count; i += 1) {
      const state = fish[i]
      const actor = pool[i]
      if (!state || !actor) continue

      const direction = readFishDirection(state, tmpDirection)
      writeFishOrientationQuaternion(state, direction, tmpQuaternion)
      tmpScale.copy(unitScale).multiplyScalar(fishScale)
      actor.root.position.copy(state.position)
      actor.root.quaternion.copy(tmpQuaternion)
      actor.root.scale.copy(tmpScale)

      const desired = pickAnim(state, actor.current)
      if (desired !== actor.current) crossFade(actor, desired)

      const timeScale = readAnimTimeScale(state)
      const active = actor.actions[actor.current]
      if (active) active.setEffectiveTimeScale(timeScale)

      actor.mixer.update(dt)
    }
  }

  function dispose(): void {
    for (const actor of pool) {
      actor.mixer.stopAllAction()
      for (const m of actor.ownedMaterials) m.dispose()
      group.remove(actor.root)
    }
    pool.length = 0
    scene.remove(group)
  }

  setCount(0)
  return { group, setCount, setVisible, update, dispose }
}

function createActor(
  template: NonNullable<ReturnType<typeof getAnimatedFishTemplate>>,
  index: number,
  materialTint?: THREE.ColorRepresentation,
): SkinnedFishActor {
  const model = cloneSkinned(template.scene) as THREE.Object3D
  model.position.copy(template.centerOffset)

  const ownedMaterials: THREE.Material[] = []
  if (materialTint != null) {
    const tint = new THREE.Color(materialTint)
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.SkinnedMesh)) return
      const src = obj.material
      const mats = Array.isArray(src) ? src : [src]
      const next = mats.map((m) => {
        const c = m.clone()
        ownedMaterials.push(c)
        if ('color' in c && c.color instanceof THREE.Color) c.color.multiply(tint)
        return c
      })
      obj.material = Array.isArray(src) ? next : next[0]!
    })
  }

  const orient = new THREE.Group()
  orient.quaternion.copy(template.orientQuaternion)
  orient.add(model)

  const root = new THREE.Group()
  root.add(orient)
  root.visible = false

  const mixer = new THREE.AnimationMixer(model)
  const actions: Record<string, THREE.AnimationAction> = {}
  for (const clip of template.animations) {
    const action = mixer.clipAction(clip)
    action.enabled = false
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.play()
    action.paused = true
    actions[clip.name] = action
  }

  // Stagger phase so the school doesn't sync-beat
  const phaseOffset = (index * 0.37) % CLIP_PERIOD_SECONDS
  const swim = actions[ANIM_SWIM]
  if (swim) {
    swim.enabled = true
    swim.paused = false
    swim.time = phaseOffset
    swim.setEffectiveWeight(1)
  }

  root.updateMatrixWorld(true)
  model.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh && obj.skeleton) {
      obj.skeleton.update()
    }
  })

  return {
    root,
    mixer,
    actions,
    current: ANIM_SWIM,
    ownedMaterials,
  }
}

/**
 * Forward → Swim; left → TurnLeft; right → TurnRight.
 * Schmitt thresholds avoid flicker at the Swim/Turn boundary.
 */
function pickAnim(fish: FishState, current: AnimName): AnimName {
  const bias = fish.turnBias ?? 0
  const abs = Math.abs(bias)

  if (current === ANIM_SWIM) {
    if (abs < TURN_ENTER) return ANIM_SWIM
    return bias > 0 ? ANIM_TURN_LEFT : ANIM_TURN_RIGHT
  }

  // Stay in turn until bias drops below EXIT, or flips to the other side
  if (current === ANIM_TURN_LEFT) {
    if (bias < -TURN_ENTER) return ANIM_TURN_RIGHT
    if (bias > TURN_EXIT) return ANIM_TURN_LEFT
    return ANIM_SWIM
  }

  // ANIM_TURN_RIGHT
  if (bias > TURN_ENTER) return ANIM_TURN_LEFT
  if (bias < -TURN_EXIT) return ANIM_TURN_RIGHT
  return ANIM_SWIM
}

/**
 * Map simulation swim frequency (Hz) onto the 2 s clip.
 * Cruise keeps a gentle floor so Swim never freezes when swimDrive ≈ 0.
 */
function readAnimTimeScale(fish: FishState): number {
  const speed = fish.velocity.length()
  const speedNorm = THREE.MathUtils.clamp((speed - 2) / 6, 0, 1)
  const swimDrive = THREE.MathUtils.clamp(fish.swimDrive ?? 0, 0, 1)

  // Steady cruise: ~0.75–1.05 Hz; bursts up to swimFrequencyMax
  const cruiseHz = THREE.MathUtils.lerp(0.75, 1.05, speedNorm)
  const activeHz = THREE.MathUtils.lerp(
    fishConfig.swimFrequencyMin,
    fishConfig.swimFrequencyMax,
    swimDrive,
  )
  const targetHz = Math.max(cruiseHz, activeHz)

  // Clip @ 1.0 = 1/CLIP_PERIOD Hz → timeScale = targetHz * period
  return THREE.MathUtils.clamp(targetHz * CLIP_PERIOD_SECONDS, 0.85, 2.4)
}

function crossFade(actor: SkinnedFishActor, nextName: AnimName): void {
  const next = actor.actions[nextName]
  const cur = actor.actions[actor.current]
  if (!next) return

  // Keep phase continuity so the tail wave doesn't jump on clip switch
  const phase = cur ? cur.time % CLIP_PERIOD_SECONDS : 0
  next.reset()
  next.enabled = true
  next.paused = false
  next.time = phase
  next.setEffectiveWeight(1)
  next.play()
  if (cur && cur !== next) {
    next.crossFadeFrom(cur, FADE_DURATION, false)
  }
  actor.current = nextName
}
