import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ChevronUp, ChevronDown, RefreshCw,
  Smile, Meh, Frown, Angry, Moon,
  Dumbbell, Bike, Waves, Footprints, Sofa,
  Utensils, CloudSun, Heart, Droplet, BedDouble,
} from 'lucide-react'
import { C } from '../theme'
import { getTodayStatus, updateTodayStatus, fetchWeather, type DayStatus } from '../api/status'
import { getLatestPeriod, createPeriod, deletePeriod, type PeriodLatest } from '../api/period'

const MOODS = [
  { key: 'great', icon: Smile, label: '开心' },
  { key: 'okay', icon: Meh, label: '一般' },
  { key: 'down', icon: Frown, label: '低落' },
  { key: 'angry', icon: Angry, label: '烦躁' },
  { key: 'sleepy', icon: Moon, label: '困' },
] as const

const TRAINING_TYPES = [
  { key: 'strength', icon: Dumbbell, label: '力量' },
  { key: 'run', icon: Footprints, label: '跑步' },
  { key: 'swim', icon: Waves, label: '游泳' },
  { key: 'cycle', icon: Bike, label: '骑行' },
  { key: 'rest', icon: Sofa, label: '休息' },
] as const

interface Props {
  isNight?: boolean
}

export default function StatusBar({ isNight }: Props) {
  const [status, setStatus] = useState<DayStatus | null>(null)
  const [period, setPeriod] = useState<PeriodLatest | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [periodSubmitting, setPeriodSubmitting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    getTodayStatus().then(setStatus).catch(() => {})
    getLatestPeriod().then(setPeriod).catch(() => {})
  }, [])

  const [weatherLoading, setWeatherLoading] = useState(false)

  const refreshWeather = async () => {
    if (weatherLoading) return
    setWeatherLoading(true)
    try {
      const updated = await fetchWeather()
      setStatus(updated)
    } catch { /* silent */ }
    setWeatherLoading(false)
  }

  const save = useCallback((fields: Partial<DayStatus>) => {
    setStatus(prev => prev ? { ...prev, ...fields } : prev)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const updated = await updateTodayStatus(fields)
        setStatus(updated)
      } catch { /* silent */ }
      setSaving(false)
    }, 400)
  }, [])

  const handlePeriodToday = async () => {
    if (periodSubmitting) return
    if (!confirm('今天来了？')) return
    setPeriodSubmitting(true)
    try {
      await createPeriod()
      const fresh = await getLatestPeriod()
      setPeriod(fresh)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(msg.includes('409') ? '今天已经记录过了' : `失败: ${msg}`)
    }
    setPeriodSubmitting(false)
  }

  const handlePeriodUndo = async () => {
    if (periodSubmitting || !period?.latest) return
    if (!confirm(`撤销 ${period.latest.start_date} 的记录？`)) return
    setPeriodSubmitting(true)
    try {
      await deletePeriod(period.latest.id)
      const fresh = await getLatestPeriod()
      setPeriod(fresh)
    } catch { /* silent */ }
    setPeriodSubmitting(false)
  }

  // --- summary line ---
  const summaryParts: string[] = []
  if (status?.mood) {
    const m = MOODS.find(x => x.key === status.mood)
    if (m) summaryParts.push(m.label)
  }
  const mealCount = [status?.meal_b, status?.meal_l, status?.meal_d].filter(Boolean).length
  if (mealCount > 0) summaryParts.push(`${mealCount}/3 餐`)
  if (status?.weather_text) {
    summaryParts.push(`${status.weather_text}${status.weather_temp != null ? ` ${status.weather_temp}°` : ''}`)
  }
  if (status?.sleep_hours) {
    const h = Math.floor(status.sleep_hours)
    const m = Math.round((status.sleep_hours - h) * 60)
    summaryParts.push(`睡${h}h${m > 0 ? m + 'm' : ''}`)
  }
  if (period?.days_since != null) {
    summaryParts.push(`周期第${period.days_since}天`)
  }

  const nText = isNight ? 'rgba(224,213,200,0.9)' : C.text
  const nTextSec = isNight ? 'rgba(224,213,200,0.55)' : C.textMuted
  const nBorder = isNight ? 'rgba(180,150,120,0.08)' : C.border
  const nBorderStrong = isNight ? 'rgba(180,150,120,0.15)' : C.borderStrong
  const nSurface = isNight ? 'rgba(40,35,30,0.6)' : 'rgba(253,250,246,0.65)'
  const nAccent = isNight ? 'rgba(196,154,120,0.85)' : C.accent

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: nTextSec,
    fontFamily: "'JetBrains Mono'",
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: 6,
  }

  const chipBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 12,
    border: `1px dashed ${nBorder}`,
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }

  const chipActive: React.CSSProperties = {
    ...chipBase,
    border: `1.5px solid ${nAccent}`,
    background: isNight ? 'rgba(196,154,120,0.1)' : 'rgba(160,120,90,0.08)',
  }

  const sectionDivider: React.CSSProperties = {
    width: '100%',
    height: 1,
    background: nBorder,
    margin: '10px 0',
  }

  // bjt today
  const bjToday = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const isLatestToday = period?.latest?.start_date === bjToday

  return (
    <div style={{ width: '100%', marginBottom: 6 }}>
      {/* collapsed summary */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          background: nSurface,
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderRadius: expanded ? '14px 14px 0 0' : 14,
          border: `1px solid ${nBorder}`,
          borderBottom: expanded ? `1px dashed ${nBorder}` : `1px solid ${nBorder}`,
          cursor: 'pointer',
          transition: 'all 0.25s ease',
        }}
      >
        <span style={{
          fontSize: 11,
          color: summaryParts.length ? nTextSec : (isNight ? 'rgba(224,213,200,0.3)' : C.textMuted),
          fontFamily: "'Noto Sans SC', sans-serif",
          letterSpacing: '0.02em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {summaryParts.length ? summaryParts.join('  ·  ') : 'tap to set status'}
        </span>
        <span style={{ color: nTextSec, flexShrink: 0, marginLeft: 8, opacity: 0.6 }}>
          {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </span>
      </button>

      {/* expanded panel */}
      <div style={{
        maxHeight: expanded ? '60vh' : 0,
        opacity: expanded ? 1 : 0,
        overflowX: 'hidden',
        overflowY: expanded ? 'auto' : 'hidden',
        transition: 'max-height 0.35s ease, opacity 0.25s ease',
        background: nSurface,
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '0 0 14px 14px',
        border: expanded ? `1px solid ${nBorder}` : '1px solid transparent',
        borderTop: 'none',
        scrollbarWidth: 'none',
      }}>
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* ── Mood ── */}
          <div>
            <div style={labelStyle}>mood</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {MOODS.map(m => {
                const active = status?.mood === m.key
                return (
                  <button
                    key={m.key}
                    title={m.label}
                    onClick={() => save({ mood: active ? null : m.key } as Partial<DayStatus>)}
                    style={active ? chipActive : chipBase}
                  >
                    <m.icon
                      size={16}
                      strokeWidth={active ? 2 : 1.5}
                      color={active ? nAccent : nTextSec}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <div style={sectionDivider} />

          {/* ── Meals ── */}
          <div>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Utensils size={9} strokeWidth={2} />
              meals
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['B', 'L', 'D'] as const).map(meal => {
                const field = `meal_${meal.toLowerCase()}` as 'meal_b' | 'meal_l' | 'meal_d'
                const active = status?.[field] ?? false
                return (
                  <button
                    key={meal}
                    onClick={() => save({ [field]: !active })}
                    style={{
                      ...active ? chipActive : chipBase,
                      width: 40,
                      gap: 0,
                    }}
                  >
                    <span style={{
                      fontSize: 13,
                      fontFamily: "'Space Grotesk'",
                      fontWeight: active ? 600 : 400,
                      color: active ? nAccent : nTextSec,
                    }}>
                      {meal}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={sectionDivider} />

          {/* ── Weather ── */}
          <div>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CloudSun size={9} strokeWidth={2} />
              weather
              <button
                onClick={refreshWeather}
                disabled={weatherLoading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: weatherLoading ? 'wait' : 'pointer',
                  padding: 0,
                  marginLeft: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <RefreshCw
                  size={9}
                  strokeWidth={2}
                  color={nAccent}
                  style={{
                    animation: weatherLoading ? 'spin 1s linear infinite' : 'none',
                    opacity: weatherLoading ? 0.5 : 0.8,
                  }}
                />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {status?.weather_text ? (
                <span style={{
                  fontSize: 13,
                  color: nText,
                  fontFamily: "'Noto Sans SC'",
                }}>
                  {status.weather_text}
                  {status.weather_temp != null && (
                    <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, marginLeft: 6 }}>
                      {status.weather_temp}°C
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: nTextSec, fontFamily: "'Noto Sans SC'" }}>
                  点击刷新自动获取
                </span>
              )}
            </div>
          </div>

          <div style={sectionDivider} />

          {/* ── Training ── */}
          <div>
            <div style={labelStyle}>training</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TRAINING_TYPES.map(t => {
                const active = status?.training_type === t.key
                return (
                  <button
                    key={t.key}
                    title={t.label}
                    onClick={() => save({ training_type: active ? null : t.key } as Partial<DayStatus>)}
                    style={{
                      ...active ? chipActive : chipBase,
                      width: 'auto',
                      padding: '0 10px',
                      gap: 4,
                    }}
                  >
                    <t.icon size={13} strokeWidth={active ? 2 : 1.5} color={active ? nAccent : nTextSec} />
                    <span style={{
                      fontSize: 10,
                      fontFamily: "'Noto Sans SC'",
                      color: active ? nAccent : nTextSec,
                    }}>
                      {t.label}
                    </span>
                  </button>
                )
              })}
            </div>
            {status?.training_type && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {(['planned', 'done'] as const).map(flag => {
                  const field = flag === 'planned' ? 'training_planned' : 'training_done'
                  const active = status?.[field] ?? false
                  return (
                    <button
                      key={flag}
                      onClick={() => save({ [field]: !active })}
                      style={{
                        ...active ? chipActive : chipBase,
                        width: 'auto',
                        height: 28,
                        padding: '0 10px',
                      }}
                    >
                      <span style={{
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono'",
                        color: active ? nAccent : nTextSec,
                        textTransform: 'uppercase',
                      }}>
                        {flag === 'planned' ? 'P' : 'D'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div style={sectionDivider} />

          {/* ── Sleep ── */}
          <div>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
              <BedDouble size={9} strokeWidth={2} />
              sleep
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                step="0.1"
                placeholder="hours"
                value={status?.sleep_hours ?? ''}
                onChange={e => save({ sleep_hours: e.target.value ? parseFloat(e.target.value) : null } as Partial<DayStatus>)}
                style={{
                  width: 64,
                  background: 'transparent',
                  border: `1px solid ${nBorder}`,
                  borderRadius: 10,
                  padding: '6px 8px',
                  fontSize: 12,
                  color: nText,
                  fontFamily: "'Space Grotesk'",
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 10, color: nTextSec }}>h</span>
              <input
                type="number"
                placeholder="deep"
                value={status?.sleep_deep_min ?? ''}
                onChange={e => save({ sleep_deep_min: e.target.value ? parseInt(e.target.value) : null } as Partial<DayStatus>)}
                style={{
                  width: 52,
                  background: 'transparent',
                  border: `1px solid ${nBorder}`,
                  borderRadius: 10,
                  padding: '6px 8px',
                  fontSize: 12,
                  color: nText,
                  fontFamily: "'Space Grotesk'",
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 10, color: nTextSec }}>deep</span>
              <input
                type="number"
                placeholder="core"
                value={status?.sleep_core_min ?? ''}
                onChange={e => save({ sleep_core_min: e.target.value ? parseInt(e.target.value) : null } as Partial<DayStatus>)}
                style={{
                  width: 52,
                  background: 'transparent',
                  border: `1px solid ${nBorder}`,
                  borderRadius: 10,
                  padding: '6px 8px',
                  fontSize: 12,
                  color: nText,
                  fontFamily: "'Space Grotesk'",
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 10, color: nTextSec }}>core</span>
            </div>
          </div>

          <div style={sectionDivider} />

          {/* ── Period ── */}
          <div>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Droplet size={9} strokeWidth={2} />
              cycle
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {period?.latest ? (
                <>
                  <span style={{ fontSize: 14, color: nText, fontFamily: "'Space Grotesk'", fontWeight: 600 }}>
                    {period.days_since}
                    <span style={{ fontSize: 10, color: nTextSec, fontWeight: 400, marginLeft: 2 }}>天</span>
                  </span>
                  {period.avg_cycle_days && (
                    <span style={{ fontSize: 10, color: nTextSec, fontFamily: "'Noto Sans SC'" }}>
                      {period.avg_cycle_days}天周期
                      {period.predicted_next && ` · 预测 ${(() => {
                        const [, m, d] = period.predicted_next.split('-')
                        return `${parseInt(m)}/${parseInt(d)}`
                      })()}`}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 11, color: nTextSec, fontFamily: "'Noto Sans SC'" }}>
                  还没有记录
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {!isLatestToday && (
                  <button
                    onClick={handlePeriodToday}
                    disabled={periodSubmitting}
                    style={{
                      background: 'transparent',
                      color: nAccent,
                      border: `1px solid ${nBorder}`,
                      borderRadius: 8,
                      padding: '4px 10px',
                      fontSize: 10,
                      fontFamily: "'Noto Sans SC'",
                      cursor: periodSubmitting ? 'wait' : 'pointer',
                      opacity: periodSubmitting ? 0.5 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    今天来了
                  </button>
                )}
                {period?.latest && (
                  <button
                    onClick={handlePeriodUndo}
                    disabled={periodSubmitting}
                    style={{
                      background: 'transparent',
                      color: nTextSec,
                      border: `1px solid ${nBorder}`,
                      borderRadius: 8,
                      padding: '4px 10px',
                      fontSize: 10,
                      fontFamily: "'Noto Sans SC'",
                      cursor: periodSubmitting ? 'wait' : 'pointer',
                      opacity: periodSubmitting ? 0.5 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {isLatestToday ? '撤销今天' : '撤销上次'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={sectionDivider} />

          {/* ── Vitals ── */}
          <div>
            <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Heart size={9} strokeWidth={2} />
              vitals
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                placeholder="HR"
                value={status?.resting_hr ?? ''}
                onChange={e => save({ resting_hr: e.target.value ? parseInt(e.target.value) : null } as Partial<DayStatus>)}
                style={{
                  width: 56,
                  background: 'transparent',
                  border: `1px solid ${nBorder}`,
                  borderRadius: 10,
                  padding: '6px 8px',
                  fontSize: 12,
                  color: nText,
                  fontFamily: "'Space Grotesk'",
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 10, color: nTextSec }}>bpm resting</span>
            </div>
          </div>

          {/* saving indicator */}
          {saving && (
            <div style={{
              textAlign: 'right',
              fontSize: 9,
              color: nTextSec,
              fontFamily: "'JetBrains Mono'",
              opacity: 0.6,
              marginTop: 4,
            }}>
              saving...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
