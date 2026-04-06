import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2, Loader, Check, X, Star, Search, CheckCircle, Eye } from 'lucide-react'
import { fetchMemoriesAPI, createMemoryAPI, updateMemoryAPI, deleteMemoryAPI, type Memory } from '../api/memories'
import { fetchProfilesAPI, createProfileAPI, updateProfileAPI, deleteProfileAPI, type Profile } from '../api/profiles'
import { C } from '../theme'
import { toast } from '../stores/toastStore'

const LAYER_FILTERS = [
  { key: 'all', label: '全部', color: C.textSecondary },
  { key: 'core_base', label: '基石', color: '#C49A78' },
  { key: 'core_living', label: '活水', color: '#7A9A8A' },
  { key: 'scene', label: '场景', color: '#9A8A7A' },
  { key: 'ai_journal', label: '日记', color: '#8A7A6A' },
]

const LAYER_OPTIONS = [
  { key: 'core_base', label: '基石' },
  { key: 'core_living', label: '活水' },
  { key: 'scene', label: '场景' },
]

const LAYER_COLORS: Record<string, string> = {
  core_base: '#C49A78',
  core_living: '#7A9A8A',
  scene: '#9A8A7A',
  ai_journal: '#8A7A6A',
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

/** Bottom sheet for editing / adding memories */
function MemorySheet({
  mode,
  memory,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit'
  memory?: Memory
  onClose: () => void
  onSave: (data: { content: string; layer: string; scene_type?: string }) => Promise<void>
}) {
  const [content, setContent] = useState(memory?.content ?? '')
  const [layer, setLayer] = useState<string>(memory?.layer ?? 'core_living')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  async function handleSave() {
    if (!content.trim()) return
    setSaving(true)
    try {
      await onSave({ content: content.trim(), layer })
      onClose()
    } catch {
      toast.error(mode === 'add' ? '添加失败' : '更新失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(50,42,34,0.4)' }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl flex flex-col"
        style={{
          background: C.bg,
          maxHeight: '75vh',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.textMuted, opacity: 0.4 }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <span className="text-sm font-medium" style={{ color: C.text }}>
            {mode === 'add' ? '新增记忆' : '编辑记忆'}
          </span>
          <button onClick={onClose} className="cursor-pointer p-1" style={{ color: C.textMuted }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="写下记忆…"
            rows={6}
            className="w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-none outline-none"
            style={{
              background: C.surface,
              color: C.text,
              border: `1.5px solid ${C.border}`,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
            onBlur={e => (e.currentTarget.style.borderColor = `rgba(180,150,120,0.12)`)}
          />

          {/* Layer selector (only for add, or if editing non-journal) */}
          {(mode === 'add' || (memory && memory.layer !== 'ai_journal')) && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs" style={{ color: C.textSecondary }}>层级</span>
              <div className="flex gap-1.5">
                {LAYER_OPTIONS.map(o => {
                  const active = layer === o.key
                  const lc = LAYER_COLORS[o.key]
                  return (
                    <button
                      key={o.key}
                      onClick={() => setLayer(o.key)}
                      className="px-3 py-1 rounded-full text-xs cursor-pointer transition-all"
                      style={{
                        background: active ? lc + '18' : 'transparent',
                        color: active ? lc : C.textMuted,
                        border: `1px solid ${active ? lc + '40' : C.border}`,
                      }}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs cursor-pointer"
            style={{ color: C.textSecondary }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 transition-colors"
            style={{ background: C.accent, color: '#fff' }}
          >
            {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
            保存
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Profile Sheet (add/edit) ────────────────────────────────────────────────

const PROFILE_TYPE_OPTIONS = [
  { key: 'user', label: 'Dream' },
  { key: 'model', label: 'Claude' },
]

const CATEGORY_OPTIONS = ['性格', '习惯', '情感', '沟通', '偏好', '其他']

function ProfileSheet({
  mode,
  profile,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit'
  profile?: Profile
  onClose: () => void
  onSave: (data: { content: string; profile_type: string; category: string; last_evidence?: string }) => Promise<void>
}) {
  const [content, setContent] = useState(profile?.content ?? '')
  const [profileType, setProfileType] = useState<string>(profile?.profile_type ?? 'user')
  const [category, setCategory] = useState(profile?.category ?? '其他')
  const [evidence, setEvidence] = useState(profile?.last_evidence ?? '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  async function handleSave() {
    if (!content.trim()) return
    setSaving(true)
    try {
      await onSave({ content: content.trim(), profile_type: profileType, category, last_evidence: evidence.trim() || undefined })
      onClose()
    } catch {
      toast.error(mode === 'add' ? '添加失败' : '更新失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(50,42,34,0.4)' }} onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl flex flex-col" style={{ background: C.bg, maxHeight: '80vh', paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -4px 20px rgba(0,0,0,0.1)' }}>
        <div className="flex justify-center pt-3 pb-2">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.textMuted, opacity: 0.4 }} />
        </div>
        <div className="flex items-center justify-between px-5 pb-3">
          <span className="text-sm font-medium" style={{ color: C.text }}>
            {mode === 'add' ? '新增观察笔记' : '编辑观察笔记'}
          </span>
          <button onClick={onClose} className="cursor-pointer p-1" style={{ color: C.textMuted }}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 space-y-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="写下观察…"
            rows={4}
            className="w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-none outline-none"
            style={{ background: C.surface, color: C.text, border: `1.5px solid ${C.border}` }}
            onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(180,150,120,0.12)')}
          />
          {/* Type selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: C.textSecondary }}>对象</span>
            <div className="flex gap-1.5">
              {PROFILE_TYPE_OPTIONS.map(o => (
                <button
                  key={o.key}
                  onClick={() => setProfileType(o.key)}
                  className="px-3 py-1 rounded-full text-xs cursor-pointer transition-all"
                  style={{
                    background: profileType === o.key ? C.accent + '18' : 'transparent',
                    color: profileType === o.key ? C.accent : C.textMuted,
                    border: `1px solid ${profileType === o.key ? C.accent + '40' : C.border}`,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {/* Category selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: C.textSecondary }}>分类</span>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORY_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className="px-2.5 py-1 rounded-full text-xs cursor-pointer transition-all"
                  style={{
                    background: category === c ? C.accent + '18' : 'transparent',
                    color: category === c ? C.accent : C.textMuted,
                    border: `1px solid ${category === c ? C.accent + '40' : C.border}`,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          {/* Evidence */}
          <input
            value={evidence}
            onChange={e => setEvidence(e.target.value)}
            placeholder="依据（可选，如：04-06 对话中提到…）"
            className="w-full rounded-xl px-4 py-2.5 text-xs outline-none"
            style={{ background: C.surface, color: C.text, border: `1.5px solid ${C.border}` }}
          />
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ color: C.textSecondary }}>取消</button>
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 transition-colors"
            style={{ background: C.accent, color: '#fff' }}
          >
            {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
            保存
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Profiles Tab ────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = { user: '#7A9A8A', model: '#9A7A8A' }
const TYPE_LABELS: Record<string, string> = { user: 'Dream', model: 'Claude' }
const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: '#7A9A8A18', color: '#7A9A8A', label: '生效中' },
  pending: { bg: '#C49A7818', color: '#C49A78', label: '待审核' },
}

function ProfilesTab({ addTrigger }: { addTrigger: number }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sheetMode, setSheetMode] = useState<'add' | 'edit' | null>(null)
  const [sheetProfile, setSheetProfile] = useState<Profile | undefined>()

  useEffect(() => { loadProfiles() }, [typeFilter])

  // External add trigger
  useEffect(() => {
    if (addTrigger > 0) {
      setSheetProfile(undefined)
      setSheetMode('add')
    }
  }, [addTrigger])

  async function loadProfiles() {
    setLoading(true)
    try {
      const type = typeFilter === 'all' ? undefined : typeFilter
      const data = await fetchProfilesAPI(type)
      setProfiles(data)
    } catch (err) {
      console.error('Failed to load profiles:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(id: string) {
    try {
      await updateProfileAPI(id, { status: 'active' })
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: 'active' } : p))
    } catch { toast.error('审核失败') }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('确定要删除这条笔记吗？')) return
    try {
      await deleteProfileAPI(id)
      setProfiles(prev => prev.filter(p => p.id !== id))
    } catch { toast.error('删除失败') }
  }

  async function handleSheetSave(data: { content: string; profile_type: string; category: string; last_evidence?: string }) {
    if (sheetMode === 'edit' && sheetProfile) {
      await updateProfileAPI(sheetProfile.id, { content: data.content, category: data.category, last_evidence: data.last_evidence })
      setProfiles(prev => prev.map(p => p.id === sheetProfile.id ? { ...p, content: data.content, category: data.category, last_evidence: data.last_evidence ?? p.last_evidence } : p))
    } else {
      const newP = await createProfileAPI(data)
      setProfiles(prev => [newP, ...prev])
    }
  }

  const pendingCount = profiles.filter(p => p.status === 'pending').length

  return (
    <>
      {/* Type filter + add button */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
        {[
          { key: 'all', label: '全部' },
          { key: 'user', label: 'Dream' },
          { key: 'model', label: 'Claude' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer flex-shrink-0"
            style={{
              background: typeFilter === f.key ? `${C.accent}15` : C.surface,
              color: typeFilter === f.key ? C.accent : C.textMuted,
              border: typeFilter === f.key ? `1.5px solid ${C.accent}40` : '1.5px solid transparent',
            }}
          >
            {f.label}
          </button>
        ))}
        {pendingCount > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#C49A7818', color: '#C49A78' }}>
            {pendingCount} 待审核
          </span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: 'none' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader size={20} className="animate-spin" style={{ color: C.textMuted }} />
          </div>
        ) : profiles.length === 0 ? (
          <p className="text-center py-16 text-sm" style={{ color: C.textMuted }}>暂无观察笔记</p>
        ) : (
          profiles.map(p => {
            const isExpanded = expandedId === p.id
            const tc = TYPE_COLORS[p.profile_type] || C.textSecondary
            const ss = STATUS_STYLES[p.status] || STATUS_STYLES.pending
            const isLong = p.content.length > 100

            return (
              <div
                key={p.id}
                className="mb-2.5 rounded-xl overflow-hidden flex"
                style={{ background: C.sidebarBg, border: `1px solid ${p.status === 'pending' ? '#C49A7840' : C.border}` }}
              >
                <div style={{ width: 3, flexShrink: 0, background: tc, borderRadius: '3px 0 0 3px' }} />
                <div className="flex-1 min-w-0 px-3.5 py-3">
                  {/* Top row */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="px-2 py-0.5 rounded-full font-medium" style={{ fontSize: 10, background: tc + '15', color: tc }}>
                      {TYPE_LABELS[p.profile_type] || p.profile_type}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full" style={{ fontSize: 10, background: C.surface, color: C.textMuted }}>
                      {p.category}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full" style={{ fontSize: 10, background: ss.bg, color: ss.color }}>
                      {ss.label}
                    </span>
                    {p.source === 'manual' && (
                      <span className="px-1.5 py-0.5 rounded-full" style={{ fontSize: 10, background: C.surface, color: C.textMuted }}>手动</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <p
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{
                        color: C.text,
                        ...(isLong && !isExpanded ? {
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        } : {}),
                      }}
                    >
                      {p.content}
                    </p>
                    {isLong && !isExpanded && (
                      <span className="text-xs" style={{ color: C.accent }}>展开</span>
                    )}
                  </div>

                  {/* Evidence */}
                  {isExpanded && p.last_evidence && (
                    <p className="text-xs mt-1.5" style={{ color: C.textMuted }}>
                      依据：{p.last_evidence}
                    </p>
                  )}

                  {/* Actions */}
                  {isExpanded && (
                    <div className="flex gap-2 mt-2.5 justify-end">
                      {p.status === 'pending' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleApprove(p.id) }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                          style={{ color: '#7A9A8A', background: '#7A9A8A15' }}
                        >
                          <CheckCircle size={11} /> 通过
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setSheetProfile(p); setSheetMode('edit') }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                        style={{ color: C.textSecondary, background: C.surface }}
                      >
                        <Pencil size={11} /> 编辑
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                        style={{ color: C.errorText, background: C.errorBg }}
                      >
                        <Trash2 size={11} /> 删除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {sheetMode && (
        <ProfileSheet
          mode={sheetMode}
          profile={sheetProfile}
          onClose={() => setSheetMode(null)}
          onSave={handleSheetSave}
        />
      )}
    </>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function MemoryPanel({ onBack }: Props) {
  const [tab, setTab] = useState<'memories' | 'profiles'>('memories')
  const [profileAddTrigger, setProfileAddTrigger] = useState(0)
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Sheet state
  const [sheetMode, setSheetMode] = useState<'add' | 'edit' | null>(null)
  const [sheetMemory, setSheetMemory] = useState<Memory | undefined>()

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
    } catch { toast.error('删除失败') }
  }

  function openEdit(mem: Memory) {
    setSheetMemory(mem)
    setSheetMode('edit')
  }

  function openAdd() {
    setSheetMemory(undefined)
    setSheetMode('add')
  }

  async function handleSheetSave(data: { content: string; layer: string }) {
    if (sheetMode === 'edit' && sheetMemory) {
      await updateMemoryAPI(sheetMemory.id, { content: data.content })
      setMemories(prev => prev.map(m => m.id === sheetMemory.id ? { ...m, content: data.content } : m))
    } else {
      const newMem = await createMemoryAPI(data)
      setMemories(prev => [newMem, ...prev])
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const layerColor = (layer: string) => LAYER_COLORS[layer] || C.textSecondary

  // Simple client-side search filter
  const filtered = searchQuery.trim()
    ? memories.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : memories

  return (
    <div className="flex flex-col h-full" style={{ background: C.bg, color: C.text }}>

      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-5 md:px-4"
        style={{
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 12,
        }}
      >
        <button onClick={onBack} className="flex items-center justify-center cursor-pointer" style={{ color: C.textSecondary }}>
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <span className="text-base md:text-sm font-medium select-none">Memory</span>
        <span className="text-xs ml-auto" style={{ color: C.textMuted }}>
          {tab === 'memories' ? `${filtered.length} 条` : ''}
        </span>
        <button
          onClick={tab === 'memories' ? openAdd : () => setProfileAddTrigger(n => n + 1)}
          className="flex items-center justify-center rounded-lg cursor-pointer transition-colors"
          style={{
            width: 32, height: 32,
            background: C.surface,
            color: C.accent,
          }}
          title={tab === 'memories' ? '新增记忆' : '新增笔记'}
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Top-level tabs */}
      <div className="flex px-5 gap-4" style={{ borderBottom: `1px solid ${C.border}` }}>
        {([
          { key: 'memories' as const, label: '记忆', icon: Star },
          { key: 'profiles' as const, label: '观察笔记', icon: Eye },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 pb-2.5 text-xs font-medium cursor-pointer transition-colors"
            style={{
              color: tab === t.key ? C.accent : C.textMuted,
              borderBottom: tab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profiles' ? (
        <ProfilesTab addTrigger={profileAddTrigger} />
      ) : (
      <>
      {/* Search bar */}
      <div className="px-4 pt-3 pb-1">
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <Search size={14} style={{ color: C.textMuted, flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索记忆…"
            className="flex-1 border-none outline-none bg-transparent text-sm"
            style={{ color: C.text }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="cursor-pointer" style={{ color: C.textMuted }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto"
        style={{ scrollbarWidth: 'none', borderBottom: `1px solid ${C.border}` }}
      >
        {LAYER_FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer flex-shrink-0"
              style={{
                background: active ? `${f.color}15` : C.surface,
                color: active ? f.color : C.textMuted,
                border: active ? `1.5px solid ${f.color}40` : '1.5px solid transparent',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: 'none' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader size={20} className="animate-spin" style={{ color: C.textMuted }} />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center py-16 text-sm" style={{ color: C.textMuted }}>
            {searchQuery ? '没有匹配的记忆' : '暂无记忆'}
          </p>
        ) : (
          filtered.map(mem => {
            const hasWeight = (mem.ai_weight ?? 0) > 0
            const isExpanded = expandedId === mem.id
            const lc = layerColor(mem.layer)
            const contentLines = mem.content.split('\n')
            const isLong = mem.content.length > 120 || contentLines.length > 3

            return (
              <div
                key={mem.id}
                className="mb-2.5 rounded-xl overflow-hidden flex"
                style={{
                  background: C.sidebarBg,
                  border: `1px solid ${C.border}`,
                }}
              >
                {/* Left color bar */}
                <div style={{ width: 3, flexShrink: 0, background: lc, borderRadius: '3px 0 0 3px' }} />

                {/* Content area */}
                <div className="flex-1 min-w-0 px-3.5 py-3">
                  {/* Top row: layer tag + date */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span
                      className="px-2 py-0.5 rounded-full font-medium"
                      style={{ fontSize: 10, background: lc + '15', color: lc }}
                    >
                      {LAYER_LABELS[mem.layer] || mem.layer}
                    </span>
                    {mem.source !== 'manual' && (
                      <span className="px-1.5 py-0.5 rounded-full" style={{ fontSize: 10, color: C.textMuted, background: C.surface }}>
                        {SOURCE_LABELS[mem.source] || mem.source}
                      </span>
                    )}
                    {hasWeight && (
                      <Star size={11} fill="#C49A78" stroke="#C49A78" />
                    )}
                    <span className="ml-auto" style={{ color: C.textMuted, fontSize: 10 }}>
                      {formatDate(mem.updated_at)}
                    </span>
                  </div>

                  {/* Content text */}
                  <div
                    className="cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : mem.id)}
                  >
                    <p
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{
                        color: C.text,
                        ...(isLong && !isExpanded ? {
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        } : {}),
                      }}
                    >
                      {mem.content}
                    </p>
                    {isLong && !isExpanded && (
                      <span className="text-xs" style={{ color: C.accent }}>展开</span>
                    )}
                  </div>

                  {/* Tags row (show when expanded) */}
                  {isExpanded && mem.tags && mem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {mem.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-full"
                          style={{ fontSize: 10, color: C.accent, background: C.accent + '12' }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action buttons (show when expanded) */}
                  {isExpanded && (
                    <div className="flex gap-2 mt-2.5 justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(mem) }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                        style={{ color: C.textSecondary, background: C.surface }}
                      >
                        <Pencil size={11} /> 编辑
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(mem.id) }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                        style={{ color: C.errorText, background: C.errorBg }}
                      >
                        <Trash2 size={11} /> 删除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Bottom sheet */}
      {sheetMode && (
        <MemorySheet
          mode={sheetMode}
          memory={sheetMemory}
          onClose={() => setSheetMode(null)}
          onSave={handleSheetSave}
        />
      )}
      </>
      )}
    </div>
  )
}
