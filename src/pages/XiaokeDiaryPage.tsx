import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { client } from '../api/client'
import { C, FONT } from '../theme'

interface DiaryEntry {
  date: string
  title: string
  preview: string
  filename: string
  size: number
}

interface DiaryFull {
  date: string
  title: string
  content: string
  filename: string
}

// 按月份分组（date 格式 YYYY-MM-DD）
function groupByMonth<T extends { date: string }>(items: T[]) {
  const map = new Map<string, T[]>()
  for (const d of items) {
    const key = (d.date || '').slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(d)
  }
  const currentYear = new Date().getFullYear()
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, arr]) => {
      const [y, m] = key.split('-').map(Number)
      const label = y === currentYear ? `${m} 月` : `${y} 年 ${m} 月`
      return { key, year: y, month: m, label, items: arr.sort((a, b) => b.date.localeCompare(a.date)) }
    })
}

function renderContent(content: string) {
  return content.split('\n').map((line, i) => {
    if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '22px 0 8px' }}>{line.slice(4)}</h3>
    if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: '26px 0 10px' }}>{line.slice(3)}</h2>
    if (line.startsWith('# ')) return <h1 key={i} style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 22px', letterSpacing: '0.01em' }}>{line.slice(2)}</h1>
    if (line.match(/^---+$/)) return <hr key={i} style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '26px 0' }} />
    if (!line.trim()) return <div key={i} style={{ height: 10 }} />
    return <p key={i} style={{ fontSize: 15, lineHeight: 1.85, color: C.textSecondary, margin: '6px 0' }}>{line}</p>
  })
}

function MonthHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 select-none" style={{ padding: '20px 20px 8px', color: C.textMuted }}>
      <span style={{ width: 16, height: 1, background: 'currentColor', opacity: 0.35, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2, fontVariantNumeric: 'tabular-nums' }}>· {count}</span>
    </div>
  )
}

// ─── PC 瀑布流 + 右侧时间轴 ───
function DesktopWaterfall({
  diaries,
  loading,
  onBack,
}: {
  diaries: DiaryEntry[]
  loading: boolean
  onBack: () => void
}) {
  const [fullMap, setFullMap] = useState<Record<string, DiaryFull>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [activeMonth, setActiveMonth] = useState<string>('')
  const [timelineVisible, setTimelineVisible] = useState(false)
  const [hoverTimeline, setHoverTimeline] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [scrubLabel, setScrubLabel] = useState<{ y: number; text: string } | null>(null)
  const hideTimer = useRef<number | null>(null)

  const groups = useMemo(() => groupByMonth(diaries), [diaries])

  // 按时间排序的年月列表（时间轴用）
  const monthsAxis = useMemo(() => {
    return groups.map(g => ({ key: g.key, year: g.year, month: g.month }))
  }, [groups])

  // 时间轴上的年份标记（去重，只在每年第一个月显示年）
  const yearMarks = useMemo(() => {
    const seen = new Set<number>()
    return monthsAxis.map(m => {
      const showYear = !seen.has(m.year)
      seen.add(m.year)
      return { ...m, showYear }
    })
  }, [monthsAxis])

  // 并发拉全文
  useEffect(() => {
    if (!diaries.length) return
    let cancelled = false
    Promise.all(
      diaries.map(d =>
        client
          .get<{ diary: DiaryFull }>(`/xiaoke-diary/read?filename=${encodeURIComponent(d.filename)}`)
          .then(res => res.diary)
          .catch(() => null)
      )
    ).then(results => {
      if (cancelled) return
      const map: Record<string, DiaryFull> = {}
      for (const r of results) {
        if (r) map[r.filename] = r
      }
      setFullMap(map)
    })
    return () => {
      cancelled = true
    }
  }, [diaries])

  // 滚动监听：同步 activeMonth，控制时间轴显隐
  const showTimelineBriefly = useCallback(() => {
    setTimelineVisible(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      setTimelineVisible(false)
    }, 1200)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      showTimelineBriefly()
      // 找到视口顶部附近的月份
      const top = el.scrollTop + 80
      let current = ''
      for (const g of groups) {
        const node = monthRefs.current[g.key]
        if (node && node.offsetTop <= top) current = g.key
        else break
      }
      if (current) setActiveMonth(current)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // 初始化 activeMonth
    if (groups.length > 0) setActiveMonth(groups[0].key)
    return () => el.removeEventListener('scroll', onScroll)
  }, [groups, showTimelineBriefly])

  // 主区任意位置接收滚动事件时也显示（含滚轮触摸板微动）
  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [])

  // 点击月份：滚到对应位置
  const scrollToMonth = (key: string) => {
    const node = monthRefs.current[key]
    const container = scrollRef.current
    if (node && container) {
      container.scrollTo({ top: node.offsetTop - 24, behavior: 'smooth' })
    }
  }

  // 拖拽 scrubber：根据 Y 坐标映射到对应日记位置
  const pickItemByY = (clientY: number) => {
    const axis = timelineRef.current
    const container = scrollRef.current
    if (!axis || !container || diaries.length === 0) return null
    const rect = axis.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const idx = Math.min(diaries.length - 1, Math.floor(ratio * diaries.length))
    const diary = diaries[idx]
    return { diary, clientY }
  }

  const handleScrubMove = (clientY: number) => {
    const picked = pickItemByY(clientY)
    if (!picked) return
    // 滚动主区
    const node = itemRefs.current[picked.diary.filename]
    const container = scrollRef.current
    if (node && container) {
      container.scrollTo({ top: node.offsetTop - 24 })
    }
    // 浮标文字：MM-DD
    const dateStr = picked.diary.date || ''
    const label = dateStr.length >= 10 ? dateStr.slice(5) : dateStr
    setScrubLabel({ y: picked.clientY, text: label })
  }

  const onTimelineMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    setTimelineVisible(true)
    handleScrubMove(e.clientY)
    const onMove = (ev: MouseEvent) => handleScrubMove(ev.clientY)
    const onUp = () => {
      setDragging(false)
      setScrubLabel(null)
      showTimelineBriefly()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onTimelineTouchStart = (e: React.TouchEvent) => {
    setDragging(true)
    setTimelineVisible(true)
    const t = e.touches[0]
    if (t) handleScrubMove(t.clientY)
  }
  const onTimelineTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t) handleScrubMove(t.clientY)
  }
  const onTimelineTouchEnd = () => {
    setDragging(false)
    setScrubLabel(null)
    showTimelineBriefly()
  }

  const axisShown = timelineVisible || hoverTimeline || dragging

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT, position: 'relative' }}>
      {/* 顶部细 header */}
      <div style={{
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}
          onMouseEnter={e => (e.currentTarget.style.color = C.text)}
          onMouseLeave={e => (e.currentTarget.style.color = C.textSecondary)}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>小克的日记</span>
          <span style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{diaries.length}</span>
        </div>
      </div>

      {/* 瀑布流主区 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.textMuted, fontSize: 13 }}>loading...</div>
        ) : diaries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.textMuted, fontSize: 13 }}>no diary yet</div>
        ) : (
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 40px 120px' }}>
            {groups.map((g, gi) => (
              <div
                key={g.key}
                ref={n => { monthRefs.current[g.key] = n }}
              >
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 10,
                  margin: gi === 0 ? '8px 0 20px' : '56px 0 20px',
                  color: C.textMuted,
                }}>
                  <span style={{ width: 20, height: 1, background: 'currentColor', opacity: 0.4 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{g.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>· {g.items.length}</span>
                </div>
                {g.items.map((d, di) => {
                  const full = fullMap[d.filename]
                  return (
                    <div
                      key={d.filename}
                      ref={n => { itemRefs.current[d.filename] = n }}
                      style={{
                        padding: '8px 0 32px',
                        borderBottom: di < g.items.length - 1 ? `1px dashed ${C.border}` : 'none',
                        marginBottom: 24,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
                        <span style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>
                          {d.date}
                        </span>
                      </div>
                      {full ? renderContent(full.content) : (
                        <>
                          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>{d.title}</h1>
                          <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7 }}>{d.preview}</p>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右侧时间轴 scrubber */}
      <div
        ref={timelineRef}
        onMouseEnter={() => setHoverTimeline(true)}
        onMouseLeave={() => setHoverTimeline(false)}
        onMouseDown={onTimelineMouseDown}
        onTouchStart={onTimelineTouchStart}
        onTouchMove={onTimelineTouchMove}
        onTouchEnd={onTimelineTouchEnd}
        style={{
          position: 'absolute',
          top: 56 + 16, bottom: 16, right: 0,
          width: 44,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
          paddingRight: 10,
          opacity: axisShown ? 1 : 0,
          transition: 'opacity 0.25s ease',
          pointerEvents: axisShown ? 'auto' : 'none',
          cursor: dragging ? 'grabbing' : 'ns-resize',
          userSelect: 'none',
        }}
      >
        {/* 中央的细竖线 */}
        <div style={{
          position: 'absolute', right: 18, top: 0, bottom: 0, width: 1,
          background: C.borderStrong, opacity: 0.6,
        }} />
        {/* 年月刻度 */}
        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
          {yearMarks.map(m => {
            const isActive = m.key === activeMonth
            return (
              <div
                key={m.key}
                onClick={e => { e.stopPropagation(); scrollToMonth(m.key) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  gap: 6, position: 'relative', cursor: 'pointer',
                  height: `${100 / Math.max(yearMarks.length, 1)}%`,
                }}
              >
                {m.showYear && (
                  <span style={{
                    position: 'absolute', right: 36, top: -6,
                    fontSize: 10, color: C.textMuted, letterSpacing: '0.08em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{m.year}</span>
                )}
                <span style={{
                  fontSize: isActive ? 13 : 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? C.accent : C.textMuted,
                  fontVariantNumeric: 'tabular-nums',
                  transition: 'all 0.15s',
                  minWidth: 18, textAlign: 'right',
                }}>{m.month}</span>
                {/* 刻度点 */}
                <span style={{
                  position: 'absolute', right: 15, width: 7, height: 1,
                  background: isActive ? C.accent : C.textMuted,
                  opacity: isActive ? 1 : 0.5,
                }} />
              </div>
            )
          })}
        </div>
      </div>

      {/* 拖动中的浮标（具体日期） */}
      {scrubLabel && (
        <div style={{
          position: 'fixed',
          right: 68,
          top: scrubLabel.y,
          transform: 'translateY(-50%)',
          background: C.bg,
          border: `1px solid ${C.borderStrong}`,
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          color: C.text,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.05em',
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(50,42,34,0.08)',
          zIndex: 50,
        }}>
          {scrubLabel.text}
        </div>
      )}
    </div>
  )
}

// ─── 手机端保留原样（列表按月分组 + 全屏阅读） ───
function MobileView({ diaries, loading, onBack }: { diaries: DiaryEntry[]; loading: boolean; onBack: () => void }) {
  const [selected, setSelected] = useState<DiaryFull | null>(null)
  const groups = useMemo(() => groupByMonth(diaries), [diaries])

  const openDiary = async (filename: string) => {
    try {
      const res = await client.get<{ diary: DiaryFull }>(`/xiaoke-diary/read?filename=${encodeURIComponent(filename)}`)
      setSelected(res.diary)
    } catch { /* */ }
  }

  if (selected) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT }}>
        <div style={{
          padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)',
        }}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}>
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontSize: 12, color: C.textMuted, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>{selected.date}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 48px' }}>
          {renderContent(selected.content)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT }}>
      <div style={{
        padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>小克的日记</span>
          <span style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{diaries.length}</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 13 }}>loading...</div>
        ) : diaries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 13 }}>no diary yet</div>
        ) : groups.map(g => (
          <div key={g.key}>
            <MonthHeader label={g.label} count={g.items.length} />
            <div style={{ padding: '0 12px' }}>
              {g.items.map(d => (
                <button
                  key={d.filename}
                  onClick={() => openDiary(d.filename)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '14px', marginBottom: 8, borderRadius: 12,
                    background: 'transparent', border: `1px solid ${C.border}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{d.title}</span>
                    <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0, marginLeft: 12, fontVariantNumeric: 'tabular-nums' }}>{d.date.slice(5)}</span>
                  </div>
                  <p style={{
                    fontSize: 13, color: C.textSecondary, lineHeight: 1.6, margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                  }}>
                    {d.preview}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function XiaokeDiaryPage() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    client.get<{ diaries: DiaryEntry[] }>('/xiaoke-diary/list')
      .then(res => setDiaries(res.diaries))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (isMobile) return <MobileView diaries={diaries} loading={loading} onBack={() => navigate('/')} />
  return <DesktopWaterfall diaries={diaries} loading={loading} onBack={() => navigate('/')} />
}
