import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, FONT } from '../theme'
import { fetchCalendarDates, fetchCalendarDetail, type CalendarSession } from '../api/sessions'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const SCENE_ICONS: Record<string, string> = {
  daily: '💬',
  reading: '📖',
  plot: '🎭',
  study: '📝',
  pet: '🐾',
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [dates, setDates] = useState<Record<string, CalendarSession[]>>({})
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Fetch calendar data
  useEffect(() => {
    setLoading(true)
    fetchCalendarDates(year, month)
      .then(d => setDates(d.dates))
      .catch(() => setDates({}))
      .finally(() => setLoading(false))
  }, [year, month])

  // Fetch detail when date selected
  useEffect(() => {
    if (!selectedDate) { setDetail(null); return }
    fetchCalendarDetail(selectedDate)
      .then(d => setDetail(d))
      .catch(() => setDetail(null))
  }, [selectedDate])

  // Generate calendar grid
  const firstDay = new Date(year, month - 1, 1)
  let startWeekday = firstDay.getDay() - 1 // Monday = 0
  if (startWeekday < 0) startWeekday = 6
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div style={{ height: '100vh', overflow: 'auto', WebkitOverflowScrolling: 'touch', background: C.bgGradient, fontFamily: FONT, color: C.text }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSecondary, fontSize: 20, padding: 4 }}
        >
          ←
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, flex: 1 }}>回忆日历</h1>
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '8px 0 16px' }}>
        <button onClick={prevMonth} style={navBtnStyle}>‹</button>
        <span style={{ fontSize: 17, fontWeight: 600, color: C.text, minWidth: 120, textAlign: 'center' }}>
          {year}年{month}月
        </span>
        <button onClick={nextMonth} style={navBtnStyle}>›</button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 12px', marginBottom: 4 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, color: C.textMuted, fontWeight: 500, padding: '4px 0' }}>
            {w}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 12px', gap: 2 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const sessions = dates[dateStr]
          const hasData = sessions && sessions.length > 0
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate

          return (
            <button
              key={i}
              onClick={() => hasData && setSelectedDate(isSelected ? null : dateStr)}
              style={{
                aspectRatio: '1',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: isSelected ? `2px solid ${C.accent}` : isToday ? `1px solid ${C.accentWarm}` : '1px solid transparent',
                borderRadius: 12,
                background: isSelected ? C.accent + '10' : isToday ? C.accent + '06' : 'transparent',
                cursor: hasData ? 'pointer' : 'default',
                color: hasData ? C.text : C.textMuted,
                fontWeight: isToday ? 700 : hasData ? 500 : 400,
                fontSize: 15,
                position: 'relative',
                transition: 'all 0.15s',
              }}
            >
              {day}
              {/* Activity dots */}
              {hasData && (
                <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                  {Array.from(new Set(sessions.map(s => s.scene_type))).slice(0, 3).map((scene, j) => (
                    <div key={j} style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: scene === 'daily' ? C.accent : scene === 'reading' ? '#7A8A6A' : '#6A7A9A',
                    }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected date detail */}
      {selectedDate && (
        <div style={{ padding: '20px 16px', marginTop: 8, paddingBottom: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>
            {selectedDate.replace(/-/g, '.')}
          </div>

          {!detail ? (
            <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>加载中...</div>
          ) : detail.sessions.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>这天没有记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {detail.sessions.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/${s.id}?from=calendar`, { replace: true })}
                  style={{
                    background: 'rgba(255,255,255,0.7)',
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Session header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{SCENE_ICONS[s.scene_type] || '💬'}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.text }}>
                      {s.title || '无标题'}
                    </span>
                    <span style={{ fontSize: 11, color: C.textMuted }}>
                      {s.message_count}条
                    </span>
                  </div>

                  {/* Preview messages */}
                  {s.preview && s.preview.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {s.preview.slice(0, 2).map((p: any, j: number) => (
                        <div key={j} style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.4 }}>
                          <span style={{ color: C.accent, fontWeight: 500 }}>Dream: </span>
                          {(p.user_msg || '').slice(0, 60)}{(p.user_msg || '').length > 60 ? '...' : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && Object.keys(dates).length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: C.textMuted, fontSize: 13 }}>
          这个月还没有对话记录
        </div>
      )}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: 'none',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  width: 32, height: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  color: C.textSecondary,
  fontSize: 18,
  fontWeight: 300,
}
