import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2, Loader, Check, X } from 'lucide-react'
import { fetchMemoriesAPI, createMemoryAPI, updateMemoryAPI, deleteMemoryAPI, type Memory } from '../api/memories'

const LAYER_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'core_base', label: '基石', color: '#f59e0b' },
  { key: 'core_living', label: '活水', color: '#3b82f6' },
  { key: 'scene', label: '场景', color: '#8b5cf6' },
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

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  // Add state
  const [showAdd, setShowAdd] = useState(false)
  const [addContent, setAddContent] = useState('')
  const [addLayer, setAddLayer] = useState('core_living')
  const [addScene, setAddScene] = useState('')
  const [saving, setSaving] = useState(false)

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

  async function handleDelete(id: string) {
    if (!window.confirm('确定要删除这条记忆吗？')) return
    try {
      await deleteMemoryAPI(id)
      setMemories(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      console.error('Delete failed:', err)
      alert('删除失败')
    }
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
      setEditContent('')
    } catch (err) {
      console.error('Update failed:', err)
      alert('更新失败')
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
  }

  async function handleAdd() {
    if (!addContent.trim()) return
    setSaving(true)
    try {
      const newMem = await createMemoryAPI({
        content: addContent.trim(),
        layer: addLayer,
        scene_type: addScene || undefined,
      })
      setMemories(prev => [newMem, ...prev])
      setAddContent('')
      setAddScene('')
      setShowAdd(false)
    } catch (err) {
      console.error('Create failed:', err)
      alert('添加失败')
    } finally {
      setSaving(false)
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
        className="flex items-center gap-2 px-4 w-full text-left transition-colors duration-150 cursor-pointer"
        style={{
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 16,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          color: '#c8d4e8',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <ChevronLeft size={16} strokeWidth={1.8} />
        <span className="text-sm font-medium select-none">Memory</span>
        <span className="text-xs ml-auto" style={{ color: 'rgba(200,212,232,0.4)' }}>
          {memories.length} 条
        </span>
      </button>

      {/* Filter tabs + Add button */}
      <div className="flex items-center gap-1.5 px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
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
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="ml-auto flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer"
          style={{
            width: 26, height: 26,
            background: showAdd ? 'rgba(0,47,167,0.3)' : 'rgba(255,255,255,0.05)',
            color: showAdd ? '#e8edf8' : 'rgba(200,212,232,0.6)',
          }}
          onMouseEnter={e => { if (!showAdd) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={e => { if (!showAdd) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          title="新增记忆"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <textarea
            value={addContent}
            onChange={e => setAddContent(e.target.value)}
            placeholder="输入新的记忆内容…"
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-xs leading-relaxed resize-none outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#c8d4e8',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Layer select */}
            <select
              value={addLayer}
              onChange={e => setAddLayer(e.target.value)}
              className="rounded-md px-2 py-1 text-xs outline-none cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: '#c8d4e8',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {LAYER_OPTIONS.map(o => (
                <option key={o.key} value={o.key} style={{ background: '#0a1a3a' }}>{o.label}</option>
              ))}
            </select>
            {/* Save button */}
            <button
              onClick={handleAdd}
              disabled={!addContent.trim() || saving}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-xs transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ml-auto"
              style={{ background: '#002FA7', color: '#fff' }}
            >
              {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
              <span>保存</span>
            </button>
          </div>
        </div>
      )}

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
              className="group mb-2 rounded-lg px-3 py-2.5"
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

              {/* Content - edit or display */}
              {editingId === mem.id ? (
                <div>
                  <textarea
                    autoFocus
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full rounded-md px-2 py-1.5 text-xs leading-relaxed resize-none outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: '#c8d4e8',
                      border: '1px solid rgba(0,47,167,0.5)',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                  <div className="flex gap-1.5 mt-1.5 justify-end">
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer"
                      style={{ color: 'rgba(200,212,232,0.5)' }}
                    >
                      <X size={11} /> 取消
                    </button>
                    <button
                      onClick={confirmEdit}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer"
                      style={{ color: '#3b82f6' }}
                    >
                      <Check size={11} /> 保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <p className="flex-1 text-xs leading-relaxed" style={{ color: 'rgba(200,212,232,0.85)' }}>
                    {mem.content}
                  </p>
                  {/* Action buttons - visible on hover */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
                    <button
                      onClick={() => startEdit(mem)}
                      className="flex items-center justify-center rounded cursor-pointer"
                      style={{ width: 22, height: 22, color: 'rgba(200,212,232,0.4)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#3b82f6')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,212,232,0.4)')}
                      title="编辑"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(mem.id)}
                      className="flex items-center justify-center rounded cursor-pointer"
                      style={{ width: 22, height: 22, color: 'rgba(200,212,232,0.4)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#e88')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,212,232,0.4)')}
                      title="删除"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
