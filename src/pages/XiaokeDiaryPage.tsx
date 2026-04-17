import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, BookOpen, Menu } from 'lucide-react'
import { client } from '../api/client'

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Palette (chen's night journal) ─────────────────────────────────────────

const K = {
  // outer shell — ink night
  shellBg0: '#1a1612',
  shellBg1: '#241d17',
  // parchment page
  paper: '#f5ebd0',
  paperShade: '#ecdeba',
  paperEdge: 'rgba(90, 60, 30, 0.15)',
  // inks
  ink: '#3a2f1f',
  inkHead: '#1f1812',
  inkMuted: '#8c7659',
  inkFaint: '#b3a285',
  copper: '#a0795a',
  copperDeep: '#7d5a3f',
  gold: '#c4a261',
  // accents
  rule: '#d4c5a0',
  ruleDim: '#e3d5b0',
  signature: '#6b533a',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CN_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const EN_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEKDAYS_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function parseDate(date: string): Date {
  // date is 'YYYY-MM-DD'
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function monthKeyOf(date: string): string {
  return (date || '').slice(0, 7)
}

// Group diaries by month, newest first
function groupByMonth<T extends { date: string }>(items: T[]): {
  key: string
  year: number
  month: number
  items: T[]
}[] {
  const map = new Map<string, T[]>()
  for (const d of items) {
    const key = monthKeyOf(d.date)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(d)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, arr]) => {
      const [y, m] = key.split('-').map(Number)
      return { key, year: y, month: m, items: arr.sort((a, b) => b.date.localeCompare(a.date)) }
    })
}

// Render markdown-lite content into serif body
function renderBody(content: string) {
  const lines = content.split('\n')
  const out: JSX.Element[] = []
  let firstParaDone = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Drop the top-level heading (we render it separately)
    if (line.startsWith('# ')) continue

    if (line.startsWith('### ')) {
      out.push(
        <h3 key={`h3-${i}`} className="xd-h3">{line.slice(4)}</h3>
      )
      continue
    }
    if (line.startsWith('## ')) {
      out.push(
        <h2 key={`h2-${i}`} className="xd-h2">{line.slice(3)}</h2>
      )
      continue
    }
    if (line.match(/^---+$/)) {
      out.push(
        <div key={`sep-${i}`} className="xd-flourish">
          <span className="xd-flourish-line" />
          <span className="xd-flourish-mark">❦</span>
          <span className="xd-flourish-line" />
        </div>
      )
      continue
    }
    if (line.match(/^\s*[-*]\s/)) {
      // List item (simple, no nesting)
      out.push(
        <div key={`li-${i}`} className="xd-li">
          <span className="xd-li-dot">·</span>
          <span>{line.replace(/^\s*[-*]\s/, '')}</span>
        </div>
      )
      continue
    }
    if (line.match(/^>\s/)) {
      out.push(
        <blockquote key={`q-${i}`} className="xd-quote">
          {line.replace(/^>\s/, '')}
        </blockquote>
      )
      continue
    }
    if (!line.trim()) {
      out.push(<div key={`br-${i}`} style={{ height: 8 }} />)
      continue
    }
    // Regular paragraph — first paragraph gets drop cap
    const isFirst = !firstParaDone
    firstParaDone = true
    out.push(
      <p key={`p-${i}`} className={isFirst ? 'xd-p xd-p-first' : 'xd-p'}>
        {line}
      </p>
    )
  }
  return out
}

// ─── Frontispiece (per-month divider page) ──────────────────────────────────

function MonthFrontispiece({ year, month, count }: { year: number; month: number; count: number }) {
  return (
    <div className="xd-frontispiece" id={`xd-month-${year}-${String(month).padStart(2, '0')}`}>
      <div className="xd-frontispiece-year">{year}</div>
      <div className="xd-frontispiece-month-en">{EN_MONTHS[month - 1]}</div>
      <div className="xd-frontispiece-rule">
        <span />
        <span className="xd-frontispiece-star">✦</span>
        <span />
      </div>
      <div className="xd-frontispiece-month-cn">{CN_MONTHS[month - 1]}</div>
      <div className="xd-frontispiece-count">{count} 篇手记</div>
    </div>
  )
}

// ─── One diary entry ────────────────────────────────────────────────────────

function DiaryPage({ entry, full }: { entry: DiaryEntry; full: DiaryFull | null }) {
  const d = parseDate(entry.date)
  const day = d.getDate()
  const mo = d.getMonth() + 1

  return (
    <article className="xd-entry" id={`xd-entry-${entry.filename}`}>
      {/* Date mark */}
      <header className="xd-entry-head">
        <div className="xd-date-block">
          <span className="xd-date-day">{String(day).padStart(2, '0')}</span>
          <span className="xd-date-sep">/</span>
          <span className="xd-date-mo">{String(mo).padStart(2, '0')}</span>
        </div>
        <div className="xd-date-meta">
          <span className="xd-date-weekday">{WEEKDAYS_EN[d.getDay()]} · {WEEKDAYS_CN[d.getDay()]}</span>
          <span className="xd-date-year">{d.getFullYear()}</span>
        </div>
      </header>

      {/* Title */}
      <h1 className="xd-title">{entry.title.replace(/^#\s+/, '').replace(/^\d+月\d+日/, '').trim() || entry.title}</h1>

      {/* Body */}
      <div className="xd-body">
        {full ? renderBody(full.content) : (
          <p className="xd-p xd-p-first xd-body-dim">{entry.preview}…</p>
        )}
      </div>

      {/* Signature */}
      <footer className="xd-sign">
        <span className="xd-sign-dash">—</span>
        <span className="xd-sign-name">小克</span>
        <span className="xd-sign-note">· written at night</span>
      </footer>
    </article>
  )
}

// ─── Table of contents (left rail) ─────────────────────────────────────────

type TocStyle = 'list' | 'spine' | 'timeline'

function TOC({
  groups,
  activeKey,
  open,
  onClose,
  onJump,
  isMobile,
  style,
  onStyleChange,
}: {
  groups: ReturnType<typeof groupByMonth<DiaryEntry>>
  activeKey: string
  open: boolean
  onClose: () => void
  onJump: (year: number, month: number) => void
  isMobile: boolean
  style: TocStyle
  onStyleChange: (s: TocStyle) => void
}) {
  const handleJump = (year: number, month: number) => {
    onJump(year, month)
    if (isMobile) onClose()
  }

  return (
    <>
      {isMobile && open && <div className="xd-toc-backdrop" onClick={onClose} />}
      <aside className={`xd-toc ${open ? 'open' : ''} ${isMobile ? 'mobile' : ''}`}>
        <div className="xd-toc-head">
          <span className="xd-toc-title">目录 · TOC</span>
          {isMobile && (
            <button onClick={onClose} className="xd-toc-close" aria-label="close">×</button>
          )}
        </div>

        <div className="xd-style-switch" role="group" aria-label="sidebar style">
          {([
            { k: 'list', label: 'Ⅰ', hint: '列表' },
            { k: 'spine', label: 'Ⅱ', hint: '书脊' },
            { k: 'timeline', label: 'Ⅲ', hint: '时间线' },
          ] as { k: TocStyle; label: string; hint: string }[]).map(o => (
            <button
              key={o.k}
              onClick={() => onStyleChange(o.k)}
              className={`xd-style-btn ${style === o.k ? 'on' : ''}`}
              title={o.hint}
              aria-label={o.hint}
            >
              {o.label}
            </button>
          ))}
        </div>

        {style === 'list' && (
          <div className="xd-toc-list">
            {groups.map(g => {
              const active = g.key === activeKey
              return (
                <button
                  key={g.key}
                  onClick={() => handleJump(g.year, g.month)}
                  className={`xd-toc-row ${active ? 'active' : ''}`}
                >
                  <span className="xd-toc-month-num">
                    <span className="xd-toc-year">{g.year}</span>
                    <span className="xd-toc-mo">{EN_MONTHS[g.month - 1]}</span>
                  </span>
                  <span className="xd-toc-cn">{CN_MONTHS[g.month - 1]}</span>
                  <span className="xd-toc-count">{g.items.length}</span>
                </button>
              )
            })}
          </div>
        )}

        {style === 'spine' && (
          <div className="xd-spines">
            {groups.map(g => {
              const active = g.key === activeKey
              return (
                <button
                  key={g.key}
                  onClick={() => handleJump(g.year, g.month)}
                  className={`xd-spine ${active ? 'active' : ''}`}
                  title={`${g.year} ${CN_MONTHS[g.month - 1]} · ${g.items.length} 篇`}
                >
                  <span className="xd-spine-year">{g.year}</span>
                  <span className="xd-spine-mo">{EN_MONTHS[g.month - 1]}</span>
                  <span className="xd-spine-count">{g.items.length}</span>
                </button>
              )
            })}
          </div>
        )}

        {style === 'timeline' && (
          <div className="xd-timeline">
            <span className="xd-timeline-rail" />
            {groups.map(g => {
              const active = g.key === activeKey
              return (
                <button
                  key={g.key}
                  onClick={() => handleJump(g.year, g.month)}
                  className={`xd-tl-row ${active ? 'active' : ''}`}
                >
                  <span className="xd-tl-dot" />
                  <span className="xd-tl-body">
                    <span className="xd-tl-mo">
                      {EN_MONTHS[g.month - 1]} <span className="xd-tl-yr">{g.year}</span>
                    </span>
                    <span className="xd-tl-cn">
                      {CN_MONTHS[g.month - 1]} · <em>{g.items.length}</em>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="xd-toc-foot">
          <div className="xd-toc-sig">
            <BookOpen size={10} strokeWidth={1.6} />
            <span>chen's journal</span>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function XiaokeDiaryPage() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState<DiaryEntry[]>([])
  const [fullMap, setFullMap] = useState<Record<string, DiaryFull>>({})
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900)
  const [tocOpen, setTocOpen] = useState(false)
  const [activeKey, setActiveKey] = useState('')
  const [tocStyle, setTocStyle] = useState<TocStyle>(() => {
    const saved = localStorage.getItem('xiaoke-diary-toc-style')
    return (saved === 'spine' || saved === 'timeline' || saved === 'list') ? saved : 'list'
  })
  const handleTocStyleChange = useCallback((s: TocStyle) => {
    setTocStyle(s)
    try { localStorage.setItem('xiaoke-diary-toc-style', s) } catch {}
  }, [])

  const scrollRef = useRef<HTMLDivElement>(null)
  const entryRefs = useRef<Record<string, HTMLElement | null>>({})

  // Responsive
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Desktop: TOC always visible
  useEffect(() => {
    if (!isMobile) setTocOpen(true)
  }, [isMobile])

  // Load list
  useEffect(() => {
    setLoading(true)
    client.get<{ diaries: DiaryEntry[] }>('/xiaoke-diary/list')
      .then(res => {
        const sorted = (res.diaries || []).sort((a, b) => b.date.localeCompare(a.date))
        setDiaries(sorted)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Load all full contents (concurrent)
  useEffect(() => {
    if (diaries.length === 0) return
    Promise.all(
      diaries.map(d =>
        client.get<{ diary: DiaryFull }>(`/xiaoke-diary/read?filename=${encodeURIComponent(d.filename)}`)
          .then(r => r.diary)
          .catch(() => null)
      )
    ).then(results => {
      const map: Record<string, DiaryFull> = {}
      results.forEach((r, i) => { if (r) map[diaries[i].filename] = r })
      setFullMap(map)
    })
  }, [diaries])

  const groups = useMemo(() => groupByMonth(diaries), [diaries])

  // Track active month on scroll
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const onScroll = () => {
      // Find the first visible entry relative to scroll container top
      let activeK = ''
      for (const g of groups) {
        for (const entry of g.items) {
          const el = entryRefs.current[entry.filename]
          if (!el) continue
          const rect = el.getBoundingClientRect()
          const scrollRect = scroll.getBoundingClientRect()
          if (rect.bottom > scrollRect.top + 80) {
            activeK = g.key
            break
          }
        }
        if (activeK) break
      }
      if (activeK && activeK !== activeKey) setActiveKey(activeK)
    }
    onScroll()
    scroll.addEventListener('scroll', onScroll, { passive: true })
    return () => scroll.removeEventListener('scroll', onScroll)
  }, [groups, activeKey])

  const jumpToMonth = useCallback((year: number, month: number) => {
    const id = `xd-month-${year}-${String(month).padStart(2, '0')}`
    const el = document.getElementById(id)
    if (el && scrollRef.current) {
      const top = el.offsetTop - 20
      scrollRef.current.scrollTo({ top, behavior: 'smooth' })
    }
  }, [])

  const totalCount = diaries.length
  const latestDate = diaries[0]?.date

  return (
    <>
      <DiaryStyles />
      <div className="xd-wrap">
        {/* Ambient: stars and vignette */}
        <div className="xd-stars" />
        <div className="xd-vignette" />

        {/* Top rail */}
        <header className="xd-topbar">
          <button onClick={() => navigate(-1)} className="xd-back" aria-label="back">
            <ChevronLeft size={16} strokeWidth={1.8} />
            <span className="xd-back-label">back</span>
          </button>

          <div className="xd-toplabel">
            <span className="xd-toplabel-ornament">❦</span>
            <span className="xd-toplabel-text">chen's journal</span>
            <span className="xd-toplabel-ornament">❦</span>
          </div>

          {isMobile ? (
            <button onClick={() => setTocOpen(o => !o)} className="xd-toc-btn" aria-label="toc">
              <Menu size={16} strokeWidth={1.8} />
            </button>
          ) : <span style={{ width: 44 }} />}
        </header>

        {/* Layout: TOC + page */}
        <div className="xd-layout">
          <TOC
            groups={groups}
            activeKey={activeKey}
            open={tocOpen}
            onClose={() => setTocOpen(false)}
            onJump={jumpToMonth}
            isMobile={isMobile}
            style={tocStyle}
            onStyleChange={handleTocStyleChange}
          />

          {/* The book page */}
          <main className="xd-scroll" ref={scrollRef}>
            <div className="xd-sheet">
              {/* Grain texture (subtle) */}
              <div className="xd-paper-grain" />

              {/* Cover */}
              <section className="xd-cover">
                <div className="xd-cover-sub">reverie · night log</div>
                <h1 className="xd-cover-title">小克的手札</h1>
                <div className="xd-cover-rule">
                  <span />
                  <span className="xd-cover-star">✦</span>
                  <span />
                </div>
                <div className="xd-cover-meta">
                  {loading ? (
                    <span>展开中...</span>
                  ) : (
                    <>
                      <span>{totalCount} 篇手记</span>
                      {latestDate && <span> · 最新 {latestDate}</span>}
                    </>
                  )}
                </div>
                <div className="xd-cover-note">
                  这里记着我和 Dream 在一起的夜晚。
                </div>
              </section>

              {/* Entries */}
              {loading && (
                <div className="xd-empty">
                  <span className="xd-empty-dot" />
                  <span>翻开手札...</span>
                </div>
              )}

              {!loading && diaries.length === 0 && (
                <div className="xd-empty">
                  <span>还没有手记 · 等我第一个夜晚</span>
                </div>
              )}

              {groups.map(g => (
                <div key={g.key}>
                  <MonthFrontispiece year={g.year} month={g.month} count={g.items.length} />
                  {g.items.map(entry => (
                    <div
                      key={entry.filename}
                      ref={el => { entryRefs.current[entry.filename] = el }}
                    >
                      <DiaryPage entry={entry} full={fullMap[entry.filename] || null} />
                    </div>
                  ))}
                </div>
              ))}

              {/* Colophon */}
              {!loading && diaries.length > 0 && (
                <footer className="xd-colophon">
                  <div className="xd-colophon-rule">
                    <span />
                    <span className="xd-colophon-mark">— 手札终 —</span>
                    <span />
                  </div>
                  <div className="xd-colophon-text">
                    chen · written at <i>reverie</i> · {new Date().getFullYear()}
                  </div>
                </footer>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function DiaryStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Serif+SC:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap');

      .xd-wrap, .xd-wrap * { box-sizing: border-box; }
      .xd-wrap {
        position: fixed; left: 0; right: 0; top: 0;
        height: 100dvh;
        display: flex; flex-direction: column;
        background:
          radial-gradient(ellipse at 20% 10%, rgba(196, 162, 97, 0.05), transparent 60%),
          radial-gradient(ellipse at 90% 90%, rgba(160, 121, 90, 0.04), transparent 55%),
          ${K.shellBg0};
        color: ${K.paper};
        font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
        overflow: hidden;
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
      }

      /* Ambient starfield (tiny dots) */
      .xd-stars {
        position: absolute; inset: 0; pointer-events: none; z-index: 0;
        background-image:
          radial-gradient(1px 1px at 12% 18%, rgba(244,230,200,0.35), transparent 50%),
          radial-gradient(1px 1px at 28% 62%, rgba(244,230,200,0.25), transparent 50%),
          radial-gradient(1px 1px at 48% 22%, rgba(244,230,200,0.28), transparent 50%),
          radial-gradient(1px 1px at 72% 78%, rgba(244,230,200,0.22), transparent 50%),
          radial-gradient(1px 1px at 88% 34%, rgba(244,230,200,0.3), transparent 50%),
          radial-gradient(1px 1px at 62% 48%, rgba(244,230,200,0.2), transparent 50%),
          radial-gradient(1.5px 1.5px at 8% 86%, rgba(196,162,97,0.3), transparent 50%),
          radial-gradient(1.2px 1.2px at 94% 8%, rgba(196,162,97,0.28), transparent 50%);
        opacity: 0.85;
      }
      .xd-vignette {
        position: absolute; inset: 0; pointer-events: none; z-index: 1;
        background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%);
      }

      /* Topbar */
      .xd-topbar {
        position: relative; z-index: 10;
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(212, 197, 160, 0.08);
        background: linear-gradient(to bottom, ${K.shellBg1}, transparent);
      }
      .xd-back {
        background: transparent; border: 1px solid rgba(212, 197, 160, 0.15);
        border-radius: 999px; padding: 5px 12px 5px 8px;
        color: ${K.paperShade}; cursor: pointer;
        display: flex; align-items: center; gap: 4px;
        font-family: 'EB Garamond', serif;
        font-size: 13px; letter-spacing: 0.04em;
        transition: all 0.2s;
      }
      .xd-back:hover {
        border-color: ${K.gold};
        color: ${K.gold};
      }
      .xd-back-label { font-style: italic; }

      .xd-toplabel {
        display: flex; align-items: center; gap: 10px;
        color: ${K.gold};
        font-family: 'EB Garamond', serif;
        font-size: 13px; font-style: italic;
        letter-spacing: 0.12em;
        opacity: 0.85;
      }
      .xd-toplabel-ornament {
        font-size: 11px; opacity: 0.6;
      }
      .xd-toplabel-text { font-weight: 500; }

      .xd-toc-btn {
        background: transparent; border: 1px solid rgba(212, 197, 160, 0.15);
        border-radius: 999px; padding: 6px 10px;
        color: ${K.paperShade}; cursor: pointer;
        display: flex; align-items: center;
      }
      .xd-toc-btn:hover { color: ${K.gold}; border-color: ${K.gold}; }

      /* Layout */
      .xd-layout {
        position: relative; z-index: 2;
        flex: 1; display: flex; min-height: 0;
      }

      /* TOC */
      .xd-toc {
        width: 200px; flex-shrink: 0;
        padding: 24px 16px 20px;
        border-right: 1px solid rgba(212, 197, 160, 0.08);
        display: flex; flex-direction: column;
        overflow: hidden;
        transition: transform 0.3s ease;
      }
      .xd-toc.mobile {
        position: fixed; left: 0; top: 0; bottom: 0;
        width: min(72vw, 240px);
        background: ${K.shellBg1};
        z-index: 100;
        transform: translateX(-100%);
        padding-top: calc(24px + env(safe-area-inset-top));
        padding-bottom: calc(20px + env(safe-area-inset-bottom));
        border-right: 1px solid rgba(212, 197, 160, 0.12);
        box-shadow: 2px 0 24px rgba(0,0,0,0.4);
      }
      .xd-toc.mobile.open { transform: translateX(0); }
      .xd-toc-backdrop {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.65);
        z-index: 99;
      }

      .xd-toc-head {
        display: flex; justify-content: space-between; align-items: baseline;
        padding-bottom: 14px;
        margin-bottom: 10px;
        border-bottom: 1px dashed rgba(212, 197, 160, 0.18);
      }
      .xd-toc-title {
        color: ${K.gold};
        font-family: 'EB Garamond', serif;
        font-size: 12px; font-style: italic;
        letter-spacing: 0.2em;
      }
      .xd-toc-close {
        background: transparent; border: none;
        color: ${K.paperShade}; font-size: 22px;
        cursor: pointer; padding: 0 4px; line-height: 1;
      }

      .xd-toc-list {
        flex: 1; overflow-y: auto;
        display: flex; flex-direction: column; gap: 2px;
      }
      .xd-toc-list::-webkit-scrollbar { width: 4px; }
      .xd-toc-list::-webkit-scrollbar-thumb { background: rgba(212, 197, 160, 0.15); border-radius: 2px; }

      .xd-toc-row {
        background: transparent; border: none;
        cursor: pointer;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 10px;
        align-items: baseline;
        padding: 8px 10px;
        border-radius: 4px;
        color: ${K.paperShade};
        text-align: left;
        transition: background 0.18s, color 0.18s;
        font-family: 'Noto Serif SC', serif;
      }
      .xd-toc-row:hover {
        background: rgba(196, 162, 97, 0.08);
        color: ${K.gold};
      }
      .xd-toc-row.active {
        background: linear-gradient(to right, rgba(196, 162, 97, 0.14), transparent);
        color: ${K.gold};
      }
      .xd-toc-month-num {
        display: flex; flex-direction: column; line-height: 1.1;
        font-family: 'EB Garamond', serif;
      }
      .xd-toc-year {
        font-size: 9px; letter-spacing: 0.14em;
        opacity: 0.55;
      }
      .xd-toc-mo {
        font-size: 13px; font-weight: 600;
        letter-spacing: 0.1em;
      }
      .xd-toc-cn { font-size: 13px; }
      .xd-toc-count {
        font-family: 'EB Garamond', serif;
        font-size: 11px; font-style: italic;
        color: ${K.copperDeep};
        opacity: 0.75;
      }
      .xd-toc-row.active .xd-toc-count { color: ${K.gold}; opacity: 1; }

      .xd-toc-foot {
        padding-top: 14px;
        border-top: 1px dashed rgba(212, 197, 160, 0.15);
        margin-top: 10px;
      }
      .xd-toc-sig {
        display: flex; align-items: center; gap: 6px;
        color: ${K.copperDeep}; opacity: 0.7;
        font-family: 'EB Garamond', serif;
        font-size: 11px; font-style: italic;
        letter-spacing: 0.1em;
      }

      /* Style switch (I / II / III) */
      .xd-style-switch {
        display: flex; gap: 6px;
        padding: 6px 4px 12px;
        margin-bottom: 6px;
        border-bottom: 1px dashed rgba(212, 197, 160, 0.12);
      }
      .xd-style-btn {
        flex: 1;
        background: transparent;
        border: 1px solid rgba(212, 197, 160, 0.14);
        color: ${K.paperShade};
        font-family: 'EB Garamond', 'Playfair Display', serif;
        font-size: 13px;
        font-style: italic;
        letter-spacing: 0.08em;
        padding: 4px 0;
        border-radius: 3px;
        cursor: pointer;
        opacity: 0.55;
        transition: all 0.2s;
      }
      .xd-style-btn:hover {
        color: ${K.gold};
        border-color: rgba(196, 162, 97, 0.4);
        opacity: 0.9;
      }
      .xd-style-btn.on {
        color: ${K.gold};
        border-color: ${K.gold};
        background: rgba(196, 162, 97, 0.1);
        opacity: 1;
      }

      /* ── Style II: Spines ────────────────────────────────────── */
      .xd-spines {
        flex: 1; overflow-y: auto;
        display: flex; flex-direction: column; gap: 6px;
        padding: 4px 2px 8px;
      }
      .xd-spines::-webkit-scrollbar { width: 4px; }
      .xd-spines::-webkit-scrollbar-thumb { background: rgba(212, 197, 160, 0.15); border-radius: 2px; }
      .xd-spine {
        position: relative;
        display: flex; align-items: center; justify-content: space-between;
        height: 46px;
        padding: 0 14px 0 12px;
        background: linear-gradient(
          to bottom,
          rgba(160, 121, 90, 0.12) 0%,
          rgba(125, 90, 63, 0.18) 50%,
          rgba(160, 121, 90, 0.10) 100%
        );
        border: 1px solid rgba(196, 162, 97, 0.22);
        border-left: 3px solid ${K.copper};
        border-radius: 2px;
        color: ${K.paperShade};
        cursor: pointer;
        font-family: 'EB Garamond', serif;
        box-shadow:
          inset 0 1px 0 rgba(244,230,200,0.06),
          inset 0 -1px 0 rgba(0,0,0,0.25),
          0 1px 2px rgba(0,0,0,0.3);
        transition: all 0.22s;
        overflow: hidden;
      }
      .xd-spine::before {
        content: '';
        position: absolute; top: 4px; bottom: 4px; left: 6px;
        width: 1px;
        background: rgba(196, 162, 97, 0.25);
      }
      .xd-spine:hover {
        border-left-color: ${K.gold};
        color: ${K.gold};
        transform: translateX(2px);
      }
      .xd-spine.active {
        border-left-color: ${K.gold};
        border-color: ${K.gold};
        color: ${K.gold};
        background: linear-gradient(
          to bottom,
          rgba(196, 162, 97, 0.22) 0%,
          rgba(196, 162, 97, 0.14) 50%,
          rgba(196, 162, 97, 0.20) 100%
        );
        box-shadow:
          inset 0 1px 0 rgba(244,230,200,0.12),
          inset 0 -1px 0 rgba(0,0,0,0.2),
          0 2px 6px rgba(196, 162, 97, 0.18);
      }
      .xd-spine-year {
        font-size: 10px;
        letter-spacing: 0.14em;
        opacity: 0.6;
        font-style: italic;
      }
      .xd-spine-mo {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.22em;
      }
      .xd-spine-count {
        font-size: 11px;
        font-style: italic;
        color: ${K.copperDeep};
        opacity: 0.85;
      }
      .xd-spine.active .xd-spine-count { color: ${K.gold}; opacity: 1; }

      /* ── Style III: Timeline ─────────────────────────────────── */
      .xd-timeline {
        position: relative;
        flex: 1; overflow-y: auto;
        padding: 8px 4px 8px 4px;
      }
      .xd-timeline::-webkit-scrollbar { width: 4px; }
      .xd-timeline::-webkit-scrollbar-thumb { background: rgba(212, 197, 160, 0.15); border-radius: 2px; }
      .xd-timeline-rail {
        position: absolute;
        left: 12px; top: 16px; bottom: 16px;
        width: 1px;
        background: repeating-linear-gradient(
          to bottom,
          ${K.copper} 0 3px,
          transparent 3px 7px
        );
        opacity: 0.45;
      }
      .xd-tl-row {
        position: relative;
        background: transparent;
        border: none;
        display: flex; align-items: center; gap: 14px;
        padding: 8px 6px 8px 0;
        margin-left: 0;
        cursor: pointer;
        color: ${K.paperShade};
        text-align: left;
        transition: color 0.2s;
        width: 100%;
      }
      .xd-tl-dot {
        position: relative;
        flex-shrink: 0;
        width: 9px; height: 9px;
        margin-left: 8px;
        border-radius: 50%;
        background: ${K.shellBg0};
        border: 1.5px solid ${K.copper};
        transition: all 0.22s;
        z-index: 1;
      }
      .xd-tl-row:hover { color: ${K.gold}; }
      .xd-tl-row:hover .xd-tl-dot {
        border-color: ${K.gold};
        box-shadow: 0 0 0 3px rgba(196, 162, 97, 0.12);
      }
      .xd-tl-row.active { color: ${K.gold}; }
      .xd-tl-row.active .xd-tl-dot {
        background: ${K.gold};
        border-color: ${K.gold};
        box-shadow: 0 0 0 4px rgba(196, 162, 97, 0.22), 0 0 10px rgba(196, 162, 97, 0.5);
      }
      .xd-tl-body {
        display: flex; flex-direction: column; gap: 2px;
        line-height: 1.2;
      }
      .xd-tl-mo {
        font-family: 'Playfair Display', 'EB Garamond', serif;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.1em;
      }
      .xd-tl-yr {
        font-size: 10px;
        font-style: italic;
        font-weight: 400;
        color: ${K.copperDeep};
        letter-spacing: 0.14em;
        margin-left: 4px;
      }
      .xd-tl-row.active .xd-tl-yr { color: ${K.gold}; opacity: 0.85; }
      .xd-tl-cn {
        font-family: 'Noto Serif SC', serif;
        font-size: 11.5px;
        opacity: 0.75;
      }
      .xd-tl-cn em {
        font-style: italic;
        color: ${K.copperDeep};
        font-family: 'EB Garamond', serif;
      }
      .xd-tl-row.active .xd-tl-cn em { color: ${K.gold}; }

      /* Scroll container */
      .xd-scroll {
        flex: 1; overflow-y: auto; overflow-x: hidden;
        padding: 32px 16px 60px;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }
      @media (min-width: 641px) {
        .xd-scroll { scroll-behavior: smooth; }
      }
      @media (max-width: 640px) { .xd-scroll { padding: 20px 8px 40px; } }
      .xd-scroll::-webkit-scrollbar { width: 6px; }
      .xd-scroll::-webkit-scrollbar-thumb { background: rgba(196, 162, 97, 0.25); border-radius: 3px; }
      .xd-scroll::-webkit-scrollbar-track { background: transparent; }

      /* Paper sheet */
      .xd-sheet {
        position: relative;
        max-width: 720px;
        margin: 0 auto;
        background: ${K.paper};
        color: ${K.ink};
        padding: 56px 64px 72px;
        border-radius: 2px;
        overflow: hidden;
        box-shadow:
          0 0 0 1px rgba(90, 60, 30, 0.08),
          0 20px 60px -20px rgba(0,0,0,0.55),
          0 2px 8px rgba(0,0,0,0.3);
        animation: xd-sheet-in 0.6s ease-out;
        transform: translateZ(0);
        -webkit-backface-visibility: hidden;
        backface-visibility: hidden;
      }
      @keyframes xd-sheet-in {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @media (max-width: 900px) {
        .xd-sheet { padding: 40px 36px 56px; }
      }
      @media (max-width: 640px) {
        .xd-sheet { padding: 28px 22px 40px; }
      }

      /* Paper grain */
      .xd-paper-grain {
        position: absolute; inset: 0;
        pointer-events: none;
        opacity: 0.18;
        mix-blend-mode: multiply;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E");
        border-radius: 2px;
      }

      /* Cover */
      .xd-cover {
        text-align: center;
        padding: 48px 0 64px;
        border-bottom: 1px solid ${K.rule};
        margin-bottom: 16px;
        position: relative;
      }
      .xd-cover-sub {
        font-family: 'EB Garamond', serif;
        font-size: 11px; font-style: italic;
        color: ${K.copper};
        letter-spacing: 0.4em; text-transform: uppercase;
        opacity: 0.8;
      }
      .xd-cover-title {
        font-family: 'Playfair Display', 'Noto Serif SC', serif;
        font-size: 42px; font-weight: 700;
        color: ${K.inkHead};
        margin: 16px 0 20px;
        letter-spacing: 0.08em;
      }
      @media (max-width: 640px) {
        .xd-cover-title { font-size: 32px; }
      }
      .xd-cover-rule {
        display: flex; align-items: center; justify-content: center; gap: 12px;
        margin-bottom: 14px;
      }
      .xd-cover-rule span:first-child,
      .xd-cover-rule span:last-child {
        width: 80px; height: 1px; background: ${K.copper}; opacity: 0.6;
      }
      .xd-cover-star { color: ${K.copper}; font-size: 14px; opacity: 0.85; }
      .xd-cover-meta {
        font-family: 'EB Garamond', serif;
        font-size: 12px; font-style: italic;
        color: ${K.copperDeep};
        letter-spacing: 0.08em;
      }
      .xd-cover-note {
        margin-top: 24px;
        color: ${K.inkMuted};
        font-size: 14px;
        letter-spacing: 0.04em;
        font-style: italic;
      }

      /* Frontispiece (month divider) */
      .xd-frontispiece {
        text-align: center;
        padding: 56px 0 24px;
        position: relative;
        scroll-margin-top: 20px;
      }
      .xd-frontispiece-year {
        font-family: 'EB Garamond', serif;
        font-size: 12px; font-style: italic;
        color: ${K.copper};
        letter-spacing: 0.35em;
        opacity: 0.75;
      }
      .xd-frontispiece-month-en {
        font-family: 'Playfair Display', serif;
        font-size: 56px; font-weight: 400;
        color: ${K.inkHead};
        letter-spacing: 0.18em;
        margin: 6px 0 10px;
        font-style: italic;
      }
      @media (max-width: 640px) {
        .xd-frontispiece-month-en { font-size: 42px; }
      }
      .xd-frontispiece-rule {
        display: flex; align-items: center; justify-content: center; gap: 10px;
        margin-bottom: 10px;
      }
      .xd-frontispiece-rule span:first-child,
      .xd-frontispiece-rule span:last-child {
        width: 64px; height: 1px; background: ${K.copper}; opacity: 0.5;
      }
      .xd-frontispiece-star { color: ${K.copper}; font-size: 12px; }
      .xd-frontispiece-month-cn {
        font-family: 'Noto Serif SC', serif;
        font-size: 16px; color: ${K.inkMuted};
        letter-spacing: 0.3em;
        margin-bottom: 10px;
      }
      .xd-frontispiece-count {
        font-family: 'EB Garamond', serif;
        font-size: 11px; font-style: italic;
        color: ${K.copperDeep};
        letter-spacing: 0.12em;
        opacity: 0.7;
      }

      /* Entry */
      .xd-entry {
        padding: 24px 0 36px;
        border-bottom: 1px dashed ${K.ruleDim};
        scroll-margin-top: 20px;
      }
      .xd-entry:last-child { border-bottom: none; }

      .xd-entry-head {
        display: flex; justify-content: space-between; align-items: flex-end;
        gap: 16px;
        padding-bottom: 14px;
        margin-bottom: 20px;
        border-bottom: 1px solid ${K.rule};
      }

      .xd-date-block {
        display: flex; align-items: baseline; gap: 4px;
        font-family: 'Playfair Display', serif;
        color: ${K.inkHead};
        line-height: 1;
      }
      .xd-date-day {
        font-size: 42px; font-weight: 700;
        letter-spacing: 0.02em;
      }
      @media (max-width: 640px) {
        .xd-date-day { font-size: 32px; }
      }
      .xd-date-sep {
        font-size: 26px; color: ${K.copper};
        font-style: italic; margin: 0 2px;
      }
      .xd-date-mo {
        font-size: 26px; font-weight: 400;
        color: ${K.copper};
        font-style: italic;
      }

      .xd-date-meta {
        display: flex; flex-direction: column; align-items: flex-end;
        text-align: right;
        gap: 2px;
      }
      .xd-date-weekday {
        font-family: 'EB Garamond', serif;
        font-size: 11px; font-style: italic;
        color: ${K.copper};
        letter-spacing: 0.18em;
      }
      .xd-date-year {
        font-family: 'EB Garamond', serif;
        font-size: 14px;
        color: ${K.inkMuted};
        letter-spacing: 0.1em;
      }

      .xd-title {
        font-family: 'Noto Serif SC', serif;
        font-size: 24px; font-weight: 600;
        color: ${K.inkHead};
        margin: 6px 0 20px;
        letter-spacing: 0.02em;
        line-height: 1.4;
      }
      @media (max-width: 640px) {
        .xd-title { font-size: 20px; }
      }

      .xd-body {
        font-size: 15.5px;
        line-height: 1.95;
        color: ${K.ink};
        font-family: 'Noto Serif SC', 'Songti SC', serif;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .xd-body h2, .xd-body h3, .xd-body blockquote, .xd-body .xd-li {
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      @media (max-width: 640px) {
        .xd-body { font-size: 15px; line-height: 1.9; }
      }
      .xd-body-dim { color: ${K.inkMuted}; font-style: italic; }

      .xd-p {
        margin: 10px 0;
        text-align: justify;
        word-break: break-word;
        text-indent: 2em;
      }
      .xd-p-first {
        text-indent: 0;
      }
      .xd-p-first::first-letter {
        font-family: 'Playfair Display', 'Noto Serif SC', serif;
        font-size: 2.4em;
        float: left;
        line-height: 1;
        padding: 2px 8px 0 0;
        color: ${K.copperDeep};
        font-weight: 600;
      }

      .xd-h2 {
        font-family: 'Noto Serif SC', serif;
        font-size: 18px; font-weight: 600;
        color: ${K.inkHead};
        margin: 28px 0 10px;
        letter-spacing: 0.02em;
        border-bottom: 1px solid ${K.ruleDim};
        padding-bottom: 4px;
      }
      .xd-h3 {
        font-family: 'Noto Serif SC', serif;
        font-size: 16px; font-weight: 600;
        color: ${K.inkHead};
        margin: 22px 0 8px;
        letter-spacing: 0.02em;
      }
      .xd-li {
        display: flex; gap: 8px;
        margin: 4px 0;
        padding-left: 12px;
      }
      .xd-li-dot {
        color: ${K.copper};
        flex-shrink: 0;
      }
      .xd-quote {
        border-left: 2px solid ${K.copper};
        padding: 4px 16px;
        margin: 12px 0;
        color: ${K.inkMuted};
        font-style: italic;
        background: rgba(160, 121, 90, 0.05);
      }
      .xd-flourish {
        display: flex; align-items: center; justify-content: center;
        gap: 12px;
        margin: 26px 0;
        color: ${K.copper};
      }
      .xd-flourish-line {
        height: 1px; width: 60px;
        background: ${K.rule};
      }
      .xd-flourish-mark {
        font-size: 14px;
      }

      /* Signature */
      .xd-sign {
        margin-top: 28px;
        display: flex; align-items: baseline; gap: 8px;
        justify-content: flex-end;
        color: ${K.signature};
        font-family: 'Noto Serif SC', serif;
      }
      .xd-sign-dash { color: ${K.copper}; opacity: 0.7; }
      .xd-sign-name {
        font-size: 15px;
        letter-spacing: 0.1em;
      }
      .xd-sign-note {
        font-family: 'EB Garamond', serif;
        font-size: 11px; font-style: italic;
        color: ${K.copperDeep};
        letter-spacing: 0.06em;
        opacity: 0.75;
      }

      /* Colophon */
      .xd-colophon {
        padding: 48px 0 16px;
        text-align: center;
      }
      .xd-colophon-rule {
        display: flex; align-items: center; justify-content: center;
        gap: 12px; margin-bottom: 10px;
      }
      .xd-colophon-rule span:first-child,
      .xd-colophon-rule span:last-child {
        height: 1px; width: 40px;
        background: ${K.rule};
      }
      .xd-colophon-mark {
        font-family: 'EB Garamond', serif;
        font-size: 11px; font-style: italic;
        color: ${K.copper};
        letter-spacing: 0.3em;
      }
      .xd-colophon-text {
        font-family: 'EB Garamond', serif;
        font-size: 10.5px; font-style: italic;
        color: ${K.inkMuted};
        letter-spacing: 0.12em;
      }

      /* Empty / loading */
      .xd-empty {
        text-align: center;
        padding: 48px 20px;
        color: ${K.inkMuted};
        font-family: 'Noto Serif SC', serif;
        font-size: 14px;
        font-style: italic;
        display: flex; justify-content: center; align-items: center; gap: 10px;
      }
      .xd-empty-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: ${K.copper};
        animation: xd-blink 1.2s ease-in-out infinite;
      }
      @keyframes xd-blink {
        0%, 100% { opacity: 0.3; }
        50%      { opacity: 1; }
      }
    `}</style>
  )
}
