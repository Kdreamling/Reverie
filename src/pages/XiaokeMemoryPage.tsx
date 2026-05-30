import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Sparkles, Trash2 } from 'lucide-react'
import { C } from '../theme'
import { client } from '../api/client'

interface Memory {
  id: string
  content: string
  layer: string
  tags: string[]
  source: string
  created_at: string
}

const LAYER_META: Record<string, { label: string; desc: string; color: string }> = {
  core_living:            { label: '记住的事',  desc: '小克想留下的记忆',       color: C.accent },
  conversation_snapshot:  { label: '对话记录',  desc: '每次对话的工作日志',     color: C.textSecondary },
  core_base:              { label: '核心认知',  desc: '关于自己的基础认知',     color: '#7A8E98' },
  ai_journal:             { label: '日记',      desc: '小克写的日记',           color: '#8A9677' },
}

const LAYER_ORDER = ['core_living', 'conversation_snapshot', 'core_base', 'ai_journal']

function layerOf(key: string) {
  return LAYER_META[key] ?? { label: key, desc: '', color: C.textMuted }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}`

  if (diffDays === 0) return `今天 ${time}`
  if (diffDays === 1) return `昨天 ${time}`
  if (diffDays < 7) return `${diffDays}天前`

  const m = d.getMonth() + 1
  const day = d.getDate()
  if (d.getFullYear() === now.getFullYear()) return `${m}月${day}日`
  return `${d.getFullYear()}/${m}/${day}`
}

export default function XiaokeMemoryPage() {
  const navigate = useNavigate()
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeLayer, setActiveLayer] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    client.get<{ memories: Memory[] }>('/xiaoke/memories?limit=100')
      .then(d => setMemories(d.memories))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function handleDelete(id: string) {
    if (!confirm('删除这条记忆？')) return
    setDeleting(id)
    client.delete(`/xiaoke/memories/${id}`)
      .then(() => setMemories(ms => ms.filter(m => m.id !== id)))
      .catch(() => alert('删除失败'))
      .finally(() => setDeleting(null))
  }

  const grouped = LAYER_ORDER
    .map(key => ({
      key,
      ...layerOf(key),
      items: memories.filter(m => m.layer === key),
    }))
    .filter(g => g.items.length > 0)

  const otherLayers = memories
    .filter(m => !LAYER_ORDER.includes(m.layer))
    .reduce((acc, m) => {
      const g = acc.find(a => a.key === m.layer)
      if (g) g.items.push(m)
      else acc.push({ key: m.layer, ...layerOf(m.layer), items: [m] })
      return acc
    }, [] as { key: string; label: string; desc: string; color: string; items: Memory[] }[])

  const allGroups = [...grouped, ...otherLayers]
  const visibleGroups = activeLayer ? allGroups.filter(g => g.key === activeLayer) : allGroups

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: C.bg,
    }}>
      {/* Header */}
      <div
        style={{
          flexShrink: 0, zIndex: 20,
          background: C.glassStrong,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.accent, display: 'flex' }}
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </button>
          <Sparkles size={18} strokeWidth={1.5} style={{ color: C.accent }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: '0.01em' }}>
            小克的记忆
          </span>
          <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 'auto' }}>
            {memories.length} 条
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 80px' }}>
        {/* Layer filter chips */}
        {allGroups.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <Chip
              label="全部"
              active={activeLayer === null}
              color={C.accent}
              onClick={() => setActiveLayer(null)}
            />
            {allGroups.map(g => (
              <Chip
                key={g.key}
                label={`${g.label} (${g.items.length})`}
                active={activeLayer === g.key}
                color={g.color}
                onClick={() => setActiveLayer(activeLayer === g.key ? null : g.key)}
              />
            ))}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: C.textMuted, fontSize: 13 }}>
            加载中…
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 60, color: C.errorText, fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && !error && visibleGroups.map(group => (
          <div key={group.key} style={{ marginBottom: 28 }}>
            {/* Group header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: group.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{group.label}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>{group.desc}</span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.items.map(m => {
                const expanded = expandedId === m.id
                const isLong = m.content.length > 120
                const displayText = expanded || !isLong ? m.content : m.content.slice(0, 120) + '…'
                const isReflection = m.tags?.includes('reflection')

                return (
                  <div
                    key={m.id}
                    style={{
                      background: isReflection
                        ? `linear-gradient(135deg, rgba(196,154,120,0.06), rgba(212,184,150,0.1))`
                        : C.surface,
                      borderRadius: 12,
                      padding: '14px 16px',
                      border: `1px solid ${isReflection ? C.accent + '20' : C.border}`,
                      transition: 'all 0.15s ease',
                      cursor: isLong ? 'pointer' : 'default',
                    }}
                    onClick={() => isLong && setExpandedId(expanded ? null : m.id)}
                  >
                    <div style={{
                      fontSize: 13.5,
                      lineHeight: 1.7,
                      color: C.text,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {displayText}
                    </div>

                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: 10, paddingTop: 8,
                      borderTop: `1px solid ${C.border}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: C.textMuted }}>
                          {formatTime(m.created_at)}
                        </span>
                        {isReflection && (
                          <span style={{
                            fontSize: 10, color: C.accent,
                            padding: '1px 6px', borderRadius: 4,
                            background: C.accent + '12',
                          }}>
                            记忆
                          </span>
                        )}
                        {m.source === 'manual' && !isReflection && (
                          <span style={{
                            fontSize: 10, color: C.textMuted,
                            padding: '1px 6px', borderRadius: 4,
                            background: C.surface,
                          }}>
                            手动
                          </span>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(m.id) }}
                        disabled={deleting === m.id}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: 4, color: C.textMuted, opacity: deleting === m.id ? 0.3 : 0.5,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {!loading && !error && memories.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80, color: C.textMuted, fontSize: 13 }}>
            还没有记忆
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

function Chip({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 500,
        padding: '5px 12px', borderRadius: 20,
        border: `1px solid ${active ? color + '40' : C.border}`,
        background: active ? color + '10' : 'transparent',
        color: active ? color : C.textSecondary,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  )
}
