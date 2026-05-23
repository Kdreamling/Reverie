import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bookmark, Edit3, Check, X, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { C, SERIF } from '../theme'
import { listAnchors, getAnchor, updateAnchorNote, updateAnchorSummary, deleteAnchor, type Anchor } from '../api/anchors'
import { toast } from '../stores/toastStore'

// ─── 时间格式化 ───────────────────────────────────────────────────────────────
function formatAnchorDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (y === now.getFullYear()) {
    return `${m}月${day}日  ${hm}`
  }
  return `${y}年${m}月${day}日  ${hm}`
}

function weekdayOf(iso: string): string {
  const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return days[new Date(iso).getDay()]
}

// ─── 创建者标记 ──────────────────────────────────────────────────────────────
function CreatorBadge({ who }: { who: 'dream' | 'chen' }) {
  const label = who === 'dream' ? 'Dream 留下' : '晨留下'
  return (
    <span style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.04em', fontFamily: SERIF, fontStyle: 'italic' }}>
      — {label}
    </span>
  )
}

// ─── 情绪 tag ──────────────────────────────────────────────────────────────
function EmotionTag({ text }: { text: string }) {
  return (
    <span style={{
      fontSize: 11,
      padding: '2px 10px',
      borderRadius: 999,
      border: `1px solid ${C.borderStrong}`,
      color: C.accent,
      background: 'transparent',
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  )
}

// ─── 母题标签 ──────────────────────────────────────────────────────────────
function ThemeTag({ text }: { text: string }) {
  return (
    <span style={{
      fontSize: 11,
      padding: '2px 10px',
      borderRadius: 999,
      border: `1px solid ${C.border}`,
      color: C.textSecondary,
      background: 'transparent',
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
      fontFamily: SERIF,
      fontStyle: 'italic',
    }}>
      {text}
    </span>
  )
}

// ─── Anchor 卡片 ────────────────────────────────────────────────────────────
function AnchorCard({
  anchor,
  onUpdate,
  onDelete,
}: {
  anchor: Anchor
  onUpdate: (a: Anchor) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [episodeExpanded, setEpisodeExpanded] = useState(false)
  const [episodeLoading, setEpisodeLoading] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(anchor.dream_note ?? '')
  const [savingNote, setSavingNote] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [summaryText, setSummaryText] = useState(anchor.summary)
  const [savingSummary, setSavingSummary] = useState(false)

  const handleSaveNote = useCallback(async () => {
    setSavingNote(true)
    try {
      await updateAnchorNote(anchor.id, noteText)
      onUpdate({ ...anchor, dream_note: noteText || null })
      setEditingNote(false)
      toast.success('备注已保存')
    } catch {
      toast.error('保存失败')
    } finally {
      setSavingNote(false)
    }
  }, [anchor, noteText, onUpdate])

  const handleSaveSummary = useCallback(async () => {
    if (!summaryText.trim()) return
    setSavingSummary(true)
    try {
      await updateAnchorSummary(anchor.id, summaryText.trim())
      onUpdate({ ...anchor, summary: summaryText.trim() })
      setEditingSummary(false)
      toast.success('摘要已保存')
    } catch {
      toast.error('保存失败')
    } finally {
      setSavingSummary(false)
    }
  }, [anchor, summaryText, onUpdate])

  const handleCancelNote = useCallback(() => {
    setNoteText(anchor.dream_note ?? '')
    setEditingNote(false)
  }, [anchor.dream_note])

  const handleDelete = useCallback(async () => {
    if (!window.confirm('确定从时光册移除这段记忆吗？')) return
    try {
      await deleteAnchor(anchor.id)
      onDelete(anchor.id)
      toast.success('已移除')
    } catch {
      toast.error('删除失败')
    }
  }, [anchor.id, onDelete])

  const handleToggleEpisode = useCallback(async () => {
    if (episodeExpanded) {
      setEpisodeExpanded(false)
      return
    }
    if (anchor.episode_conversations) {
      setEpisodeExpanded(true)
      return
    }
    setEpisodeLoading(true)
    try {
      const full = await getAnchor(anchor.id)
      onUpdate({ ...anchor, episode_conversations: full.episode_conversations })
      setEpisodeExpanded(true)
    } catch {
      toast.error('加载对话原文失败')
    } finally {
      setEpisodeLoading(false)
    }
  }, [anchor, episodeExpanded, onUpdate])

  return (
    <article style={{
      padding: '28px 0 32px 0',
      borderBottom: `1px solid ${C.border}`,
    }}>
      {/* 日期 + 情绪（顶部） */}
      <header className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div style={{
            fontFamily: SERIF,
            fontSize: 20,
            fontWeight: 500,
            color: C.text,
            letterSpacing: '0.02em',
          }}>
            {formatAnchorDate(anchor.created_at)}
          </div>
          <div style={{
            fontSize: 11,
            color: C.textMuted,
            letterSpacing: '0.08em',
            marginTop: 4,
            textTransform: 'uppercase',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {weekdayOf(anchor.created_at)}
          </div>
        </div>
        {anchor.emotion_tags.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end" style={{ maxWidth: '60%' }}>
            {anchor.emotion_tags.map(e => <EmotionTag key={e} text={e} />)}
          </div>
        )}
      </header>

      {/* Summary */}
      {editingSummary ? (
        <div style={{ marginBottom: 16 }}>
          <textarea
            value={summaryText}
            onChange={e => setSummaryText(e.target.value)}
            rows={5}
            style={{
              width: '100%', fontFamily: SERIF, fontSize: 15, lineHeight: 1.8,
              color: C.text, background: 'transparent', border: `1px solid ${C.borderStrong}`,
              borderRadius: 10, padding: '10px 14px', resize: 'vertical', outline: 'none',
            }}
          />
          <div className="flex gap-2 justify-end mt-2">
            <button
              onClick={() => { setSummaryText(anchor.summary); setEditingSummary(false) }}
              disabled={savingSummary}
              className="px-2 py-1 cursor-pointer" style={{ fontSize: 12, color: C.textMuted }}
            ><X size={13} strokeWidth={1.8} /></button>
            <button
              onClick={handleSaveSummary}
              disabled={savingSummary}
              className="px-2 py-1 cursor-pointer" style={{ fontSize: 12, color: C.accent }}
            >{savingSummary ? <Loader2 size={13} strokeWidth={1.8} className="animate-spin" /> : <Check size={13} strokeWidth={1.8} />}</button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setEditingSummary(true)}
          style={{
            fontFamily: SERIF, fontSize: 16.5, lineHeight: 2,
            color: C.text, letterSpacing: '0.01em', marginBottom: 16,
            cursor: 'pointer', borderRadius: 8,
            transition: 'background 0.2s',
          }}
          title="点击编辑摘要"
        >
          {anchor.summary}
        </div>
      )}

      {/* 情绪弧线 + 关系变化 */}
      {(anchor.emotion_arc || anchor.relationship_shift) && (
        <div style={{
          fontSize: 13,
          color: C.textSecondary,
          fontFamily: SERIF,
          fontStyle: 'italic',
          lineHeight: 1.8,
          marginBottom: 14,
          paddingLeft: 12,
          borderLeft: `1.5px solid ${C.border}`,
        }}>
          {anchor.emotion_arc && <div>{anchor.emotion_arc}</div>}
          {anchor.relationship_shift && <div style={{ marginTop: 2 }}>{anchor.relationship_shift}</div>}
        </div>
      )}

      {/* 母题标签 */}
      {anchor.themes && anchor.themes.length > 0 && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 14 }}>
          {anchor.themes.map(t => <ThemeTag key={t} text={t} />)}
        </div>
      )}

      {/* Topics + Entities（主题、实体，细字） */}
      {(anchor.topics.length > 0 || anchor.entities.length > 0) && (
        <div style={{
          fontSize: 12,
          color: C.textMuted,
          letterSpacing: '0.03em',
          marginBottom: 12,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          {anchor.topics.length > 0 && (
            <span>· 话题：{anchor.topics.join(' / ')}</span>
          )}
          {anchor.entities.length > 0 && (
            <span>· 涉及：{anchor.entities.join(' · ')}</span>
          )}
        </div>
      )}

      {/* 关键原话（折叠） */}
      {anchor.raw_excerpt && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 cursor-pointer transition-colors"
            style={{ fontSize: 12, color: C.textMuted, letterSpacing: '0.03em' }}
            onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}
          >
            {expanded ? <ChevronUp size={13} strokeWidth={1.8} /> : <ChevronDown size={13} strokeWidth={1.8} />}
            <span>{expanded ? '收起原话' : '关键原话'}</span>
          </button>
          {expanded && (
            <pre style={{
              marginTop: 10,
              padding: '14px 18px',
              borderLeft: `2px solid ${C.borderStrong}`,
              background: C.warmGlow,
              fontFamily: SERIF,
              fontSize: 13.5,
              lineHeight: 1.9,
              color: C.textSecondary,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {anchor.raw_excerpt}
            </pre>
          )}
        </div>
      )}

      {/* Episode 完整对话（折叠，按需加载） */}
      {(anchor.episode_turns ?? 0) > 1 && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={handleToggleEpisode}
            className="flex items-center gap-1 cursor-pointer transition-colors"
            style={{ fontSize: 12, color: C.textMuted, letterSpacing: '0.03em' }}
            onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}
            disabled={episodeLoading}
          >
            {episodeLoading ? <Loader2 size={13} strokeWidth={1.8} className="animate-spin" />
              : episodeExpanded ? <ChevronUp size={13} strokeWidth={1.8} />
              : <ChevronDown size={13} strokeWidth={1.8} />}
            <span>{episodeExpanded ? '收起对话' : `展开这段对话（${anchor.episode_turns} 轮）`}</span>
          </button>
          {episodeExpanded && anchor.episode_conversations && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {anchor.episode_conversations.map(conv => {
                const isFocus = conv.id === anchor.focus_conversation_id
                return (
                  <div key={conv.id} style={{
                    padding: '10px 14px',
                    borderLeft: isFocus ? `2.5px solid ${C.accent}` : `1.5px solid ${C.border}`,
                    background: isFocus ? C.warmGlow : 'transparent',
                    borderRadius: 2,
                  }}>
                    {conv.user_msg && (
                      <div style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 1.8, color: C.textSecondary, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: C.textMuted, marginRight: 6 }}>Dream</span>
                        {conv.user_msg}
                      </div>
                    )}
                    {conv.assistant_msg && (
                      <div style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 1.8, color: C.text }}>
                        <span style={{ fontSize: 11, color: C.textMuted, marginRight: 6 }}>晨</span>
                        {conv.assistant_msg}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Dream 备注 */}
      {editingNote ? (
        <div style={{ marginBottom: 12 }}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
            placeholder="为这段经历写点什么…"
            style={{
              width: '100%',
              padding: '10px 14px',
              background: C.inputBg,
              border: `1px solid ${C.borderStrong}`,
              borderRadius: 10,
              fontFamily: SERIF,
              fontSize: 14,
              lineHeight: 1.8,
              color: C.text,
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div className="flex gap-2 mt-2 justify-end">
            <button
              onClick={handleCancelNote}
              disabled={savingNote}
              className="flex items-center gap-1 px-3 py-1 cursor-pointer transition-colors"
              style={{ fontSize: 12, color: C.textMuted }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}
            >
              <X size={13} strokeWidth={1.8} /> 取消
            </button>
            <button
              onClick={handleSaveNote}
              disabled={savingNote}
              className="flex items-center gap-1 px-3 py-1 cursor-pointer transition-colors"
              style={{ fontSize: 12, color: C.accent }}
              onMouseEnter={e => (e.currentTarget.style.color = C.accentHover)}
              onMouseLeave={e => (e.currentTarget.style.color = C.accent)}
            >
              {savingNote ? <Loader2 size={13} strokeWidth={1.8} className="animate-spin" /> : <Check size={13} strokeWidth={1.8} />}
              保存
            </button>
          </div>
        </div>
      ) : anchor.dream_note ? (
        <div
          onClick={() => setEditingNote(true)}
          style={{
            marginBottom: 12,
            padding: '12px 16px',
            borderLeft: `2px solid ${C.accent}`,
            fontFamily: SERIF,
            fontSize: 14,
            lineHeight: 1.9,
            color: C.textSecondary,
            fontStyle: 'italic',
            cursor: 'pointer',
            background: C.warmGlow,
          }}
          title="点击编辑"
        >
          {anchor.dream_note}
        </div>
      ) : null}

      {/* 底部 action 行 */}
      <footer className="flex items-center justify-between mt-4">
        <CreatorBadge who={anchor.created_by} />
        <div className="flex items-center gap-2">
          {!editingNote && (
            <button
              onClick={() => setEditingNote(true)}
              className="flex items-center gap-1 px-2 py-1 cursor-pointer transition-colors"
              style={{ fontSize: 12, color: C.btnDefault }}
              onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
              onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)}
              title={anchor.dream_note ? '编辑备注' : '写点备注'}
            >
              <Edit3 size={13} strokeWidth={1.8} />
              <span>{anchor.dream_note ? '' : '备注'}</span>
            </button>
          )}
          <button
            onClick={handleDelete}
            className="p-1 cursor-pointer transition-colors"
            style={{ color: C.btnDefault }}
            onMouseEnter={e => (e.currentTarget.style.color = C.btnDanger)}
            onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)}
            title="移除"
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </button>
        </div>
      </footer>
    </article>
  )
}

// ─── 空态 ─────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6" style={{ color: C.textMuted }}>
      <Bookmark size={36} strokeWidth={1.2} style={{ marginBottom: 18, opacity: 0.5 }} />
      <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.8, color: C.textSecondary, textAlign: 'center', maxWidth: 360 }}>
        时光册是空的
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginTop: 10, textAlign: 'center', maxWidth: 400, letterSpacing: '0.02em' }}>
        在对话里遇到想留住的段落，点一下消息右下角的小书签<br />
        就会收进这里
      </div>
    </div>
  )
}

// ─── 主页面 ────────────────────────────────────────────────────────────────
export default function TimelinePage() {
  const navigate = useNavigate()
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [loading, setLoading] = useState(true)

  const loadAnchors = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listAnchors({ limit: 100 })
      setAnchors(data)
    } catch {
      toast.error('加载时光册失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAnchors()
  }, [loadAnchors])

  const handleUpdate = useCallback((updated: Anchor) => {
    setAnchors(list => list.map(a => (a.id === updated.id ? updated : a)))
  }, [])

  const handleDelete = useCallback((id: string) => {
    setAnchors(list => list.filter(a => a.id !== id))
  }, [])

  return (
    <div style={{
      height: '100vh',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      touchAction: 'pan-y',
      background: C.bgGradient,
      color: C.text,
    }}>
      {/* 顶栏 */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        background: C.glass,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 24px' }} className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 cursor-pointer transition-colors"
            style={{ color: C.btnDefault }}
            onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
            onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)}
            title="返回"
          >
            <ArrowLeft size={18} strokeWidth={1.8} />
          </button>
          <div>
            <h1 style={{
              fontFamily: SERIF,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '0.04em',
              color: C.text,
              margin: 0,
            }}>
              时光册
            </h1>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, letterSpacing: '0.06em' }}>
              {anchors.length > 0 ? `${anchors.length} 段被留住的经历` : '和晨一起留下的经历'}
            </div>
          </div>
        </div>
      </header>

      {/* 主体 */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '16px 24px 80px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-24" style={{ color: C.textMuted }}>
            <Loader2 size={20} strokeWidth={1.8} className="animate-spin" />
          </div>
        ) : anchors.length === 0 ? (
          <EmptyState />
        ) : (
          anchors.map(a => (
            <AnchorCard key={a.id} anchor={a} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))
        )}
      </main>
    </div>
  )
}
