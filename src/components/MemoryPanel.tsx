import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2, Loader, Check, X, Star } from 'lucide-react'
import { fetchMemoriesAPI, createMemoryAPI, updateMemoryAPI, deleteMemoryAPI, type Memory } from '../api/memories'

const LAYER_FILTERS = [
  { key: 'all', label: '全部', color: '#7a8399' },
  { key: 'core_base', label: '基石', color: '#f59e0b' },
  { key: 'core_living', label: '活水', color: '#3b82f6' },
  { key: 'scene', label: '场景', color: '#8b5cf6' },
  { key: 'ai_journal', label: '日记', color: '#10b981' },
]

const LAYER_OPTIONS = [
  { key: 'core_base', label: '基石' },
  { key: 'core_living', label: '活水' },
  { key: 'scene', label: '场景' },
]

const LAYER_COLORS: Record<string, string> = {
  core_base: '#f59e0b',
  core_living: '#3b82f6',
  scene: '#8b5cf6',
  ai_journal: '#10b981',
}

const LAYER_LABELS: Record<string, string> = {
  core_base: '基石',
  core_living: '活水',
  scene: '场景',
  ai_journal: '日记',
}

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动',
  auto: '自动',
  ai_tool: 'AI',
  diary: '日记',
}

interface Props {
  onBack: () => void
}

export default function MemoryPanel({ onBack }: Props) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addContent, setAddContent] = useState('')
  const [addLayer, setAddLayer] = useState('core_living')
  const [addScene, setAddScene] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadMemories() }, [filter])

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

  async function handleDelete(id: string) {
    if (!window.confirm('确定要删除这条记忆吗？')) return
    try {
      await deleteMemoryAPI(id)
      setMemories(prev => prev.filter(m => m.id !== id))
    } catch { alert('删除失败') }
  }

  function startEdit(mem: Memory) {
    setEditingId(mem.id)
    setEditContent(mem.content)
  }

  async function confirmEdit() {
    if (!editingId || !editContent.trim()) return
    try {
      await updateMemoryAPI(editingId, { content: editContent.trim() })
      setMemories(prev => prev.map(m => m.id === editingId ? { ...m, content: editContent.trim() } : m))
      setEditingId(null)
    } catch { alert('更新失败') }
  }

  async function handleAdd() {
    if (!addContent.trim()) return
    setSaving(true)
    try {
      const newMem = await createMemoryAPI({ content: addContent.trim(), layer: addLayer, scene_type: addScene || undefined })
      setMemories(prev => [newMem, ...prev])
      setAddContent('')
      setAddScene('')
      setShowAdd(false)
    } catch { alert('添加失败') }
    finally { setSaving(false) }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const layerColor = (layer: string) => LAYER_COLORS[layer] || '#7a8399'

  return (
    <div className="flex flex-col h-full" style={{ background: '#fafbfd', color: '#1a1f2e' }}>

      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-5 md:px-4"
        style={{
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 16,
          borderBottom: '1px solid #e8ecf5',
        }}
      >
        <button onClick={onBack} className="flex items-center justify-center cursor-pointer" style={{ color: '#7a8399' }}>
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <span className="text-base md:text-sm font-medium select-none">Memory</span>
        <span className="text-xs ml-auto" style={{ color: '#9aa3b8' }}>
          {memories.length} 条
        </span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center justify-center rounded-lg cursor-pointer"
          style={{
            width: 32, height: 32,
            background: showAdd ? '#002FA7' : '#eef1f8',
            color: showAdd ? '#fff' : '#002FA7',
          }}
          title="新增记忆"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none', borderBottom: '1px solid #e8ecf5' }}>
        {LAYER_FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer flex-shrink-0"
              style={{
                background: active ? `${f.color}15` : '#f0f2f8',
                color: active ? f.color : '#7a8399',
                border: active ? `1.5px solid ${f.color}40` : '1.5px solid transparent',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-4 py-4" style={{ borderBottom: '1px solid #e8ecf5', background: '#fff' }}>
          <textarea
            autoFocus
            value={addContent}
            onChange={e => setAddContent(e.target.value)}
            placeholder="写下新的记忆…"
            rows={3}
            className="w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-none outline-none"
            style={{ background: '#f5f7fc', color: '#1a1f2e', border: '1.5px solid #dde2ed' }}
            onFocus={e => (e.currentTarget.style.borderColor = '#002FA7')}
            onBlur={e => (e.currentTarget.style.borderColor = '#dde2ed')}
          />
          <div className="flex items-center gap-3 mt-3">
            <select
              value={addLayer}
              onChange={e => setAddLayer(e.target.value)}
              className="rounded-lg px-3 py-2 text-xs outline-none cursor-pointer"
              style={{ background: '#f0f2f8', color: '#5a6a8a', border: '1px solid #e8ecf5' }}
            >
              {LAYER_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <div className="flex-1" />
            <button
              onClick={() => { setShowAdd(false); setAddContent('') }}
              className="px-4 py-2 rounded-lg text-xs cursor-pointer"
              style={{ color: '#7a8399' }}
            >
              取消
            </button>
            <button
              onClick={handleAdd}
              disabled={!addContent.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40"
              style={{ background: '#002FA7', color: '#fff' }}
            >
              {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: 'none' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader size={20} className="animate-spin" style={{ color: '#b0b8c8' }} />
          </div>
        ) : memories.length === 0 ? (
          <p className="text-center py-16 text-sm" style={{ color: '#b0b8c8' }}>
            暂无记忆
          </p>
        ) : (
          memories.map(mem => {
            const isEditing = editingId === mem.id
            const hasWeight = (mem.ai_weight ?? 0) > 0

            return (
              <div
                key={mem.id}
                className="mb-3 rounded-xl overflow-hidden"
                style={{
                  background: '#fff',
                  border: hasWeight ? `1.5px solid ${layerColor(mem.layer)}30` : '1px solid #e8ecf5',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                {/* Tags row */}
                <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 flex-wrap">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      fontSize: 11,
                      background: `${layerColor(mem.layer)}12`,
                      color: layerColor(mem.layer),
                    }}
                  >
                    {LAYER_LABELS[mem.layer] || mem.layer}
                  </span>
                  {mem.scene_type && (
                    <span className="px-2 py-0.5 rounded-full text-xs" style={{ fontSize: 11, color: '#7a8399', background: '#f0f2f8' }}>
                      {mem.scene_type}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ fontSize: 11, color: '#9aa3b8', background: '#f5f7fc' }}>
                    {SOURCE_LABELS[mem.source] || mem.source}
                  </span>
                  {/* Tags from memory */}
                  {mem.tags && mem.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs" style={{ fontSize: 11, color: '#002FA7', background: '#eef1f8' }}>
                      {tag}
                    </span>
                  ))}
                  {/* Importance star */}
                  {hasWeight && (
                    <Star size={12} fill="#f59e0b" stroke="#f59e0b" style={{ marginLeft: 2 }} />
                  )}
                  <span className="ml-auto text-xs" style={{ color: '#b0b8c8', fontSize: 11 }}>
                    {formatDate(mem.updated_at)}
                  </span>
                </div>

                {/* Content */}
                <div className="px-4 pb-3 pt-1">
                  {isEditing ? (
                    <div>
                      <textarea
                        autoFocus
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl px-3 py-2.5 text-sm leading-relaxed resize-none outline-none"
                        style={{ background: '#f5f7fc', color: '#1a1f2e', border: '1.5px solid #002FA7' }}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                      />
                      <div className="flex gap-2 mt-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                          style={{ color: '#7a8399' }}
                        >
                          <X size={12} /> 取消
                        </button>
                        <button
                          onClick={confirmEdit}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                          style={{ background: '#002FA7', color: '#fff' }}
                        >
                          <Check size={12} /> 保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <p className="flex-1 text-sm leading-relaxed" style={{ color: '#3a4255' }}>
                        {mem.content}
                      </p>
                      {/* Action buttons — always visible */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => startEdit(mem)}
                          className="flex items-center justify-center rounded-lg cursor-pointer transition-colors"
                          style={{ width: 28, height: 28, color: '#b0b8c8', background: '#f5f7fc' }}
                          title="编辑"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(mem.id)}
                          className="flex items-center justify-center rounded-lg cursor-pointer transition-colors"
                          style={{ width: 28, height: 28, color: '#b0b8c8', background: '#f5f7fc' }}
                          title="删除"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
