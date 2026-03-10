import { useState, useEffect } from 'react'
import { ChevronLeft, Loader } from 'lucide-react'
import { fetchMemoriesAPI, type Memory } from '../api/memories'

const LAYER_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'core_base', label: '基石', color: '#f59e0b' },
  { key: 'core_living', label: '活水', color: '#3b82f6' },
  { key: 'scene', label: '场景', color: '#8b5cf6' },
]

const LAYER_COLORS: Record<string, string> = {
  core_base: '#f59e0b',
  core_living: '#3b82f6',
  scene: '#8b5cf6',
}

const LAYER_LABELS: Record<string, string> = {
  core_base: '基石',
  core_living: '活水',
  scene: '场景',
}

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动',
  auto: '自动',
  diary: '日记',
}

interface Props {
  onBack: () => void
}

export default function MemoryPanel({ onBack }: Props) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadMemories()
  }, [filter])

  async function loadMemories() {
    setLoading(true)
    try {
      const layer = filter === 'all' ? undefined : filter
      const data = await fetchMemoriesAPI(layer)
      setMemories(data)
    } catch (err) {
      console.error('Failed to load memories:', err)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a1a3a', color: '#c8d4e8' }}>
      {/* Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-4 w-full text-left transition-colors duration-150 cursor-pointer"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#c8d4e8' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <ChevronLeft size={16} strokeWidth={1.8} />
        <span className="text-sm font-medium select-none">Memory</span>
        <span className="text-xs ml-auto" style={{ color: 'rgba(200,212,232,0.4)' }}>
          {memories.length} 条
        </span>
      </button>

      {/* Filter tabs */}
      <div className="flex gap-1.5 px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {LAYER_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-2.5 py-1 rounded-md text-xs transition-colors duration-150 cursor-pointer"
            style={{
              background: filter === f.key ? 'rgba(0,47,167,0.3)' : 'rgba(255,255,255,0.05)',
              color: filter === f.key ? '#e8edf8' : 'rgba(200,212,232,0.6)',
              border: filter === f.key ? '1px solid rgba(0,47,167,0.5)' : '1px solid transparent',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: 'none' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size={18} className="animate-spin" style={{ color: 'rgba(200,212,232,0.4)' }} />
          </div>
        ) : memories.length === 0 ? (
          <p className="text-center py-12 text-xs" style={{ color: 'rgba(200,212,232,0.35)' }}>
            暂无记忆
          </p>
        ) : (
          memories.map(mem => (
            <div
              key={mem.id}
              className="mb-2 rounded-lg px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {/* Tags row */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{
                    fontSize: 10,
                    background: `${LAYER_COLORS[mem.layer]}20`,
                    color: LAYER_COLORS[mem.layer],
                    border: `1px solid ${LAYER_COLORS[mem.layer]}40`,
                  }}
                >
                  {LAYER_LABELS[mem.layer]}
                </span>
                {mem.scene_type && (
                  <span
                    className="px-1.5 py-0.5 rounded text-xs"
                    style={{ fontSize: 10, color: 'rgba(200,212,232,0.5)', background: 'rgba(255,255,255,0.06)' }}
                  >
                    {mem.scene_type}
                  </span>
                )}
                <span
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{ fontSize: 10, color: 'rgba(200,212,232,0.4)', background: 'rgba(255,255,255,0.04)' }}
                >
                  {SOURCE_LABELS[mem.source] || mem.source}
                </span>
                <span className="ml-auto text-xs" style={{ fontSize: 10, color: 'rgba(200,212,232,0.3)' }}>
                  {formatDate(mem.updated_at)}
                </span>
              </div>

              {/* Content */}
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(200,212,232,0.85)' }}>
                {mem.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
