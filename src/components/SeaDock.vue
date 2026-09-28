<script setup>
import { ref, watch, inject, onMounted, onBeforeUnmount } from 'vue'
import { consoleDrag } from '../composables/consoleDrag.js'

const props = defineProps({
  t: { type: Function, required: true },
  currentLang: { type: String, default: 'zh' },
  seaValue: { type: String, default: '0.93' },
  seaSliderValue: { type: Number, default: 45 },
  driftEnabled: { type: Boolean, default: true },
  timeLabel: { type: String, default: '' },
  timeSliderValue: { type: Number, default: 55 },
  realTimeMode: { type: Boolean, default: true },
  demoMode: { type: Boolean, default: false },
  showTimeMark: { type: Boolean, default: true },
  weatherType: { type: Number, default: 0 },
  weatherLabels: { type: Array, default: () => [] },
  lightningFlash: { type: Number, default: 0 },
  aquariumSize: { type: Number, default: 20 },
  showBoundary: { type: Boolean, default: false },
  fishReady: { type: Boolean, default: false },
  fishLoadProgress: { type: Number, default: 1 },
  fishModelKeys: { type: Array, default: () => [] },
  fishDisplay: { type: Object, required: true },
  skeletalAnim: { type: Boolean, default: true },
  skeletalSoftCap: { type: Number, default: 96 },
  skeletalCount: { type: Number, default: 20 },
  skeletalCountMax: { type: Number, default: 96 },
  recommendedSkeletalCount: { type: Number, default: 20 },
  whaleEnabled: { type: Boolean, default: true },
  meteorCfg: { type: Object, required: true },
  fps: { type: [Number, String], default: '--' },
  qualityBadge: { type: String, default: '' },
  qualityLabel: { type: String, default: '' },
  fishCamActive: { type: Boolean, default: false },
  ultraHd: { type: Boolean, default: false },
  playing: { type: Boolean, default: true },
  simSpeed: { type: Number, default: 1 },
})

const emit = defineEmits([
  'toggleLang',
  'seaState',
  'toggleDrift',
  'timeOfDay',
  'toggleRealTime',
  'toggleDemo',
  'toggleTimeMark',
  'weather',
  'lightningFlash',
  'aquariumSize',
  'toggleBoundary',
  'fishControl',
  'toggleSkeletalAnim',
  'toggleWhale',
  'meteorMode',
  'meteorCfg',
  'meteorShower',
  'togglePlay',
  'updateSpeed',
  'toggleUltraHd',
  'resetCamera',
  'toggleFishCam',
])

const wallpaperMode = inject('wallpaperMode', ref(false))
const toggleWallpaper = inject('toggleWallpaper', () => {})

const dockRef = ref(null)
const open = ref(false)
const alpha = ref(0.15)
const playingLocal = ref(props.playing)
let dragApi = null

watch(() => props.playing, (v) => { playingLocal.value = v })

function setAlpha(val) {
  alpha.value = val
  document.documentElement.style.setProperty('--console-alpha', String(val))
}

function toggleOpen() {
  open.value = !open.value
  dockRef.value?.classList.toggle('open', open.value)
  dockRef.value?.querySelector('#dock-toggle')?.setAttribute('aria-expanded', String(open.value))
  dragApi?.reposition()
}

function ringPressed(on) {
  dockRef.value?.querySelector('#dock-toggle')?.classList.toggle('pressed', on)
}

function setBtnPressed(event, on) {
  const btn = event.target?.closest?.('button')
  if (!btn || btn.id === 'dock-toggle') return
  if (!dockRef.value?.contains(btn)) return
  btn.classList.toggle('pressed', on)
}

function onTogglePlay() {
  playingLocal.value = !playingLocal.value
  emit('togglePlay', playingLocal.value)
}

function onDocPointerUp(e) {
  setBtnPressed(e, false)
  ringPressed(false)
}

onMounted(() => {
  setAlpha(alpha.value)
  if (dockRef.value) {
    dragApi = consoleDrag(dockRef.value)
    dockRef.value.querySelector('#console-reset')?.addEventListener('click', () => {
      open.value = false
    })
  }
  document.addEventListener('pointerup', onDocPointerUp, true)
  document.addEventListener('pointercancel', onDocPointerUp, true)
})

onBeforeUnmount(() => {
  dragApi = null
  document.removeEventListener('pointerup', onDocPointerUp, true)
  document.removeEventListener('pointercancel', onDocPointerUp, true)
})
</script>

<template>
  <div
    ref="dockRef"
    class="sea-dock ui"
    :class="{ open }"
    @pointerdown="setBtnPressed($event, true)"
  >
    <button
      id="dock-toggle"
      class="dock-ring"
      type="button"
      data-drag-handle
      :aria-expanded="open"
      aria-controls="sea-console"
      aria-label="展开或收起控制面板"
      title="点击展开 · 拖动移动"
      @click="toggleOpen"
      @pointerdown="ringPressed(true)"
      @pointerup="ringPressed(false)"
      @pointercancel="ringPressed(false)"
    />

    <section id="sea-console" class="sea-console" aria-label="海洋控制">
      <div class="console-title" data-drag-handle>
        <span>◉ OPEN SEA</span>
        <span class="fine">{{ t('panel.eyebrow') }}</span>
        <button id="console-reset" class="console-reset" type="button" title="控制面板回到默认位置" aria-label="控制面板回到默认位置">⟲</button>
      </div>

      <div class="console-body">
        <div class="panel-groups">
          <!-- Ocean -->
          <details class="panel-card" open>
            <summary>海洋</summary>
            <div class="actions-row" style="margin-top:0;margin-bottom:8px;">
              <button type="button" @click="emit('toggleLang')">{{ currentLang === 'en' ? '中文' : 'EN' }}</button>
              <button type="button" :class="{ active: demoMode }" @click="emit('toggleDemo')">演示模式</button>
              <button type="button" :class="{ active: wallpaperMode }" @click="toggleWallpaper()">壁纸模式</button>
            </div>
            <p class="help-text" style="margin:0 0 10px;">{{ t('panel.subtitle') }}</p>
            <p v-if="demoMode" class="help-text" style="margin:0 0 10px;color:var(--sea-accent);">演示中：时间快进 · 天气按时段合理更替 · 夜间偏晴看流星</p>

            <label class="field-row with-toggle">
              <span>{{ t('panel.seaState') }}</span>
              <input type="range" min="0" max="100" step="1" :value="seaSliderValue"
                @input="emit('seaState', $event)" :aria-label="t('panel.seaState')" />
              <button type="button" class="pill" :class="{ active: driftEnabled }" @click="emit('toggleDrift')">{{ driftEnabled ? 'ON' : 'OFF' }}</button>
              <output>{{ seaValue }}</output>
            </label>

            <label class="field-row with-toggle">
              <span>{{ t('panel.timeOfDay') }}</span>
              <input type="range" min="0" max="100" step="1" :value="timeSliderValue"
                @input="emit('timeOfDay', $event)" :aria-label="t('panel.timeOfDay')" />
              <button type="button" class="pill" :class="{ active: realTimeMode }" @click="emit('toggleRealTime')">{{ realTimeMode ? 'ON' : 'OFF' }}</button>
              <output>{{ timeLabel }}</output>
            </label>
          </details>

          <!-- Weather -->
          <details class="panel-card" open>
            <summary>天气</summary>
            <label class="field-row">
              <span>{{ t('panel.weather') }}</span>
              <input type="range" min="0" max="3" step="1" :value="weatherType"
                @input="emit('weather', $event)" :aria-label="t('panel.weather')" />
              <output>{{ weatherLabels[weatherType] }}</output>
            </label>

            <label v-if="weatherType === 3" class="field-row">
              <span>{{ t('panel.lightningFlash') }}</span>
              <input type="range" min="0" max="100" step="1" :value="lightningFlash"
                @input="emit('lightningFlash', $event)" />
              <output>{{ lightningFlash }}%</output>
            </label>

            <template v-if="weatherType === 0">
              <div class="group-label" style="margin-top:10px;">流星</div>
              <div class="actions-row" style="margin-top:0;">
                <button type="button" :class="{ active: meteorCfg.mode === 'random' }" @click="emit('meteorMode', 'random')">随机角</button>
                <button type="button" :class="{ active: meteorCfg.mode === 'radiant' }" @click="emit('meteorMode', 'radiant')">辐射点</button>
              </div>
              <template v-if="meteorCfg.mode === 'radiant'">
                <label class="field-row">
                  <span>每批数量</span>
                  <input type="range" min="1" max="6" step="1" :value="meteorCfg.radiantBurst"
                    @input="emit('meteorCfg', 'radiantBurst', parseFloat($event.target.value))" />
                  <output>{{ meteorCfg.radiantBurst }}</output>
                </label>
                <label class="field-row">
                  <span>发散范围</span>
                  <input type="range" min="0.3" max="1.5" step="0.05" :value="meteorCfg.radiantSpread"
                    @input="emit('meteorCfg', 'radiantSpread', parseFloat($event.target.value))" />
                  <output>{{ meteorCfg.radiantSpread.toFixed(2) }}</output>
                </label>
              </template>
              <div class="actions-row">
                <button type="button" @click="emit('meteorShower')">立即触发</button>
              </div>
            </template>
          </details>

          <!-- Sardines -->
          <details class="panel-card" open>
            <summary>{{ t('fish.title') }}</summary>
            <div v-if="fishModelKeys.length" class="help-text" style="margin-bottom:8px;">{{ fishModelKeys.join(' · ') }}</div>
            <div v-if="fishLoadProgress < 1" class="fish-progress-wrap">
              <div class="fish-progress-pct">{{ Math.round(fishLoadProgress * 100) }}%</div>
              <div class="fish-progress-track">
                <div class="fish-progress-bar" :style="{ width: Math.max(fishLoadProgress * 100, 2) + '%' }" />
              </div>
            </div>

            <label class="field-row with-toggle">
              <span>{{ t('panel.aquariumSize') }}</span>
              <input type="range" min="20" max="100" step="1" :value="aquariumSize"
                @input="emit('aquariumSize', $event)" />
              <button type="button" class="pill" :class="{ active: showBoundary }" @click="emit('toggleBoundary')">{{ showBoundary ? 'ON' : 'OFF' }}</button>
              <output>{{ aquariumSize }}×{{ aquariumSize }}</output>
            </label>

            <label class="field-row with-toggle" style="margin-bottom:10px;">
              <span>{{ t('fish.skeletalAnim') }}</span>
              <button type="button" class="pill" :class="{ active: skeletalAnim }" :disabled="!fishReady"
                @click="emit('toggleSkeletalAnim')">{{ skeletalAnim ? 'ON' : 'OFF' }}</button>
              <output style="font-size:10px;opacity:.7;">推荐 {{ recommendedSkeletalCount }}</output>
            </label>
            <label class="field-row" style="margin-bottom:6px;">
              <span>{{ t('fish.skeletalCount') }}</span>
              <input type="range" :min="0" :max="skeletalCountMax" step="1" :value="skeletalCount"
                :disabled="!fishReady || !skeletalAnim"
                @input="emit('fishControl', 'skeletalCount', $event)" />
              <output>{{ skeletalCount }}</output>
            </label>
            <p class="help-text" style="margin:-2px 0 10px;">{{ t('fish.skeletalAnimHelp').replace('{cap}', String(skeletalCountMax)) }}</p>

            <label class="field-row with-toggle" style="margin-bottom:8px;">
              <span>{{ t('fish.whale') }}</span>
              <button type="button" class="pill" :class="{ active: whaleEnabled }" :disabled="!fishReady"
                @click="emit('toggleWhale')">{{ whaleEnabled ? 'ON' : 'OFF' }}</button>
              <output style="font-size:10px;opacity:.7;">巡游</output>
            </label>
            <p class="help-text" style="margin:-4px 0 10px;">{{ t('fish.whaleHelp') }}</p>

            <div class="group-label">沙丁鱼</div>
            <label class="field-row">
              <span>{{ t('fish.sardineCount') }}</span>
              <input type="range" min="0" max="1000" step="1" :value="fishDisplay.sardineCount" :disabled="!fishReady"
                @input="emit('fishControl', 'sardineCount', $event)" />
              <output>{{ fishDisplay.sardineCount }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.perception') }}</span>
              <input type="range" min="1.2" max="5.2" step="0.1" :value="fishDisplay.perception"
                @input="emit('fishControl', 'perception', $event)" />
              <output>{{ fishDisplay.perception }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.sardineSpeed') }}</span>
              <input type="range" min="0.2" max="2.0" step="0.05" :value="fishDisplay.sardineSpeed"
                @input="emit('fishControl', 'sardineSpeed', $event)" />
              <output>{{ fishDisplay.sardineSpeed }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.separation') }}</span>
              <input type="range" min="0.4" max="3.0" step="0.1" :value="fishDisplay.separation"
                @input="emit('fishControl', 'separation', $event)" />
              <output>{{ fishDisplay.separation }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.avoidance') }}</span>
              <input type="range" min="0" max="20" step="0.5" :value="fishDisplay.avoidance"
                @input="emit('fishControl', 'avoidance', $event)" />
              <output>{{ fishDisplay.avoidance }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.turnRate') }}</span>
              <input type="range" min="0.5" max="8" step="0.1" :value="fishDisplay.turnRate"
                @input="emit('fishControl', 'turnRate', $event)" />
              <output>{{ fishDisplay.turnRate }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.topMargin') }}</span>
              <input type="range" min="0" max="2" step="0.05" :value="fishDisplay.topMargin"
                @input="emit('fishControl', 'topMargin', $event)" />
              <output>{{ fishDisplay.topMargin }}</output>
            </label>
          </details>

          <!-- Koi -->
          <details class="panel-card">
            <summary>{{ t('fish.koiGroup') }}</summary>
            <label class="field-row">
              <span>{{ t('fish.koiCount') }}</span>
              <input type="range" min="0" max="1000" step="1" :value="fishDisplay.koiCount" :disabled="!fishReady"
                @input="emit('fishControl', 'koiCount', $event)" />
              <output>{{ fishDisplay.koiCount }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.koiPerception') }}</span>
              <input type="range" min="1.2" max="5.2" step="0.1" :value="fishDisplay.koiPerception"
                @input="emit('fishControl', 'koiPerception', $event)" />
              <output>{{ fishDisplay.koiPerception }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.koiSpeed') }}</span>
              <input type="range" min="0.2" max="2.0" step="0.05" :value="fishDisplay.koiSpeed"
                @input="emit('fishControl', 'koiSpeed', $event)" />
              <output>{{ fishDisplay.koiSpeed }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.koiSeparation') }}</span>
              <input type="range" min="0.4" max="3.0" step="0.1" :value="fishDisplay.koiSeparation"
                @input="emit('fishControl', 'koiSeparation', $event)" />
              <output>{{ fishDisplay.koiSeparation }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.koiAvoidance') }}</span>
              <input type="range" min="0" max="20" step="0.5" :value="fishDisplay.koiAvoidance"
                @input="emit('fishControl', 'koiAvoidance', $event)" />
              <output>{{ fishDisplay.koiAvoidance }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.koiTurnRate') }}</span>
              <input type="range" min="0.5" max="8" step="0.1" :value="fishDisplay.koiTurnRate"
                @input="emit('fishControl', 'koiTurnRate', $event)" />
              <output>{{ fishDisplay.koiTurnRate }}</output>
            </label>
            <label class="field-row">
              <span>{{ t('fish.koiTopMargin') }}</span>
              <input type="range" min="0" max="2" step="0.05" :value="fishDisplay.koiTopMargin"
                @input="emit('fishControl', 'koiTopMargin', $event)" />
              <output>{{ fishDisplay.koiTopMargin }}</output>
            </label>
          </details>

          <!-- Performance -->
          <details class="panel-card" open>
            <summary>性能 · 动画</summary>
            <div class="monitor-grid">
              <div class="monitor-item">
                <span class="label">FPS</span>
                <span class="value">{{ fps }}</span>
              </div>
              <div class="monitor-item">
                <span class="label">画质</span>
                <span class="value" style="font-size:11px;">{{ qualityLabel || '—' }}</span>
              </div>
              <div class="monitor-item">
                <span class="label">模式</span>
                <span class="value" style="font-size:10px;">{{ qualityBadge || '—' }}</span>
              </div>
            </div>
            <div class="quality-line">
              <span class="quality-badge" :class="{ uhd: qualityBadge === 'ULTRA HD' || qualityBadge === '超高清' }">{{ qualityBadge || '—' }}</span>
              <span style="opacity:0.55;">{{ qualityLabel }}</span>
            </div>
            <label class="field-row with-toggle" style="margin-top:8px;">
              <span>速度</span>
              <input type="range" min="0" max="3" step="0.1" :value="simSpeed"
                @input="emit('updateSpeed', parseFloat($event.target.value))" />
              <button type="button" class="pill" :class="{ active: playingLocal }" @click="onTogglePlay">{{ playingLocal ? '▶' : '❚❚' }}</button>
              <output>{{ Number(simSpeed).toFixed(1) }}x</output>
            </label>
            <div class="actions-row">
              <button type="button" :class="{ active: ultraHd }" @click="emit('toggleUltraHd')">超高清</button>
              <button type="button" @click="emit('resetCamera')">重置相机</button>
              <button type="button" :class="{ active: fishCamActive }" @click="emit('toggleFishCam')">鱼眼相机</button>
            </div>
          </details>

          <!-- Panel alpha -->
          <details class="panel-card" open>
            <summary>面板</summary>
            <label class="field-row with-toggle">
              <span>时间标记</span>
              <span style="font-size:9px;opacity:.45;">右侧时刻</span>
              <button type="button" class="pill" :class="{ active: showTimeMark }" @click="emit('toggleTimeMark')">{{ showTimeMark ? 'ON' : 'OFF' }}</button>
              <output>{{ showTimeMark ? '显示' : '隐藏' }}</output>
            </label>
            <label class="field-row">
              <span>透明度</span>
              <input type="range" min="0.05" max="0.95" step="0.05" :value="alpha"
                @input="setAlpha(parseFloat($event.target.value))" aria-label="控制面板透明度" />
              <output>{{ Math.round(alpha * 100) }}%</output>
            </label>
            <p class="help-text" style="margin:8px 0 0;">调低透明度可看清海面全景</p>
          </details>

          <!-- Help -->
          <details class="panel-card">
            <summary>说明</summary>
            <div class="help-block">
              <div class="help-head">操作</div>
              <div class="help-text">
                · 拖拽旋转 · 滚轮缩放 · Ctrl+拖拽平移<br>
                · 点底部圆环打开控制台，可拖动圆环移动<br>
                · 空格 — 鱼眼相机 · M — 流星（晴朗夜晚）<br>
                · 壁纸模式进入全屏（时间标记仍按开关显示）· 双击退出全屏<br>
                · 演示模式：时间快进 · 天气链式更替（雨→暴雨→晴 / 雪→晴）· 夜间偏晴流星<br>
                · Esc / Q — 退出壁纸模式
              </div>
            </div>
            <div class="help-block">
              <div class="help-head">移动端</div>
              <div class="help-text">单指旋转 · 双指平移/捏合缩放</div>
            </div>
            <div class="help-block">
              <div class="help-head">提示</div>
              <div class="help-text">{{ t('panel.hint') }} · {{ t('fish.cameraToggle') }}</div>
            </div>
          </details>
        </div>
      </div>
    </section>
  </div>
</template>
