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
const LONG_PRESS_MS = 300  // 长按进入拖拽模式

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
const API_BASE = ''
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
  const [toast, setToast] = useState<string | null>(null)

  const animRef = useRef(anim)
  animRef.current = anim
  const readyRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 交互状态用 ref
  const drag = useRef({
    touching: false,
    dragging: false,
    suppressClick: false,  // 拖拽后阻止 click 打开面板
    startX: 0, startY: 0,
    petStartX: 0, petStartY: 0,
    longPressTimer: 0 as any,
  })

  /* ── 加载数值 + 签到 ──────────────────────────────────── */
  useEffect(() => {
    fetchStats().then(s => {
      if (!s) return
      setStats(s)
      if (s.checkin_earned && s.checkin_earned > 0) {
        setTimeout(() => {
          setToast(`+ ${s.checkin_earned} token!`)
          setAnim('happy')
          setTimeout(() => setToast(null), 3000)
          setTimeout(() => { if (animRef.current === 'happy') setAnim('idle') }, 2500)
        }, 2000)
      }
    })
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
      if (!readyRef.current || drag.current.dragging || panelOpen) return
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
      if (!readyRef.current || drag.current.dragging || panelOpen) return
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

  /* ── 交互：短按=点击，长按=拖拽 ─────────────────────── */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const d = drag.current

    function getXY(e: TouchEvent | MouseEvent): [number, number] {
      if ('touches' in e && e.touches.length > 0) return [e.touches[0].clientX, e.touches[0].clientY]
      if ('changedTouches' in e && e.changedTouches.length > 0) return [e.changedTouches[0].clientX, e.changedTouches[0].clientY]
      return [(e as MouseEvent).clientX, (e as MouseEvent).clientY]
    }

    function enterDragMode() {
      d.dragging = true
      // 触觉反馈（支持的设备）
      if (navigator.vibrate) navigator.vibrate(30)
    }

    function onStart(e: TouchEvent | MouseEvent) {
      if (panelOpen) return
      const [cx, cy] = getXY(e)
      const rect = el!.getBoundingClientRect()
      d.touching = true
      d.dragging = false
      d.startX = cx
      d.startY = cy
      d.petStartX = rect.left
      d.petStartY = rect.top
      // 长按计时器
      clearTimeout(d.longPressTimer)
      d.longPressTimer = setTimeout(enterDragMode, LONG_PRESS_MS)
      if (e.type === 'mousedown') e.preventDefault()
    }

    function onMove(e: TouchEvent | MouseEvent) {
      if (!d.touching) return
      const [cx, cy] = getXY(e)

      // 手指移动了就取消长按计时（防止滑动误触发拖拽）
      if (!d.dragging) {
        const dx = Math.abs(cx - d.startX)
        const dy = Math.abs(cy - d.startY)
        if (dx > 8 || dy > 8) {
          // 手指在滑动页面，取消一切
          clearTimeout(d.longPressTimer)
          d.touching = false
          return
        }
        return  // 还没进入拖拽模式，不移动宠物
      }

      // 拖拽模式中
      e.preventDefault()
      const nx = safeX(d.petStartX + (cx - d.startX))
      const ny = safeY(d.petStartY + (cy - d.startY))
      setX(nx)
      setY(ny)
    }

    function onEnd(_e: TouchEvent | MouseEvent) {
      if (!d.touching) return
      clearTimeout(d.longPressTimer)
      if (d.dragging) {
        d.suppressClick = true  // 拖拽结束，阻止随后的 click
      }
      d.touching = false
      d.dragging = false
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('mousedown', onStart)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)

    return () => {
      clearTimeout(d.longPressTimer)
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
    if (!drag.current.dragging) savePos(x, y)
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

  /* ── 面板位置（上方优先，空间不够就到下方） ──────────── */
  const PANEL_H = 260  // 面板大致高度
  const showAbove = y > PANEL_H + 16  // 上方空间够不够
  const panelLeft = Math.min(
    Math.max(8, x + PET_SIZE / 2 - 110),
    window.innerWidth - 236
  )

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
          ...(showAbove
            ? { bottom: window.innerHeight - y + 8 }
            : { top: y + PET_SIZE + 8 }),
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
        onClick={() => {
          if (drag.current.suppressClick) {
            drag.current.suppressClick = false
            return
          }
          if (panelOpen) return
          setPanelOpen(true)
          fetchStats().then(s => {
            if (s) setStats(s)
            else setPanelOpen(false)  // API 失败时不要卡住
          })
        }}
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
          transition: drag.current.dragging ? 'none' : 'left 0.6s ease, top 0.3s ease',
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

        {/* 像素风气泡 */}
        {toast && (
          <div style={{
            position: 'absolute',
            top: -32,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#3D2B1F',
            background: '#FDF6EC',
            border: '2px solid #5C4033',
            boxShadow: '2px 2px 0px #5C4033',
            padding: '3px 10px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            animation: 'petToastIn 0.3s ease',
          }}>
            {toast}
          </div>
        )}
      </div>

      <style>{`
        @keyframes petToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  )
}
