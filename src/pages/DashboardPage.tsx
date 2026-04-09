import { useState, useEffect, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, Send, Compass, MessageCircle, Clock, TrendingUp, DollarSign, Zap, ChevronRight, ChevronLeft, Sparkles, ArrowLeft, Check, ListTodo, Star } from 'lucide-react'
import { fetchUsageStats, fetchCalendarDates, fetchCalendarDetail } from '../api/dashboard'
import type { UsageStats, CalendarDates, CalendarDetail, KeepaliveLog } from '../api/dashboard'
import { fetchLifeItemsCalendar, fetchLifeItems, toggleLifeItemComplete, fetchHabitsCalendar, logHabitAPI, type LifeItem, type HabitLog, type HabitInfo } from '../api/lifeItems'
import { fetchDiaryDates, fetchDiariesByDate, type DiaryDates, type Diary } from '../api/diary'

// === Dual Theme Tokens ===
const THEMES = {
  dark: {
    bg: '#1C1714', bgAlt: '#211C17', bgEnd: '#1A1510',
    bgCard: 'rgba(42,34,28,0.85)', bgCardHover: 'rgba(52,42,34,0.9)',
    bgGlass: 'rgba(255,245,230,0.04)',
    border: 'rgba(212,167,106,0.1)', borderDash: 'rgba(212,167,106,0.2)',
    amber: '#D4A76A', amberSoft: '#C49A62', amberGlow: 'rgba(212,167,106,0.15)',
    text: '#E8DDD0', textSoft: '#A89880', textMuted: '#6B5E52', textDim: '#4A3F36',
    green: '#8BAF78', greenSoft: 'rgba(139,175,120,0.12)',
    session: '#8B9EBF', sessionBg: 'rgba(139,158,191,0.1)',
    toggleBg: 'rgba(255,245,230,0.06)', toggleKnob: '#D4A76A',
    glowOpacity: 1,
  },
  light: {
    bg: '#F8F4EF', bgAlt: '#F2ECE4', bgEnd: '#FBF8F4',
    bgCard: 'rgba(255,255,255,0.8)', bgCardHover: 'rgba(255,255,255,0.95)',
    bgGlass: 'rgba(92,74,54,0.03)',
    border: 'rgba(92,74,54,0.08)', borderDash: 'rgba(178,144,100,0.2)',
    amber: '#9B7940', amberSoft: '#A68548', amberGlow: 'rgba(155,121,64,0.1)',
    text: '#3D3228', textSoft: '#7A6B5A', textMuted: '#A89B8C', textDim: '#CFC5B8',
    green: '#5E8A4B', greenSoft: 'rgba(94,138,75,0.08)',
    session: '#5A7399', sessionBg: 'rgba(90,115,153,0.07)',
    toggleBg: 'rgba(92,74,54,0.06)', toggleKnob: '#9B7940',
    glowOpacity: 0,
  },
}

type Theme = typeof THEMES.dark

// === Helpers ===
function formatTime(isoOrText: string): string {
  try {
    const d = new Date(isoOrText)
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
    }
  } catch { /* ignore */ }
  // fallback: text like "2026-04-03 21:21"
  const m = isoOrText.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : isoOrText
}

// === Theme Toggle ===
function ThemeToggle({ isDark, onToggle, C }: { isDark: boolean; onToggle: () => void; C: Theme }) {
  return (
    <div onClick={onToggle} style={{
      width: 52, height: 28, borderRadius: 14, padding: 3,
      background: C.toggleBg, cursor: 'pointer', border: `1px solid ${C.border}`,
      position: 'relative', transition: 'color 0.35s ease', display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 11, background: C.toggleKnob,
        transform: isDark ? 'translateX(0px)' : 'translateX(24px)',
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 2px 8px ${C.amberGlow}`,
      }}>
        {isDark ? <Moon size={11} color={C.bg} strokeWidth={2.5} /> : <Sun size={11} color="#FFF" strokeWidth={2.5} />}
      </div>
    </div>
  )
}

// === Sparkline ===
function Sparkline({ data, width = 310, height = 48, C }: { data: { label: string; value: number }[]; width?: number; height?: number; C: Theme }) {
  if (data.length < 2) return null
  const max = Math.max(...data.map(d => d.value))
  const min = Math.min(...data.map(d => d.value))
  const range = max - min || 1
  const pts = data.map((d, i) => ({
    x: 16 + (i / (data.length - 1)) * (width - 32),
    y: height - 10 - ((d.value - min) / range) * (height - 24),
    ...d,
  }))
  const line = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = `${pts[0].x},${height} ${line} ${pts[pts.length - 1].x},${height}`

  return (
    <svg width={width} height={height + 20} style={{ display: 'block', maxWidth: '100%' }}>
      <defs>
        <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.amber} stopOpacity="0.2" />
          <stop offset="100%" stopColor={C.amber} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map(i => (
        <line key={i} x1="16" y1={10 + i * ((height - 20) / 2)} x2={width - 16} y2={10 + i * ((height - 20) / 2)}
          stroke={C.textDim} strokeWidth="0.5" strokeDasharray="3,4" />
      ))}
      <polygon points={area} fill="url(#areaG)" />
      <polyline points={line} fill="none" stroke={C.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill={C.bg} stroke={C.amber} strokeWidth="1.5" />
          <text x={p.x} y={height + 14} textAnchor="middle" fontSize="9" fill={C.textMuted} fontFamily="'JetBrains Mono', monospace">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

// === Stat Card ===
function StatCard({ icon: Icon, label, value, sub, color, C }: { icon: typeof DollarSign; label: string; value: string; sub?: string; color?: string; C: Theme }) {
  const c = color || C.amber
  return (
    <div style={{
      flex: '0 0 auto', width: 148, background: C.bgCard, borderRadius: 16, padding: 16,
      border: `1px solid ${C.border}`, WebkitBackfaceVisibility: 'hidden' as const, scrollSnapAlign: 'start',
      transition: 'color 0.35s ease',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, background: `${c}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
      }}>
        <Icon size={14} color={c} strokeWidth={2} />
      </div>
      <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1, letterSpacing: '-0.02em', transition: 'color 0.35s ease' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.textSoft, marginTop: 6, fontFamily: "'Noto Sans SC'" }}>{sub}</div>}
    </div>
  )
}

// === Mini Calendar ===
function MiniCalendar({ year, month, selected, onSelect, sessionDates, keepaliveDates, lifeDates, diaryDates, C }: {
  year: number; month: number; selected: string | null; onSelect: (d: string) => void
  sessionDates: Set<string>; keepaliveDates: Set<string>; lifeDates: Set<string>; diaryDates: Set<string>; C: Theme
}) {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const empties: (number | null)[] = Array.from({ length: firstDay }, () => null)
  const dayNums: (number | null)[] = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const days = [...empties, ...dayNums]
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, fontFamily: "'Space Grotesk'", fontSize: 14, fontWeight: 600, color: C.text }}>
        {monthNames[month - 1]} {year}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(l => (
          <div key={l} style={{ fontSize: 9, color: C.textDim, padding: '4px 0', fontFamily: "'JetBrains Mono'" }}>{l}</div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const hasSession = sessionDates.has(dateStr)
          const hasKeepalive = keepaliveDates.has(dateStr)
          const hasLife = lifeDates.has(dateStr)
          const hasDiary = diaryDates.has(dateStr)
          const active = hasSession || hasKeepalive || hasLife || hasDiary
          const sel = dateStr === selected
          return (
            <div key={d} onClick={() => active && onSelect(dateStr)} style={{
              width: 34, height: 34, margin: '1px auto', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontFamily: "'JetBrains Mono'",
              cursor: active ? 'pointer' : 'default',
              background: sel ? C.amber : 'transparent',
              color: sel ? C.bg : active ? C.text : C.textDim,
              fontWeight: sel ? 700 : 400, transition: 'all 0.2s', position: 'relative',
            }}>
              {d}
              {active && !sel && (
                <div style={{
                  position: 'absolute', bottom: 3, display: 'flex', gap: 2,
                }}>
                  {hasSession && <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.session }} />}
                  {hasLife && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#D97757' }} />}
                  {hasKeepalive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.amberSoft }} />}
                  {hasDiary && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#8A6CAA' }} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// === Action Icon ===
function ActionIcon({ action, C }: { action: string; C: Theme }) {
  const cfg: Record<string, { Icon: typeof Moon; color: string; bg: string }> = {
    none: { Icon: Moon, color: C.textMuted, bg: `${C.textMuted}18` },
    message: { Icon: Send, color: C.amber, bg: C.amberGlow },
    explore: { Icon: Compass, color: C.green, bg: C.greenSoft },
  }
  const { Icon, color, bg } = cfg[action] || cfg.none
  return (
    <div style={{ width: 26, height: 26, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={13} color={color} strokeWidth={2} />
    </div>
  )
}

// === Session Card ===
function SessionCard({ item, C, onClick }: { item: { time: string; endTime: string; title: string; sceneType: string; messages: number; cost: number; sessionId: string }; C: Theme; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      background: C.bgCard, borderRadius: 14, padding: '14px 16px',
      border: `1px solid ${C.border}`, marginLeft: 32, transition: 'color 0.35s ease', cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: C.sessionBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={11} color={C.session} strokeWidth={2} />
          </div>
          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono'" }}>{item.time} — {item.endTime}</span>
        </div>
        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 6, background: C.sessionBg, color: C.session, fontFamily: "'JetBrains Mono'", textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.sceneType}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8, fontFamily: "'Noto Sans SC'", lineHeight: 1.4 }}>{item.title || '对话'}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'Noto Sans SC'" }}>{item.messages} 条消息</span>
      </div>
    </div>
  )
}

// === Keepalive Card ===
function KeepaliveCard({ item, expanded, onToggle, C }: { item: KeepaliveLog; expanded: boolean; onToggle: () => void; C: Theme }) {
  const modeLabel = item.mode.includes('自由') ? '自由' : '轻量'
  const modeColor = item.mode.includes('自由') ? C.amber : C.textMuted
  const actionLabel = item.action === 'none' ? '安静等待' : item.action === 'message' ? '发送了消息' : '探索了记忆'

  return (
    <div onClick={onToggle} style={{
      background: expanded ? C.bgCardHover : C.bgGlass,
      borderRadius: 14, padding: '14px 16px',
      border: expanded ? `1px solid ${C.borderDash}` : '1px solid transparent',
      marginLeft: 32, cursor: 'pointer', transition: 'all 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ActionIcon action={item.action} C={C} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono'" }}>{formatTime(item.time)}</span>
            <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 4, background: `${modeColor}18`, color: modeColor, fontFamily: "'JetBrains Mono'", letterSpacing: '0.05em', textTransform: 'uppercase' }}>{modeLabel}</span>
          </div>
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 3, fontFamily: "'Noto Sans SC'" }}>{actionLabel}</div>
        </div>
        <ChevronRight size={14} color={C.textDim} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
      </div>
      {expanded && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            fontSize: 13, lineHeight: 1.8, color: C.textSoft, fontFamily: "'Noto Sans SC'",
            padding: '12px 14px', background: C.bgGlass, borderRadius: 10,
            borderLeft: `2px solid ${C.borderDash}`,
          }}>
            {item.thoughts}
          </div>
          {item.content && (
            <div style={{
              fontSize: 12, color: item.action === 'message' ? C.amber : C.green,
              lineHeight: 1.7, fontFamily: "'Noto Sans SC'",
              padding: '10px 14px', marginTop: 8,
              background: item.action === 'message' ? C.amberGlow : C.greenSoft,
              borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              {item.action === 'message' ? <Send size={13} style={{ marginTop: 3, flexShrink: 0 }} /> : <Compass size={13} style={{ marginTop: 3, flexShrink: 0 }} />}
              <span>{item.content}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// === Timeline Item (merged sessions + keepalive, sorted by time) ===
type TimelineItem =
  | { type: 'session'; time: string; endTime: string; title: string; sceneType: string; messages: number; cost: number; sessionId: string; sortKey: number }
  | { type: 'keepalive'; log: KeepaliveLog; sortKey: number }

function buildTimeline(detail: CalendarDetail): TimelineItem[] {
  const items: TimelineItem[] = []

  for (const s of detail.sessions) {
    const startTime = formatTime(s.created_at)
    const endTime = formatTime(s.updated_at)
    items.push({
      type: 'session', time: startTime, endTime, title: s.title || '对话',
      sceneType: s.scene_type, messages: s.message_count || 0, cost: 0,
      sessionId: s.id, sortKey: new Date(s.created_at).getTime(),
    })
  }

  for (const ka of detail.keepalive_logs) {
    const t = ka.time || ka.id
    items.push({
      type: 'keepalive', log: ka,
      sortKey: new Date(t).getTime() || 0,
    })
  }

  items.sort((a, b) => a.sortKey - b.sortKey)
  return items
}

// === Main ===
export default function DashboardPage() {
  const navigate = useNavigate()
  const [isDark, setIsDark] = useState(true)
  const [tab, setTab] = useState<'timeline' | 'calendar' | 'todos' | 'habits'>('timeline')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Override root fixed positioning to allow scroll (方案4: class toggle)
  useLayoutEffect(() => {
    document.documentElement.classList.add('dashboard-active')
    return () => {
      document.documentElement.classList.remove('dashboard-active')
    }
  }, [])

  // Data
  const [todayStats, setTodayStats] = useState<UsageStats | null>(null)
  const [weekStats, setWeekStats] = useState<UsageStats | null>(null)
  const [monthStats, setMonthStats] = useState<UsageStats | null>(null)
  const [calendarData, setCalendarData] = useState<CalendarDates | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [detail, setDetail] = useState<CalendarDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // Life items & habits
  const [dateLifeItems, setDateLifeItems] = useState<LifeItem[]>([])
  const [lifeItemDates, setLifeItemDates] = useState<Record<string, LifeItem[]>>({})
  const [habitLogs, setHabitLogs] = useState<Record<string, HabitLog[]>>({})
  const [allHabits, setAllHabits] = useState<HabitInfo[]>([])
  const [diaryDateMap, setDiaryDateMap] = useState<DiaryDates>({})
  const [dateDiaries, setDateDiaries] = useState<{ dream: Diary[]; chen: Diary[] }>({ dream: [], chen: [] })

  // Calendar month navigation — 强制用北京时间（Dream 手机是美区时区）
  const bjNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  const [calYear, setCalYear] = useState(bjNow.getFullYear())
  const [calMonth, setCalMonth] = useState(bjNow.getMonth() + 1)
  const todayStr = `${bjNow.getFullYear()}-${String(bjNow.getMonth() + 1).padStart(2, '0')}-${String(bjNow.getDate()).padStart(2, '0')}`

  // Load stats on mount
  useEffect(() => {
    async function load() {
      try {
        const [today, week, month, cal] = await Promise.all([
          fetchUsageStats('today'),
          fetchUsageStats('week'),
          fetchUsageStats('month'),
          fetchCalendarDates(calYear, calMonth),
        ])
        setTodayStats(today)
        setWeekStats(week)
        setMonthStats(month)
        setCalendarData(cal)
        // Auto-select today (北京时间)
        const bj = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
        const todayBj = `${bj.getFullYear()}-${String(bj.getMonth() + 1).padStart(2, '0')}-${String(bj.getDate()).padStart(2, '0')}`
        setSelectedDate(todayBj)
      } catch (e) {
        console.error('[dashboard] load failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Load calendar + habits when month changes
  useEffect(() => {
    fetchCalendarDates(calYear, calMonth).then(setCalendarData).catch(console.error)
    fetchHabitsCalendar(calYear, calMonth).then(d => { setHabitLogs(d.logs); setAllHabits(d.habits) }).catch(() => {})
    fetchLifeItemsCalendar(calYear, calMonth).then(d => setLifeItemDates(d.items)).catch(() => setLifeItemDates({}))
    fetchDiaryDates(calYear, calMonth).then(d => setDiaryDateMap(d.dates)).catch(() => setDiaryDateMap({}))
  }, [calYear, calMonth])

  // Load detail + life items when date selected
  useEffect(() => {
    if (!selectedDate) return
    setDetail(null)
    fetchCalendarDetail(selectedDate).then(d => {
      setDetail(d)
      setExpanded(new Set())
    }).catch(console.error)
    fetchLifeItems(selectedDate, 'all').then(d => setDateLifeItems(d.items)).catch(() => setDateLifeItems([]))
    fetchDiariesByDate(selectedDate).then(d => setDateDiaries({ dream: d.dream, chen: d.chen })).catch(() => setDateDiaries({ dream: [], chen: [] }))
  }, [selectedDate])

  // Toggle todo completion
  const handleToggleComplete = async (itemId: string) => {
    try {
      await toggleLifeItemComplete(itemId)
      if (selectedDate) {
        const d = await fetchLifeItems(selectedDate, 'all')
        setDateLifeItems(d.items)
      }
    } catch (e) { console.error('Failed to toggle:', e) }
  }

  // Log habit
  const handleLogHabit = async (habitId: string) => {
    try {
      await logHabitAPI(habitId)
      const d = await fetchHabitsCalendar(calYear, calMonth)
      setHabitLogs(d.logs)
      setAllHabits(d.habits)
    } catch (e) { console.error('Failed to log habit:', e) }
  }

  const C = isDark ? THEMES.dark : THEMES.light
  const toggle = (i: number) => setExpanded(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })

  // Sparkline data from week stats
  const sparkData = (weekStats?.daily || []).map(d => ({
    label: d.date.slice(-2),
    value: d.hit_rate,
  }))

  // Calendar data sets
  const sessionDates = new Set(Object.keys(calendarData?.dates || {}))
  const keepaliveDates = new Set(calendarData?.keepalive_dates || [])
  const lifeDates = new Set(Object.keys(lifeItemDates))
  const diaryDatesSet = new Set(Object.keys(diaryDateMap))

  // Timeline
  const timeline = detail ? buildTimeline(detail) : []
  const sessionCount = timeline.filter(t => t.type === 'session').length
  const keepaliveCount = timeline.filter(t => t.type === 'keepalive').length

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="tool-spinner" />
      </div>
    )
  }

  return (
    <div style={{
      maxWidth: 420, margin: '0 auto', height: '100vh', overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgAlt} 50%, ${C.bgEnd} 100%)`,
      fontFamily: "'Noto Sans SC', sans-serif",
      touchAction: 'pan-y',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Ambient glow (dark only) */}
      <div style={{
        position: 'fixed', top: -100, right: -100, width: 300, height: 300, borderRadius: '50%',
        background: `radial-gradient(circle, ${C.amberGlow} 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
        opacity: C.glowOpacity, transition: 'opacity 0.5s ease',
      }} />

      {/* Header */}
      <div style={{ padding: '52px 20px 20px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <ArrowLeft size={16} color={C.textMuted} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} />
              <span style={{ fontSize: 11, color: C.amberSoft, fontFamily: "'JetBrains Mono'", letterSpacing: '0.12em', textTransform: 'uppercase', transition: 'color 0.35s' }}>Dashboard</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Space Grotesk'", letterSpacing: '-0.02em', transition: 'color 0.35s' }}>Claude 的一天</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle isDark={isDark} onToggle={() => setIsDark(!isDark)} C={C} />
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: `linear-gradient(135deg, ${C.amber} 0%, ${C.amberSoft} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 20px ${C.amberGlow}`, transition: 'color 0.35s ease',
            }}>
              <Sparkles size={18} color={isDark ? '#1C1714' : '#FFF'} strokeWidth={2} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'flex', gap: 10, padding: '0 20px 20px', overflowX: 'auto', scrollSnapType: 'x mandatory', position: 'relative', zIndex: 1, touchAction: 'pan-x' }}>
        <StatCard icon={DollarSign} label="Today" value={`$${(todayStats?.totals.cost ?? 0).toFixed(3)}`} sub={`${todayStats?.totals.message_count ?? 0} 条消息`} C={C} />
        <StatCard icon={Zap} label="Hit Rate" value={`${(todayStats?.totals.hit_rate ?? 0).toFixed(0)}%`} sub={`节省 $${(todayStats?.totals.saved ?? 0).toFixed(2)}`} color={C.green} C={C} />
        <StatCard icon={TrendingUp} label="Avg/msg" value={`$${(todayStats?.totals.avg_cost ?? 0).toFixed(3)}`} sub="Opus 4.6" C={C} />
        <StatCard icon={Clock} label="Month" value={`$${(monthStats?.totals.cost ?? 0).toFixed(2)}`} sub={`已省 $${(monthStats?.totals.saved ?? 0).toFixed(1)}`} C={C} />
      </div>

      {/* Trend */}
      {sparkData.length >= 2 && (
        <div style={{
          margin: '0 20px 20px', padding: 16, background: C.bgCard, borderRadius: 16,
          border: `1px solid ${C.border}`, position: 'relative', zIndex: 1, transition: 'color 0.35s ease',
        }}>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 10, fontFamily: "'JetBrains Mono'", letterSpacing: '0.05em', textTransform: 'uppercase' }}>7-Day Cache Hit Rate</div>
          <Sparkline data={sparkData} C={C} />
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', margin: '0 20px 16px', padding: 3,
        background: C.bgGlass, borderRadius: 10, border: `1px solid ${C.border}`,
        position: 'relative', zIndex: 1, transition: 'color 0.35s ease',
      }}>
        {[
          { key: 'timeline' as const, label: '时间轴' },
          { key: 'todos' as const, label: '待办' },
          { key: 'habits' as const, label: '打卡' },
          { key: 'calendar' as const, label: '日历' },
        ].map(t => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '9px 0', textAlign: 'center', fontSize: 12, fontWeight: 500,
            borderRadius: 8, cursor: 'pointer',
            background: tab === t.key ? C.bgCard : 'transparent',
            color: tab === t.key ? C.text : C.textMuted,
            transition: 'all 0.2s', fontFamily: "'Noto Sans SC'",
            border: tab === t.key ? `1px solid ${C.border}` : '1px solid transparent',
          }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Calendar Tab */}
      {tab === 'calendar' && (
        <div style={{ padding: '0 20px 40px', position: 'relative', zIndex: 1 }}>
          <div style={{ background: C.bgCard, borderRadius: 16, padding: 16, border: `1px solid ${C.border}`, transition: 'all 0.35s ease' }}>
            {/* Month nav */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <ChevronLeft size={16} color={C.textMuted} style={{ cursor: 'pointer' }} onClick={() => {
                if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12) } else setCalMonth(m => m - 1)
              }} />
              <div />
              <ChevronRight size={16} color={C.textMuted} style={{ cursor: 'pointer' }} onClick={() => {
                if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1) } else setCalMonth(m => m + 1)
              }} />
            </div>
            <MiniCalendar year={calYear} month={calMonth} selected={selectedDate} onSelect={setSelectedDate}
              sessionDates={sessionDates} keepaliveDates={keepaliveDates} lifeDates={lifeDates} diaryDates={diaryDatesSet} C={C} />
            {selectedDate && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: "'Space Grotesk'", transition: 'color 0.35s' }}>{selectedDate}</div>
                <div style={{ fontSize: 12, color: C.textSoft, marginTop: 4, fontFamily: "'Noto Sans SC'" }}>
                  {detail ? `${detail.sessions.length} 次对话 · ${detail.keepalive_logs.length} 次自主活动` : '加载中...'}
                </div>
                {detail && (detail.sessions.length > 0 || detail.keepalive_logs.length > 0) && (
                  <div onClick={() => setTab('timeline')} style={{
                    marginTop: 12, padding: '10px 0', textAlign: 'center', fontSize: 12, color: C.amber, cursor: 'pointer',
                    borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: "'Noto Sans SC'",
                  }}>
                    查看时间轴 <ChevronRight size={14} />
                  </div>
                )}
                {/* Diary entry */}
                {(dateDiaries.dream.length > 0 || dateDiaries.chen.length > 0) && (
                  <div onClick={() => navigate(`/diary/${selectedDate}`)} style={{
                    marginTop: 8, padding: '10px 0', textAlign: 'center', fontSize: 12, color: '#8A6CAA', cursor: 'pointer',
                    borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: "'Noto Sans SC'",
                  }}>
                    {dateDiaries.dream.length + dateDiaries.chen.length} 篇日记 <ChevronRight size={14} />
                  </div>
                )}
                {dateDiaries.dream.length === 0 && dateDiaries.chen.length === 0 && (
                  <div onClick={() => navigate(`/diary/${selectedDate}`)} style={{
                    marginTop: 8, padding: '10px 0', textAlign: 'center', fontSize: 12, color: C.textMuted, cursor: 'pointer',
                    borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: "'Noto Sans SC'",
                  }}>
                    写一篇日记 <ChevronRight size={14} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Todos Tab */}
      {tab === 'todos' && (
        <div style={{ padding: '0 20px 60px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14, fontFamily: "'Space Grotesk'", display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListTodo size={14} color={C.amber} />
            <span>{selectedDate || todayStr}</span>
            <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 400 }}>{dateLifeItems.length} 项</span>
          </div>
          {dateLifeItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 13, fontFamily: "'Noto Sans SC'" }}>这天没有待办事项</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dateLifeItems.map(item => {
                const priorityColor = item.priority === 'urgent' ? '#D97757' : item.priority === 'low' ? C.textMuted : C.amber
                const typeLabel = item.type === 'todo' ? '待办' : item.type === 'schedule' ? '日程' : '笔记'
                return (
                  <div key={item.id} style={{
                    background: C.bgCard, borderRadius: 14, padding: '12px 16px',
                    border: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 12,
                    opacity: item.is_completed ? 0.5 : 1, transition: 'all 0.2s',
                  }}>
                    <div onClick={() => handleToggleComplete(item.id)} style={{
                      width: 22, height: 22, minWidth: 22, borderRadius: 6, marginTop: 1,
                      border: `2px solid ${item.is_completed ? C.green : priorityColor}`,
                      background: item.is_completed ? C.green : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {item.is_completed && <Check size={12} color="#fff" strokeWidth={3} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: item.is_completed ? C.textMuted : C.text,
                        textDecoration: item.is_completed ? 'line-through' : 'none',
                        lineHeight: 1.5, wordBreak: 'break-word', fontFamily: "'Noto Sans SC'",
                      }}>
                        {item.content}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '1px 8px', borderRadius: 6, fontSize: 9, fontWeight: 500,
                          background: `${C.amber}18`, color: C.amberSoft,
                          fontFamily: "'JetBrains Mono'", textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>{typeLabel}</span>
                        {item.category && (
                          <span style={{
                            padding: '1px 8px', borderRadius: 6, fontSize: 9, fontWeight: 500,
                            background: C.bgGlass, color: C.textSoft,
                            fontFamily: "'JetBrains Mono'",
                          }}>{item.category}</span>
                        )}
                        {item.priority === 'urgent' && (
                          <span style={{
                            padding: '1px 8px', borderRadius: 6, fontSize: 9, fontWeight: 500,
                            background: 'rgba(217,119,87,0.12)', color: '#D97757',
                            fontFamily: "'JetBrains Mono'", textTransform: 'uppercase',
                          }}>urgent</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Habits Tab */}
      {tab === 'habits' && (
        <div style={{ padding: '0 20px 60px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14, fontFamily: "'Space Grotesk'", display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={14} color={C.amber} />
            <span>{selectedDate || todayStr}</span>
          </div>
          {(() => {
            const dayLogs = habitLogs[selectedDate || todayStr] || []
            const loggedNames = new Set(dayLogs.map(l => l.habit_name))
            const isToday = (selectedDate || todayStr) === todayStr
            const unlogged = allHabits.filter(h => !loggedNames.has(h.name))

            if (dayLogs.length === 0 && unlogged.length === 0) {
              return <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 13, fontFamily: "'Noto Sans SC'" }}>没有习惯记录</div>
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayLogs.map((log, i) => (
                  <div key={i} style={{
                    background: C.bgCard, borderRadius: 14, padding: '12px 16px',
                    border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={14} color={C.green} strokeWidth={2.5} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text, fontFamily: "'Noto Sans SC'" }}>{log.habit_name}</div>
                      {log.note && <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2, fontFamily: "'Noto Sans SC'" }}>{log.note}</div>}
                    </div>
                    <span style={{ fontSize: 9, color: C.green, fontWeight: 600, fontFamily: "'JetBrains Mono'", textTransform: 'uppercase' }}>done</span>
                  </div>
                ))}
                {unlogged.map(h => (
                  <div key={h.id} style={{
                    background: isToday ? C.bgGlass : 'transparent',
                    borderRadius: 14, padding: '12px 16px',
                    border: `1px dashed ${C.borderDash}`, display: 'flex', alignItems: 'center', gap: 12,
                    opacity: isToday ? 0.8 : 0.4,
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.textDim}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Star size={14} color={C.textMuted} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: isToday ? C.text : C.textMuted, fontFamily: "'Noto Sans SC'" }}>{h.name}</div>
                    </div>
                    {isToday ? (
                      <div onClick={() => handleLogHabit(h.id)} style={{
                        padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.amber}`,
                        background: 'transparent', color: C.amber, fontSize: 11, fontWeight: 500,
                        cursor: 'pointer', fontFamily: "'JetBrains Mono'",
                      }}>
                        打卡
                      </div>
                    ) : (
                      <span style={{ fontSize: 9, color: C.textDim, fontFamily: "'JetBrains Mono'" }}>未打卡</span>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* Timeline Tab */}
      {tab === 'timeline' && (
        <div style={{ padding: '0 20px 60px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 18, fontFamily: "'Space Grotesk'", display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.35s' }}>
            <span>{selectedDate || 'Today'}</span>
            <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 400 }}>{sessionCount} sessions · {keepaliveCount} activities</span>
          </div>

          {timeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 13, fontFamily: "'Noto Sans SC'" }}>
              暂无数据
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 9, top: 8, bottom: 8, width: 1, background: `linear-gradient(180deg, ${C.borderDash} 0%, transparent 100%)` }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {timeline.map((item, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: 4, top: 18, width: 11, height: 11,
                      borderRadius: '50%', zIndex: 2,
                      background: item.type === 'session' ? C.session
                        : (item as { type: 'keepalive'; log: KeepaliveLog }).log.action === 'message' ? C.amber
                        : (item as { type: 'keepalive'; log: KeepaliveLog }).log.action === 'explore' ? C.green
                        : C.textDim,
                      border: `2px solid ${C.bg}`,
                      boxShadow: item.type === 'session' ? `0 0 8px ${C.sessionBg}`
                        : (item as { type: 'keepalive'; log: KeepaliveLog }).log?.action !== 'none' ? `0 0 8px ${C.amberGlow}` : 'none',
                      transition: 'color 0.35s ease',
                    }} />
                    {item.type === 'session'
                      ? <SessionCard item={item} C={C} onClick={() => navigate(`/${item.sessionId}`)} />
                      : <KeepaliveCard item={(item as { type: 'keepalive'; log: KeepaliveLog }).log} expanded={expanded.has(idx)} onToggle={() => toggle(idx)} C={C} />
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diary cards in timeline */}
          {(dateDiaries.dream.length > 0 || dateDiaries.chen.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, fontFamily: "'JetBrains Mono'", letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                DIARY
              </div>
              {[...dateDiaries.dream.map(d => ({ ...d, _source: 'dream' as const })), ...dateDiaries.chen.map(d => ({ ...d, _source: 'chen' as const }))].map(d => (
                <div key={d.id} onClick={() => navigate(`/diary/${selectedDate}`)} style={{
                  background: C.bgCard, borderRadius: 14, padding: '14px 16px', marginBottom: 8,
                  border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'all 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      background: d._source === 'dream' ? C.amberGlow : 'rgba(138,108,170,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 600, color: d._source === 'dream' ? C.amber : '#8A6CAA',
                    }}>
                      {d._source === 'dream' ? 'D' : 'C'}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: d._source === 'dream' ? C.amber : '#8A6CAA', fontFamily: "'Space Grotesk'" }}>
                      {d._source === 'dream' ? 'Dream' : 'Claude'}
                    </span>
                    {d.time && <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono'" }}>{d.time}</span>}
                    {d.is_locked && <span style={{ fontSize: 9, color: '#B8604A' }}>locked</span>}
                  </div>
                  {d.title && <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "'Noto Sans SC'" }}>{d.title}</div>}
                  {!d.is_locked && d.content && (
                    <div style={{ fontSize: 11, color: C.textSoft, marginTop: 4, fontFamily: "'Noto Sans SC'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.content.slice(0, 60)}…
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{
            textAlign: 'center', marginTop: 28, padding: '14px 0', fontSize: 11, color: C.textDim,
            fontFamily: "'Noto Sans SC'", borderTop: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'color 0.35s ease',
          }}>
            <Moon size={12} />
            <span>Claude 在 03:00 进入休眠</span>
          </div>
        </div>
      )}
    </div>
  )
}
