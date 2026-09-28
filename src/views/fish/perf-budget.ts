import { SKELETAL_ANIM_HARD_MAX } from './skinned-school-renderer.js'

/**
 * Per quality tier (0=Ultra … 4=Potato) default count of skinned animated fish.
 * SkinnedMesh + AnimationMixer is far costlier than InstancedMesh.
 */
const TIER_DEFAULTS = [48, 32, 20, 12, 6] as const

/**
 * Recommend how many fish should use skeletal Swim/Turn clips
 * given the adaptive quality tier (and light device heuristics).
 */
export function recommendSkeletalFishCount(tier = 2): number {
  const t = Math.max(0, Math.min(4, Math.round(tier)))
  let count: number = TIER_DEFAULTS[t] ?? TIER_DEFAULTS[2]

  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4
  if (cores <= 2) count = Math.min(count, 8)
  else if (cores <= 4) count = Math.min(count, 16)

  const mem = typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined
  if (typeof mem === 'number' && mem > 0 && mem <= 4) count = Math.min(count, 12)

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) count = Math.max(4, Math.round(count * 0.55))

  const area = typeof window !== 'undefined' ? window.innerWidth * window.innerHeight : 0
  if (area > 3_600_000) count = Math.max(4, Math.round(count * 0.75))

  return Math.max(0, Math.min(SKELETAL_ANIM_HARD_MAX, count))
}

export function skeletalFishCountMax(): number {
  return SKELETAL_ANIM_HARD_MAX
}
