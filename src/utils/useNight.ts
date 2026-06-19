import { useSyncExternalStore } from 'react'

// 订阅 body.night-mode class 的变化，让面板能响应夜间切换
function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb)
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  return () => obs.disconnect()
}

function snapshot() {
  return document.body.classList.contains('night-mode')
}

export function useNight(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
