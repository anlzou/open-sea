/**
 * Demo-mode weather director — plausible sequences by time of day.
 *
 * Indices match OpenSea UI: 0 clear · 1 snow · 2 rain · 3 storm
 *
 * Design notes:
 * - Rain often intensifies to storm, then eases back (小雨 → 大雨 → 小雨/晴).
 * - Snow usually clears afterward (下雪 → 晴), sometimes melts into rain.
 * - Night strongly prefers clear so meteors stay visible.
 * - Dawn/dusk favour soft weather; midday allows more variety.
 */

export const WEATHER_CLEAR = 0
export const WEATHER_SNOW = 1
export const WEATHER_RAIN = 2
export const WEATHER_STORM = 3

/** @typedef {'night' | 'dawn' | 'day' | 'dusk'} DayPhase */

/**
 * @param {number} hour hours in [0, 24)
 * @returns {DayPhase}
 */
export function dayPhaseAt(hour) {
  if (hour < 5 || hour >= 19.5) return 'night'
  if (hour < 8.5) return 'dawn'
  if (hour >= 16.5) return 'dusk'
  return 'day'
}

/**
 * Weighted pick. weights[i] pairs with options[i]; zeros are skipped.
 * @param {number[]} options
 * @param {number[]} weights
 */
function pickWeighted(options, weights) {
  let sum = 0
  for (const w of weights) sum += Math.max(0, w)
  if (sum <= 0) return options[0]
  let r = Math.random() * sum
  for (let i = 0; i < options.length; i += 1) {
    r -= Math.max(0, weights[i])
    if (r <= 0) return options[i]
  }
  return options[options.length - 1]
}

/**
 * Transition weights from current weather, biased by day phase.
 * @param {number} current
 * @param {DayPhase} phase
 * @returns {{ options: number[], weights: number[] }}
 */
function transitionTable(current, phase) {
  const night = phase === 'night'
  const soft = phase === 'dawn' || phase === 'dusk'

  if (current === WEATHER_CLEAR) {
    if (night) {
      // Stay clear for meteor skies; rare light weather only.
      return {
        options: [WEATHER_CLEAR, WEATHER_RAIN, WEATHER_SNOW, WEATHER_STORM],
        weights: [0.78, 0.12, 0.08, 0.02],
      }
    }
    if (soft) {
      return {
        options: [WEATHER_CLEAR, WEATHER_RAIN, WEATHER_SNOW, WEATHER_STORM],
        weights: [0.48, 0.28, 0.16, 0.08],
      }
    }
    // Daytime: room for weather stories to start (often with rain).
    return {
      options: [WEATHER_CLEAR, WEATHER_RAIN, WEATHER_SNOW, WEATHER_STORM],
      weights: [0.38, 0.34, 0.16, 0.12],
    }
  }

  if (current === WEATHER_RAIN) {
    // 小雨 → 常加强为大雨，或停雨转晴；极少直接变雪。
    if (night) {
      return {
        options: [WEATHER_CLEAR, WEATHER_RAIN, WEATHER_STORM, WEATHER_SNOW],
        weights: [0.48, 0.22, 0.22, 0.08],
      }
    }
    return {
      options: [WEATHER_RAIN, WEATHER_STORM, WEATHER_CLEAR, WEATHER_SNOW],
      weights: [0.28, 0.36, 0.30, 0.06],
    }
  }

  if (current === WEATHER_STORM) {
    // 大雨必须缓和：回小雨或转晴，不跳到下雪。
    if (night) {
      return {
        options: [WEATHER_RAIN, WEATHER_CLEAR, WEATHER_STORM],
        weights: [0.42, 0.46, 0.12],
      }
    }
    return {
      options: [WEATHER_RAIN, WEATHER_CLEAR, WEATHER_STORM],
      weights: [0.52, 0.34, 0.14],
    }
  }

  // snow — 雪后多转晴，偶融成雨
  if (night) {
    return {
      options: [WEATHER_CLEAR, WEATHER_SNOW, WEATHER_RAIN, WEATHER_STORM],
      weights: [0.58, 0.26, 0.12, 0.04],
    }
  }
  return {
    options: [WEATHER_CLEAR, WEATHER_SNOW, WEATHER_RAIN, WEATHER_STORM],
    weights: [0.46, 0.30, 0.18, 0.06],
  }
}

/**
 * How long (real seconds in demo) to hold this weather before the next roll.
 * @param {number} weather
 * @param {DayPhase} phase
 */
export function demoWeatherHold(weather, phase) {
  const jitter = (a, b) => a + Math.random() * (b - a)
  if (weather === WEATHER_CLEAR) {
    if (phase === 'night') return jitter(55, 110) // linger for meteors
    if (phase === 'day') return jitter(28, 55)
    return jitter(32, 60)
  }
  if (weather === WEATHER_RAIN) return jitter(22, 42) // short enough to escalate
  if (weather === WEATHER_STORM) return jitter(16, 32) // dramatic, then ease
  // snow
  return jitter(28, 50)
}

/**
 * Pick the next weather index from a plausible transition.
 * @param {number} current
 * @param {number} hour
 */
export function nextDemoWeather(current, hour) {
  const phase = dayPhaseAt(hour)
  const { options, weights } = transitionTable(current, phase)
  return pickWeighted(options, weights)
}

/**
 * Opening weather when demo starts — night opens clear; day may start with a mild story.
 * @param {number} hour
 */
export function initialDemoWeather(hour) {
  const phase = dayPhaseAt(hour)
  if (phase === 'night') return WEATHER_CLEAR
  if (phase === 'dawn' || phase === 'dusk') {
    return pickWeighted(
      [WEATHER_CLEAR, WEATHER_RAIN, WEATHER_SNOW],
      [0.55, 0.30, 0.15],
    )
  }
  return pickWeighted(
    [WEATHER_CLEAR, WEATHER_RAIN, WEATHER_SNOW, WEATHER_STORM],
    [0.40, 0.32, 0.16, 0.12],
  )
}
