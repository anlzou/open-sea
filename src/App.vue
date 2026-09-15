<script setup>
import { ref, provide, onMounted, onBeforeUnmount } from 'vue'
import OpenSeaLoader from './views/OpenSeaLoader.vue'

const wallpaperMode = ref(false)
const panelsRevealed = ref(true)
const wallpaperHint = ref('')
let wallpaperTimer = null
let hintTimer = null

function clearWallpaperTimer() {
  if (wallpaperTimer) { clearTimeout(wallpaperTimer); wallpaperTimer = null }
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement)
}

async function enterFullscreen() {
  if (isFullscreen()) return
  const el = document.documentElement
  try {
    if (el.requestFullscreen) await el.requestFullscreen()
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
  } catch {
    wallpaperHint.value = '当前浏览器不支持全屏，可使用 F11'
    if (hintTimer) clearTimeout(hintTimer)
    hintTimer = setTimeout(() => { wallpaperHint.value = '' }, 3000)
  }
}

async function exitFullscreen() {
  if (!isFullscreen()) return
  try {
    if (document.exitFullscreen) await document.exitFullscreen()
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
  } catch { /* ignore */ }
}

function clearWallpaperUI() {
  wallpaperMode.value = false
  panelsRevealed.value = true
  wallpaperHint.value = ''
  clearWallpaperTimer()
}

function revealPanelsTemporarily() {
  if (!wallpaperMode.value) return
  panelsRevealed.value = true
  wallpaperHint.value = ''
  clearWallpaperTimer()
  wallpaperTimer = setTimeout(() => { panelsRevealed.value = false }, 5000)
}

async function toggleWallpaper() {
  if (!wallpaperMode.value) {
    wallpaperMode.value = true
    panelsRevealed.value = false
    wallpaperHint.value = ''
    clearWallpaperTimer()
    await enterFullscreen()
  } else {
    clearWallpaperUI()
    await exitFullscreen()
  }
}

async function exitWallpaper() {
  clearWallpaperUI()
  await exitFullscreen()
}

function showWallpaperHint() {
  if (!wallpaperMode.value || panelsRevealed.value) return
  wallpaperHint.value = '双击屏幕退出全屏'
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => { wallpaperHint.value = '' }, 3000)
}

provide('wallpaperMode', wallpaperMode)
provide('panelsRevealed', panelsRevealed)
provide('toggleWallpaper', toggleWallpaper)
provide('revealPanelsTemporarily', revealPanelsTemporarily)

function onGlobalKey(e) {
  if (wallpaperMode.value && (e.code === 'Escape' || e.code === 'KeyQ')) {
    void exitWallpaper()
  }
}

function onGlobalDblClick() {
  if (wallpaperMode.value || isFullscreen()) {
    void exitWallpaper()
    return
  }
}

function onGlobalClick(e) {
  if (!wallpaperMode.value) return
  if (e.target?.closest?.('.sea-dock')) return
  if (!panelsRevealed.value) {
    revealPanelsTemporarily()
    return
  }
  showWallpaperHint()
}

function onFullscreenChange() {
  // Browser chrome / Esc left fullscreen — drop wallpaper UI with it.
  if (!isFullscreen() && wallpaperMode.value) clearWallpaperUI()
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
  document.addEventListener('dblclick', onGlobalDblClick)
  document.addEventListener('click', onGlobalClick)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  document.removeEventListener('dblclick', onGlobalDblClick)
  document.removeEventListener('click', onGlobalClick)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
  clearWallpaperTimer()
  if (hintTimer) clearTimeout(hintTimer)
})
</script>

<template>
  <div
    class="app-layout"
    :data-wallpaper="wallpaperMode ? 'true' : undefined"
    :data-panels-revealed="panelsRevealed ? 'true' : undefined"
  >
    <OpenSeaLoader />
    <Transition name="hint-fade">
      <div v-if="wallpaperHint" class="wallpaper-hint">{{ wallpaperHint }}</div>
    </Transition>
  </div>
</template>
