import { useEffect, useRef, useState, useCallback } from 'react'
import PetActionPanel from './PetActionPanel'
import type { PetStats } from './PetActionPanel'

/* ── GIF 映射 ─────────────────────────────────────────── */
type PetAnim = 'idle' | 'walk' | 'happy' | 'alert' | 'peek' | 'enter' | 'sleep'

const GIF: Record<PetAnim, string> = {
  idle:  '/chat/sprites/clawd-idle.gif',
  walk:  '/chat/sprites/clawd-sweeping.gif',
  happy: '/chat/sprites/clawd-happy.gif',
  alert: '/chat/sprites/clawd-notification.gif',
  peek:  '/chat/sprites/clawd-thinking.gif',
  enter: '/chat/sprites/clawd-happy.gif',
  sleep: '/chat/sprites/clawd-sleeping.gif',
}

const PET_SIZE = 160
const MARGIN = -40
const WALK_STEP = 28
const WALK_INTERVAL = 3500
const IDLE_CHANCE = 0.45
const DRAG_THRESHOLD = 12  // 移动超过这个距离才算拖拽

/* ── 安全边界 ─────────────────────────────────────────── */
function safeX(v: number) { return Math.max(MARGIN, Math.min(window.innerWidth - PET_SIZE - MARGIN, v)) }
function safeY(v: number) { return Math.max(MARGIN, Math.min(window.innerHeight - PET_SIZE - MARGIN, v)) }

/* ── 持久化位置 ─────────────────────────────────────────── */
const POS_KEY = 'claude-pet-pos'
function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (typeof p.x === 'number' && typeof p.y === 'number') {
        return { x: safeX(p.x), y: safeY(p.y) }
      }
    }
  } catch { /* ignore */ }
  return null
}
function savePos(x: number, y: number) {
  localStorage.setItem(POS_KEY, JSON.stringify({ x, y }))
}

/* ── API ─────────────────────────────────────────────── */
const API_BASE = '/api'
function getToken() { return localStorage.getItem('token') }
function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

async function fetchStats(): Promise<PetStats | null> {
  try {
    const res = await fetch(`${API_BASE}/pet/stats`, { headers: authHeaders() })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function doPet(): Promise<PetStats | null> {
  try {
    const res = await fetch(`${API_BASE}/pet/pet`, { method: 'POST', headers: authHeaders() })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function doFeed(quality: 'normal' | 'high'): Promise<PetStats | null> {
  try {
    const res = await fetch(`${API_BASE}/pet/feed`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ quality }),
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export default function FloatingPet() {
  const saved = loadPos()
  const [x, setX] = useState(saved?.x ?? safeX(window.innerWidth - PET_SIZE - 60))
  const [y, setY] = useState(saved?.y ?? safeY(window.innerHeight - PET_SIZE - 120))
  const [anim, setAnim] = useState<PetAnim>('enter')
  const [flipped, setFlipped] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [stats, setStats] = useState<PetStats | null>(null)

  const animRef = useRef(anim)
  animRef.current = anim
  const readyRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 拖拽状态全部用 ref，避免闭包问题
  const drag = useRef({
    active: false,
    isDrag: false,  // 是否已判定为拖拽
    startX: 0, startY: 0,
    petStartX: 0, petStartY: 0,
  })

  /* ── 加载数值 ─────────────────────────────────────────── */
  useEffect(() => {
    fetchStats().then(s => { if (s) setStats(s) })
  }, [])

  /* ── 入场动画 ─────────────────────────────────────────── */
  useEffect(() => {
    const t = setTimeout(() => {
      setAnim('idle')
      readyRef.current = true
    }, 1500)
    return () => clearTimeout(t)
  }, [])

  /* ── 随机走动 ─────────────────────────────────────────── */
  useEffect(() => {
    const timer = setInterval(() => {
      if (!readyRef.current || drag.current.active || panelOpen) return
      if (animRef.current !== 'idle') return
      if (Math.random() > IDLE_CHANCE) return

      const goRight = Math.random() > 0.5
      setFlipped(goRight)
      setAnim('walk')
      setX(prev => safeX(goRight ? prev + WALK_STEP : prev - WALK_STEP))
      setTimeout(() => { if (animRef.current === 'walk') setAnim('idle') }, 2000)
    }, WALK_INTERVAL)
    return () => clearInterval(timer)
  }, [panelOpen])

  /* ── 随机表情 ──────────────────────────────────────── */
  useEffect(() => {
    const timer = setInterval(() => {
      if (!readyRef.current || drag.current.active || panelOpen) return
      if (animRef.current !== 'idle') return
      const roll = Math.random()
      if (roll < 0.15) {
        setAnim('peek')
        setTimeout(() => { if (animRef.current === 'peek') setAnim('idle') }, 3000)
      } else if (roll < 0.28) {
        setAnim('happy')
        setTimeout(() => { if (animRef.current === 'happy') setAnim('idle') }, 2500)
      } else if (roll < 0.35) {
        setAnim('alert')
        setTimeout(() => { if (animRef.current === 'alert') setAnim('idle') }, 2500)
      }
    }, 6000)
    return () => clearInterval(timer)
  }, [panelOpen])

  /* ── 触摸/鼠标交互（用原生事件，更可靠） ────────────── */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function getXY(e: TouchEvent | MouseEvent): [number, number] {
      if ('touches' in e && e.touches.length > 0) return [e.touches[0].clientX, e.touches[0].clientY]
      if ('changedTouches' in e && e.changedTouches.length > 0) return [e.changedTouches[0].clientX, e.changedTouches[0].clientY]
      return [(e as MouseEvent).clientX, (e as MouseEvent).clientY]
    }

    function onStart(e: TouchEvent | MouseEvent) {
      // 面板打开时不处理拖拽
      if (panelOpen) return
      const [cx, cy] = getXY(e)
      const rect = el!.getBoundingClientRect()
      drag.current = {
        active: true,
        isDrag: false,
        startX: cx,
        startY: cy,
        petStartX: rect.left,
        petStartY: rect.top,
      }
      // 阻止默认行为防止页面滚动，但不用 preventDefault on touchstart（passive）
      if (e.type === 'mousedown') e.preventDefault()
    }

    function onMove(e: TouchEvent | MouseEvent) {
      if (!drag.current.active) return
      const [cx, cy] = getXY(e)
      const dx = cx - drag.current.startX
      const dy = cy - drag.current.startY

      if (!drag.current.isDrag) {
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          drag.current.isDrag = true
        } else {
          return  // 还没超过阈值，不移动
        }
      }

      // 拖拽中
      e.preventDefault()  // 阻止页面滚动
      const nx = safeX(drag.current.petStartX + dx)
      const ny = safeY(drag.current.petStartY + dy)
      setX(nx)
      setY(ny)
    }

    function onEnd(_e: TouchEvent | MouseEvent) {
      if (!drag.current.active) return
      const wasDrag = drag.current.isDrag
      drag.current.active = false
      drag.current.isDrag = false

      if (!wasDrag) {
        // 没拖动 → 点击！打开面板
        setPanelOpen(true)
        fetchStats().then(s => { if (s) setStats(s) })
      } else {
        // 拖拽结束，保存位置
        // x, y 已经在 onMove 中更新了，这里触发 savePos
      }
    }

    // Touch 事件
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    // Mouse 事件（桌面端）
    el.addEventListener('mousedown', onStart)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('mousedown', onStart)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
    }
  }, [panelOpen])

  /* ── 保存位置 ─────────────────────────────────────────── */
  useEffect(() => {
    if (!drag.current.active) savePos(x, y)
  }, [x, y])

  /* ── 抚摸 ─────────────────────────────────────────── */
  const handlePet = useCallback(async () => {
    setAnim('happy')
    setTimeout(() => { if (animRef.current === 'happy') setAnim('idle') }, 2500)
    const s = await doPet()
    if (s) setStats(s)
  }, [])

  /* ── 投喂 ─────────────────────────────────────────── */
  const handleFeed = useCallback(async (quality: 'normal' | 'high') => {
    setAnim('happy')
    setTimeout(() => { if (animRef.current === 'happy') setAnim('idle') }, 2500)
    const s = await doFeed(quality)
    if (s) setStats(s)
  }, [])

  /* ── 深夜睡觉 ─────────────────────────────────────── */
  useEffect(() => {
    const check = () => {
      const h = new Date().getHours()
      if (h >= 23 || h < 6) {
        setAnim('sleep')
        readyRef.current = false
      }
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [])

  /* ── 面板位置（在角色上方弹出） ─────────────────────── */
  const panelLeft = Math.min(
    Math.max(8, x + PET_SIZE / 2 - 110),
    window.innerWidth - 236
  )
  const panelBottom = window.innerHeight - y + 8

  return (
    <>
      {/* 点击其他区域关闭面板 */}
      {panelOpen && (
        <div
          onClick={() => setPanelOpen(false)}
          onTouchEnd={() => setPanelOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        />
      )}

      {/* 操作面板 */}
      {panelOpen && stats && (
        <div style={{
          position: 'fixed',
          left: panelLeft,
          bottom: panelBottom,
          zIndex: 10000,
        }}>
          <PetActionPanel
            stats={stats}
            onPet={handlePet}
            onFeed={handleFeed}
            onClose={() => setPanelOpen(false)}
          />
        </div>
      )}

      {/* 角色 */}
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          left: x,
          top: y,
          width: PET_SIZE,
          height: PET_SIZE,
          zIndex: 9999,
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transition: drag.current.isDrag ? 'none' : 'left 0.6s ease, top 0.3s ease',
        }}
      >
        <img
          key={anim}
          src={GIF[anim]}
          alt="Claude"
          draggable={false}
          style={{
            width: PET_SIZE,
            height: PET_SIZE,
            imageRendering: 'pixelated',
            objectFit: 'contain',
            transform: flipped ? 'scaleX(-1)' : 'none',
            filter: anim === 'sleep' ? 'brightness(0.7)' : 'none',
            pointerEvents: 'none',
          }}
        />
      </div>
    </>
  )
}
