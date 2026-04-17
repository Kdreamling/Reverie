import { useState, useEffect } from 'react'
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
function groupByMonth(diaries: DiaryEntry[]) {
  const map = new Map<string, DiaryEntry[]>()
  for (const d of diaries) {
    const key = (d.date || '').slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(d)
  }
  const currentYear = new Date().getFullYear()
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const [y, m] = key.split('-').map(Number)
      const label = y === currentYear ? `${m} 月` : `${y} 年 ${m} 月`
      return { key, label, items: items.sort((a, b) => b.date.localeCompare(a.date)) }
    })
}

function getDay(date: string) {
  const d = (date || '').slice(8, 10).replace(/^0/, '')
  return d || '·'
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

export default function XiaokeDiaryPage() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState<DiaryEntry[]>([])
  const [selected, setSelected] = useState<DiaryFull | null>(null)
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

  const openDiary = async (filename: string) => {
    try {
      const res = await client.get<{ diary: DiaryFull }>(`/xiaoke-diary/read?filename=${encodeURIComponent(filename)}`)
      setSelected(res.diary)
    } catch { /* */ }
  }

  const groups = groupByMonth(diaries)

  // ─── 手机端：阅读模式 ───
  if (isMobile && selected) {
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

  // ─── 手机端：列表模式（按月分组） ───
  if (isMobile) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT }}>
        <div style={{
          padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)',
        }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}>
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
                    onTouchStart={e => (e.currentTarget.style.borderColor = C.borderStrong)}
                    onTouchEnd={e => (e.currentTarget.style.borderColor = C.border)}
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

  // ─── PC：左右双栏 ───
  return (
    <div style={{ height: '100dvh', display: 'flex', background: C.bg, fontFamily: FONT }}>
      {/* 左栏：时间线索引 */}
      <div style={{
        width: 300, display: 'flex', flexDirection: 'column',
        borderRight: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <div style={{
          padding: '0 18px', height: 56, display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <button
            onClick={() => navigate('/')}
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
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 32 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 12 }}>loading...</div>
          ) : diaries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 12 }}>no diary yet</div>
          ) : groups.map(g => (
            <div key={g.key}>
              <MonthHeader label={g.label} count={g.items.length} />
              {g.items.map(d => {
                const active = selected?.filename === d.filename
                return (
                  <button
                    key={d.filename}
                    onClick={() => openDiary(d.filename)}
                    className="relative w-full text-left transition-colors duration-150 cursor-pointer"
                    style={{
                      padding: '10px 20px 10px 32px',
                      background: active ? C.sidebarActive : 'transparent',
                      borderLeft: `2px solid ${active ? C.accent : 'transparent'}`,
                      marginLeft: -2,
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(160,120,90,0.04)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div className="flex items-baseline gap-3">
                      <span style={{
                        fontSize: 12, fontWeight: 600, minWidth: 18,
                        color: active ? C.accent : C.textMuted,
                        fontVariantNumeric: 'tabular-nums',
                      }}>{getDay(d.date)}</span>
                      <span style={{
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: active ? C.text : C.textSecondary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      }}>{d.title}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 右栏：阅读区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            <div style={{
              padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: `1px solid ${C.border}`, flexShrink: 0,
            }}>
              <span style={{ width: 14, height: 1, background: C.textMuted, opacity: 0.35 }} />
              <span style={{ fontSize: 12, color: C.textMuted, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>
                {selected.date}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ maxWidth: 680, margin: '0 auto', padding: '56px 40px 96px' }}>
                {renderContent(selected.content)}
              </div>
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 14, color: C.textMuted,
          }}>
            <div style={{ width: 40, height: 1, background: 'currentColor', opacity: 0.3 }} />
            <span style={{ fontSize: 13, letterSpacing: '0.08em' }}>从左侧选一篇日记</span>
          </div>
        )}
      </div>
    </div>
  )
}
