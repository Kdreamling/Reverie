import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { client } from '../api/client'
import { C, FONT } from '../theme'

interface Memory {
  id: string
  content: string
  layer: string
  scene_type: string
  source: string
  tags: string[] | null
  created_at: string
  updated_at: string
  hits: number
}

const LAYER_LABELS: Record<string, string> = {
  core_base: '机格',
  core_living: '记住的事',
  conversation_snapshot: '对话摘要',
  high: '重要记忆',
  ai_journal: '日记',
  event: '事件',
}

const LAYER_ORDER = ['core_base', 'core_living', 'high', 'event', 'conversation_snapshot', 'ai_journal']

function layerLabel(layer: string) {
  return LAYER_LABELS[layer] || layer
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    const bj = new Date(d.getTime() + 8 * 3600000)
    const m = bj.getUTCMonth() + 1
    const day = bj.getUTCDate()
    const h = String(bj.getUTCHours()).padStart(2, '0')
    const min = String(bj.getUTCMinutes()).padStart(2, '0')
    return `${m}月${day}日 ${h}:${min}`
  } catch {
    return iso
  }
}

export default function XiaokeMemoryPage() {
  const navigate = useNavigate()
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Memory | null>(null)
  const [filter, setFilter] = useState<string | null>(null)

  useEffect(() => {
    client.get<{ memories: Memory[] }>('/xiaoke/memories?limit=100')
      .then(res => setMemories(res.memories))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const grouped = (() => {
    const filtered = filter ? memories.filter(m => m.layer === filter) : memories
    const map: Record<string, Memory[]> = {}
    for (const m of filtered) {
      ;(map[m.layer] ??= []).push(m)
    }
    return LAYER_ORDER
      .filter(l => map[l])
      .map(l => ({ layer: l, items: map[l] }))
      .concat(
        Object.keys(map)
          .filter(l => !LAYER_ORDER.includes(l))
          .map(l => ({ layer: l, items: map[l] }))
      )
  })()

  const layerCounts = (() => {
    const counts: Record<string, number> = {}
    for (const m of memories) counts[m.layer] = (counts[m.layer] || 0) + 1
    return counts
  })()

  if (selected) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT }}>
        <div style={{
          padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          paddingTop: 'env(safe-area-inset-top)',
        }}>
          <button
            onClick={() => setSelected(null)}
            style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}
          >
            <ChevronLeft size={20} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>{layerLabel(selected.layer)}</span>
            <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 8 }}>{formatTime(selected.created_at)}</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 40px' }}>
          {selected.tags && selected.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {selected.tags.map(t => (
                <span key={t} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 20,
                  background: C.surface, color: C.textSecondary,
                }}>{t}</span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 14, lineHeight: 1.85, color: C.text, whiteSpace: 'pre-wrap' }}>
            {selected.content}
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: C.textMuted }}>
            来源: {selected.source} · 创建: {formatTime(selected.created_at)}
            {selected.updated_at !== selected.created_at && ` · 更新: ${formatTime(selected.updated_at)}`}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT }}>
      <div style={{
        padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>小克的记忆</span>
          <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 8 }}>{memories.length} 条</span>
        </div>
      </div>

      {/* Layer filter pills */}
      <div style={{
        padding: '10px 16px', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <button
          onClick={() => setFilter(null)}
          style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
            flexShrink: 0, transition: 'all 0.15s',
            background: !filter ? C.accent : C.surface,
            color: !filter ? '#fff' : C.textSecondary,
          }}
        >全部</button>
        {LAYER_ORDER.filter(l => layerCounts[l]).map(l => (
          <button
            key={l}
            onClick={() => setFilter(filter === l ? null : l)}
            style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              flexShrink: 0, transition: 'all 0.15s',
              background: filter === l ? C.accent : C.surface,
              color: filter === l ? '#fff' : C.textSecondary,
            }}
          >{layerLabel(l)} {layerCounts[l]}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 13 }}>loading...</div>
        ) : memories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 13 }}>还没有记忆</div>
        ) : (
          grouped.map(g => (
            <div key={g.layer}>
              {!filter && (
                <div style={{
                  fontSize: 12, fontWeight: 600, color: C.textMuted, padding: '16px 4px 8px',
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>{layerLabel(g.layer)}</div>
              )}
              {g.items.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '14px 14px', marginBottom: 8, borderRadius: 12,
                    background: '#fff', border: `1px solid ${C.border}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = `0 2px 8px ${C.accent}10` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: C.accent, fontWeight: 500 }}>{m.source}</span>
                    <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0, marginLeft: 12 }}>{formatTime(m.created_at)}</span>
                  </div>
                  <p style={{
                    fontSize: 13, color: C.textSecondary, lineHeight: 1.6, margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
                  }}>
                    {m.content}
                  </p>
                  {m.tags && m.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                      {m.tags.slice(0, 3).map(t => (
                        <span key={t} style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 20,
                          background: C.surface, color: C.textMuted,
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
