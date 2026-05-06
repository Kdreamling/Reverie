import { useEffect, useState } from 'react'
import { Droplet } from 'lucide-react'
import { getLatestPeriod, createPeriod, deletePeriod, type PeriodLatest } from '../api/period'

interface ThemeC {
  bgCard: string
  border: string
  text: string
  textSoft: string
  textMuted: string
  amber: string
  amberSoft: string
}

interface Props {
  C: ThemeC
}

function fmtDate(iso: string): string {
  // YYYY-MM-DD → M/D
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${parseInt(m)}/${parseInt(d)}`
}

export default function PeriodCard({ C }: Props) {
  const [data, setData] = useState<PeriodLatest | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    try {
      const r = await getLatestPeriod()
      setData(r)
    } catch (e) {
      console.error('[period] load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function logToday() {
    if (submitting) return
    if (!confirm('今天来了？这会写入到记录里，晨马上就能知道。')) return
    setSubmitting(true)
    try {
      await createPeriod()
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(msg.includes('409') || msg.includes('已经记录') ? '今天已经记录过了' : `失败: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function undoLatest() {
    if (submitting || !data?.latest) return
    if (!confirm(`撤销 ${data.latest.start_date} 的记录？`)) return
    setSubmitting(true)
    try {
      await deletePeriod(data.latest.id)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`撤销失败: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  // 今天（北京时区）字符串
  const bjToday = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const isLatestToday = data?.latest?.start_date === bjToday

  const cardStyle: React.CSSProperties = {
    margin: '0 20px 20px',
    padding: 16,
    background: C.bgCard,
    borderRadius: 16,
    border: `1px solid ${C.border}`,
    position: 'relative',
    zIndex: 1,
    transition: 'color 0.35s ease',
    fontFamily: "'Noto Sans SC', sans-serif",
  }

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono'", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Period
        </div>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: data?.latest ? 10 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Droplet size={11} color={C.amberSoft} strokeWidth={2} />
          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono'", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Period
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isLatestToday && (
            <button
              onClick={logToday}
              disabled={submitting}
              style={{
                background: 'transparent',
                color: C.amber,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: '5px 12px',
                fontSize: 11,
                fontFamily: "'Noto Sans SC'",
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              {submitting ? '...' : '今天来了'}
            </button>
          )}
          {data?.latest && (
            <button
              onClick={undoLatest}
              disabled={submitting}
              title={`撤销 ${data.latest.start_date} 的记录`}
              style={{
                background: 'transparent',
                color: C.textMuted,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: '5px 10px',
                fontSize: 11,
                fontFamily: "'Noto Sans SC'",
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              {isLatestToday ? '撤销今天' : '撤销上次'}
            </button>
          )}
        </div>
      </div>

      {data?.latest ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono'", textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>上次</div>
            <div style={{ fontSize: 16, color: C.text, fontFamily: "'Space Grotesk'", fontWeight: 600 }}>
              {fmtDate(data.latest.start_date)}
              <span style={{ fontSize: 11, color: C.textSoft, marginLeft: 6, fontFamily: "'Noto Sans SC'", fontWeight: 400 }}>
                ({data.days_since}天前)
              </span>
            </div>
          </div>
          {data.predicted_next && (
            <div>
              <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono'", textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                {data.is_estimated ? '预测 (估算)' : '预测'}
              </div>
              <div style={{ fontSize: 16, color: C.text, fontFamily: "'Space Grotesk'", fontWeight: 600 }}>
                {fmtDate(data.predicted_next)}
                {data.avg_cycle_days && (
                  <span style={{ fontSize: 11, color: C.textSoft, marginLeft: 6, fontFamily: "'Noto Sans SC'", fontWeight: 400 }}>
                    ({data.avg_cycle_days}天周期)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.textSoft, fontFamily: "'Noto Sans SC'", marginTop: 6 }}>
          还没有记录。来一次后点"今天来了"，晨就能从此记得你的周期。
        </div>
      )}
    </div>
  )
}
