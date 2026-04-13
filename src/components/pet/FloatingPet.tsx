import { useEffect, useRef, useState, useCallback } from 'react'
import PetActionPanel from './PetActionPanel'
import type { PetStats } from './PetActionPanel'
import { checkScripts, markTriggered, getPetWord, getLevel } from './petScripts'
import type { Script, ScriptContext } from './petScripts'

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
  const [toastKey, setToastKey] = useState(0)
  const [activeScript, setActiveScript] = useState<Script | null>(null)

  const animRef = useRef(anim)
  const sessionStart = useRef(Date.now())
  const toastTimer = useRef<any>(0)

  // 气泡显示时长 = 动画时间 + 阅读时间
  const showToast = useCallback((text: string, minMs = 3000) => {
    clearTimeout(toastTimer.current)
    setToast(text)
    setToastKey(k => k + 1)
    const animMs = text.length * 70 + 500  // 逐字弹跳总时长
    const stayMs = Math.max(minMs, animMs + 2500)  // 弹完后再留 2.5 秒
    toastTimer.current = setTimeout(() => setToast(null), stayMs)
  }, [])
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
          showToast(`+${s.checkin_earned} token!`)
          setAnim('happy')
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
    // 如果有活跃剧本且有抚摸覆盖台词
    if (activeScript?.petOverride) {
      showToast(activeScript.petOverride)
      const s = await doPet()
      if (s) setStats(s)
      return
    }
    setAnim('happy')
    const level = stats ? getLevel(stats.affinity) : 0
    showToast(getPetWord(level))
    setTimeout(() => { if (animRef.current === 'happy') setAnim('idle') }, 2500)
    const s = await doPet()
    if (s) setStats(s)
  }, [activeScript, stats])

  /* ── 投喂 ─────────────────────────────────────────── */
  const handleFeed = useCallback(async (quality: 'normal' | 'high') => {
    if (activeScript?.feedOverride) {
      showToast(activeScript.feedOverride)
      const s = await doFeed(quality)
      if (s) setStats(s)
      return
    }
    setAnim('happy')
    setTimeout(() => { if (animRef.current === 'happy') setAnim('idle') }, 2500)
    const s = await doFeed(quality)
    if (s) setStats(s)
  }, [activeScript])

  /* ── 剧本触发（每分钟检查） ───────────────────────── */
  useEffect(() => {
    const check = () => {
      if (!readyRef.current || panelOpen || drag.current.dragging) return
      if (toast) return  // 有气泡在显示就跳过
      const now = new Date()
      const ctx: ScriptContext = {
        hour: now.getHours(),
        level: stats ? getLevel(stats.affinity) : 0,
        sessionMinutes: Math.floor((Date.now() - sessionStart.current) / 60_000),
        dayOfWeek: now.getDay(),
      }
      const script = checkScripts(ctx)
      if (script) {
        markTriggered(script.id)
        setActiveScript(script)
        const line = script.lines[Math.floor(Math.random() * script.lines.length)]
        showToast(line)
        if (script.anim) setAnim(script.anim as PetAnim)
        // 动画恢复比气泡早一点
        const animMs = line.length * 70 + 3000
        setTimeout(() => {
          setActiveScript(null)
          if (script.anim && animRef.current === script.anim) setAnim('idle')
        }, animMs)
      }
    }
    // 首次延迟 30 秒再检查（让入场动画先走完）
    const delay = setTimeout(() => {
      check()
      const t = setInterval(check, 60_000)
      return () => clearInterval(t)
    }, 30_000)
    return () => clearTimeout(delay)
  }, [panelOpen, toast, stats])

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

        {/* 像素风对话气泡 */}
        {toast && (
          <div key={toastKey} style={{
            position: 'absolute',
            bottom: PET_SIZE - 10,
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            animation: 'petBubblePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <div style={{
              background: '#FDF6EC',
              border: '2px solid #5C4033',
              borderRadius: 3,
              boxShadow: '2px 2px 0 #5C4033',
              padding: '6px 12px',
              maxWidth: 220,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}>
              <span style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                lineHeight: 1.6,
                color: '#3D2B1F',
                letterSpacing: 1,
              }}>
                {toast.split('').map((char, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      animation: `petCharBounce 0.5s ease ${i * 0.07}s both`,
                      whiteSpace: char === ' ' ? 'pre' : undefined,
                    }}
                  >
                    {char}
                  </span>
                ))}
              </span>
            </div>
            {/* 小尾巴 */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: 8, height: 6,
                borderLeft: '2px solid #5C4033',
                borderBottom: '2px solid #5C4033',
                background: '#FDF6EC',
                transform: 'skewX(-20deg)',
                marginTop: -1,
              }} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes petBubblePop {
          from { opacity: 0; transform: translateX(-50%) scale(0.6); }
          to { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes petCharBounce {
          0% { opacity: 0; transform: translateY(8px); }
          50% { opacity: 1; transform: translateY(-3px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
