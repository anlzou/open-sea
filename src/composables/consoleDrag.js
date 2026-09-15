const STORAGE_KEY = 'open-sea-console-v1'

function boundTo(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/** Draggable dock: ring toggles open; drag ring/title to move; ⟲ resets. */
export function consoleDrag(node) {
  let left = 0
  let top = 0
  let startX = 0
  let startY = 0
  let startLeft = 0
  let startTop = 0
  let detached = false
  let fromHandle = false
  let moved = false
  let swallowClick = false
  let pressedId = null
  let threshold = 4

  const bound = () => {
    const rect = node.getBoundingClientRect()
    left = boundTo(left, 8, Math.max(8, innerWidth - rect.width - 8))
    top = boundTo(top, 8, Math.max(8, innerHeight - rect.height - 8))
  }

  const apply = () => {
    bound()
    node.style.left = `${left}px`
    node.style.top = `${top}px`
    node.style.bottom = 'auto'
    node.style.transform = 'none'
    detached = true
    node.classList.add('moved')
  }

  const detach = () => {
    if (detached) return
    const rect = node.getBoundingClientRect()
    left = rect.left
    top = rect.top
    apply()
  }

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, top }))
    } catch { /* ignore */ }
  }

  const reset = () => {
    detached = false
    swallowClick = false
    node.style.left = ''
    node.style.top = ''
    node.style.bottom = ''
    node.style.transform = ''
    node.classList.remove('moved')
    node.classList.remove('open')
    node.querySelector('#dock-toggle')?.setAttribute('aria-expanded', 'false')
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }

  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const target = event.target
    if (target.closest('input,select,textarea,a,label,summary')) return
    const touch = event.pointerType === 'touch'
    fromHandle = !!target.closest('[data-drag-handle]')
    if (touch && !fromHandle) return
    if (!fromHandle && target.closest('button') && !target.closest('[data-drag-handle]')) return
    threshold = touch ? 9 : 4
    detach()
    startX = event.clientX
    startY = event.clientY
    startLeft = left
    startTop = top
    moved = false
    pressedId = event.pointerId
  })

  node.addEventListener('pointermove', (event) => {
    if (pressedId !== event.pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (!moved) {
      if (Math.hypot(dx, dy) < threshold) return
      moved = true
      node.setPointerCapture(event.pointerId)
      node.classList.add('dragging')
    }
    left = startLeft + dx
    top = startTop + dy
    apply()
  })

  const finish = (event) => {
    if (pressedId !== event.pointerId) return
    pressedId = null
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
    node.classList.remove('dragging')
    if (!moved) return
    save()
    if (fromHandle) {
      swallowClick = true
      setTimeout(() => { swallowClick = false }, 300)
    }
    moved = false
  }

  node.addEventListener('click', (event) => {
    if (!swallowClick) return
    swallowClick = false
    event.stopPropagation()
    event.preventDefault()
  }, true)

  node.addEventListener('pointerup', finish)
  node.addEventListener('pointercancel', finish)
  node.querySelector('#console-reset')?.addEventListener('click', reset)
  addEventListener('resize', () => { if (detached) apply() })

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Number.isFinite(raw?.left) && Number.isFinite(raw?.top)) {
      left = raw.left
      top = raw.top
      requestAnimationFrame(apply)
    }
  } catch { /* ignore */ }

  return { reposition: () => { if (detached) apply() }, reset }
}
