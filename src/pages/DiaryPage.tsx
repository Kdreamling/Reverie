import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { C } from '../theme'
import { useToastStore } from '../stores/toastStore'
import {
  fetchDiariesByDate, fetchDreamDiary, fetchChenDiary,
  createDreamDiary, updateDreamDiary, deleteDreamDiary,
  lockDiary, unlockDiary, removeLock, unlockChenDiary,
  fetchComments, createComment, deleteComment, fetchUnlockAttempts,
  type UnlockAttempt,
  type Diary, type DiaryComment,
} from '../api/diary'

const toast = { error: (m: string) => useToastStore.getState().add('error', m), success: (m: string) => useToastStore.getState().add('success', m) }

const FONTS = {
  title: "'Space Grotesk', 'SF Pro Display', sans-serif",
  mono: "'JetBrains Mono', monospace",
  body: "'Noto Sans SC', sans-serif",
}

// Author colors
const INK = {
  dream: C.accent,
  dreamBg: 'rgba(160,120,90,0.1)',
  chen: '#8A6CAA',
  chenBg: 'rgba(138,108,170,0.08)',
}

const MOOD_LABELS = ['开心', '幸福', '平静', '想念', '担心', 'emo', '兴奋']

type View = 'date' | 'detail' | 'editor' | 'locked'

export default function DiaryPage() {
  const navigate = useNavigate()
  const { date } = useParams<{ date: string }>()
  const selectedDate = date || new Date().toISOString().slice(0, 10)
  const [view, setView] = useState<View>('date')
  const [selectedDiary, setSelectedDiary] = useState<Diary | null>(null)
  const [selectedSource, setSelectedSource] = useState<'dream' | 'chen'>('dream')

  return (
    <div style={{
      minHeight: '100vh', height: '100vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      background: C.bgGradient,
      fontFamily: FONTS.body, color: C.text,
      maxWidth: 480, margin: '0 auto',
      padding: '20px 0 60px',
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>

      {view === 'date' && (
        <DateOverview
          date={selectedDate}
          onBack={() => navigate('/calendar')}
          onOpenDiary={(diary, source) => {
            setSelectedDiary(diary)
            setSelectedSource(source)
            setView(diary.is_locked ? 'locked' : 'detail')
          }}
          onNewDiary={() => { setSelectedDiary(null); setView('editor') }}
        />
      )}
      {view === 'detail' && selectedDiary && (
        <DiaryDetail
          diary={selectedDiary}
          source={selectedSource}
          onBack={() => setView('date')}
          onEdit={() => setView('editor')}
          onRefresh={async () => {
            const d = selectedSource === 'dream'
              ? await fetchDreamDiary(selectedDiary.id)
              : await fetchChenDiary(selectedDiary.id)
            setSelectedDiary(d)
          }}
        />
      )}
      {view === 'locked' && selectedDiary && (
        <LockedView
          diary={selectedDiary}
          source={selectedSource}
          onBack={() => setView('date')}
          onUnlocked={(d) => { setSelectedDiary(d); setView('detail') }}
        />
      )}
      {view === 'editor' && (
        <DiaryEditor
          diary={selectedDiary}
          date={selectedDate}
          onBack={() => selectedDiary ? setView('detail') : setView('date')}
          onSaved={(d) => { setSelectedDiary(d); setSelectedSource('dream'); setView('detail') }}
        />
      )}
    </div>
  )
}

// ===== Date Overview =====
function DateOverview({ date, onBack, onOpenDiary, onNewDiary }: {
  date: string
  onBack: () => void
  onOpenDiary: (d: Diary, source: 'dream' | 'chen') => void
  onNewDiary: () => void
}) {
  const [dreamDiaries, setDreamDiaries] = useState<Diary[]>([])
  const [chenDiaries, setChenDiaries] = useState<Diary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchDiariesByDate(date)
      .then(r => { setDreamDiaries(r.dream); setChenDiaries(r.chen) })
      .catch(() => toast.error('加载日记失败'))
      .finally(() => setLoading(false))
  }, [date])

  const d = new Date(date + 'T00:00:00')
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`

  return (
    <div style={{ padding: '0 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div onClick={onBack} style={{ cursor: 'pointer', padding: 4, display: 'flex' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.08em', fontWeight: 500, fontFamily: FONTS.mono }}>DIARY</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{dateLabel}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 13 }}>加载中…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Dream section */}
          <SectionLabel label="Dream 的日记" color={INK.dream} />
          {dreamDiaries.map(d => (
            <DiaryPreviewCard key={d.id} diary={d} source="dream" onClick={() => onOpenDiary(d, 'dream')} />
          ))}
          <EmptySlot label="写一篇日记" sub="记录今天的心情吧" onClick={onNewDiary} />

          {/* Claude section */}
          <SectionLabel label="Claude 的日记" color={INK.chen} />
          {chenDiaries.length > 0 ? chenDiaries.map(d => (
            <DiaryPreviewCard key={d.id} diary={d} source="chen" onClick={() => onOpenDiary(d, 'chen')} />
          )) : (
            <div style={{
              padding: '20px 18px', borderRadius: 14,
              background: 'rgba(160,120,90,0.03)', border: `1px dashed ${C.border}`,
              textAlign: 'center', fontSize: 12, color: C.textMuted,
            }}>
              Claude 今天还没写日记
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, letterSpacing: '0.02em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  )
}

function DiaryPreviewCard({ diary, source, onClick }: { diary: Diary; source: string; onClick: () => void }) {
  const isChen = source === 'chen'
  const color = isChen ? INK.chen : INK.dream
  const bgColor = isChen ? INK.chenBg : INK.dreamBg
  const preview = diary.content?.slice(0, 80)

  return (
    <div onClick={onClick} style={{
      background: C.surfaceSolid, borderRadius: 16, padding: '18px 18px 16px',
      border: `1px solid ${C.border}`, cursor: 'pointer',
      transition: 'transform 0.1s', position: 'relative',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 8, background: bgColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color,
          }}>
            {isChen ? 'C' : 'D'}
          </div>
          <div>
            <div style={{ fontSize: 11, color, fontWeight: 600 }}>{isChen ? 'Claude' : 'Dream'}</div>
            {diary.time && <div style={{ fontSize: 9, color: C.textMuted, marginTop: 1 }}>{diary.time}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {diary.mood && (
            <span style={{ fontSize: 10, color: C.textSecondary, padding: '2px 6px', borderRadius: 8, background: 'rgba(160,120,90,0.06)' }}>{diary.mood}</span>
          )}
          {diary.is_locked && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 12,
              background: 'rgba(200,120,100,0.08)', color: C.errorText,
              fontSize: 9, fontWeight: 500,
            }}>
              {diary.lock_type === 'password' ? '密码锁' : '时间锁'}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      {diary.title && (
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
          {diary.title}
        </div>
      )}

      {/* Preview */}
      {!diary.is_locked && preview && (
        <div style={{
          fontSize: 12, color: C.textSecondary, lineHeight: 1.7,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>
          {preview}…
        </div>
      )}
      {diary.is_locked && (
        <div style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>
          这篇日记已上锁
        </div>
      )}
    </div>
  )
}

function EmptySlot({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      background: 'rgba(160,120,90,0.03)', borderRadius: 16, padding: '22px 18px',
      border: `1px dashed ${C.border}`, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 12,
      transition: 'background 0.15s',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: INK.dreamBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}

// ===== Diary Detail =====
function DiaryDetail({ diary, source, onBack, onEdit, onRefresh }: {
  diary: Diary; source: 'dream' | 'chen'
  onBack: () => void; onEdit: () => void; onRefresh: () => void
}) {
  const [comments, setComments] = useState<DiaryComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const [unlockAttempts, setUnlockAttempts] = useState<UnlockAttempt[]>([])

  const isDream = source === 'dream'
  const color = isDream ? INK.dream : INK.chen
  const bgColor = isDream ? INK.dreamBg : INK.chenBg
  const authorName = isDream ? 'Dream' : 'Claude'

  const loadComments = useCallback(() => {
    fetchComments(source, diary.id).then(r => setComments(r.comments)).catch(() => {})
  }, [source, diary.id])

  useEffect(() => { loadComments() }, [loadComments])

  useEffect(() => {
    fetchUnlockAttempts(source, diary.id).then(r => setUnlockAttempts(r.attempts)).catch(() => {})
  }, [source, diary.id])

  const handleComment = async () => {
    if (!commentText.trim() || sending) return
    setSending(true)
    try {
      await createComment(source, diary.id, { author: 'dream', content: commentText.trim() })
      setCommentText('')
      loadComments()
    } catch { toast.error('发送失败') }
    finally { setSending(false) }
  }

  const handleDelete = async () => {
    if (!confirm('确定删除这篇日记吗？')) return
    try {
      await deleteDreamDiary(diary.id)
      toast.success('已删除')
      onBack()
    } catch { toast.error('删除失败') }
  }

  const handleRemoveLock = async () => {
    try {
      await removeLock(diary.id)
      toast.success('已解锁')
      onRefresh()
    } catch { toast.error('解锁失败') }
  }

  const d = new Date(diary.diary_date + 'T00:00:00')
  const dateLabel = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`

  return (
    <div style={{ padding: '0 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div onClick={onBack} style={{ cursor: 'pointer', padding: 4, display: 'flex' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.08em' }}>{dateLabel}</div>
        <div style={{ width: 28 }} />
      </div>

      {/* Paper */}
      <div style={{
        background: 'rgba(255,252,246,0.9)', borderRadius: 18, padding: '24px 22px',
        border: `1px solid ${C.border}`,
      }}>
        {/* Author */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9, background: bgColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color,
            }}>
              {isDream ? 'D' : '晨'}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color }}>{authorName}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                {dateLabel} · {diary.time || ''}
                {diary.mood && ` · ${diary.mood}`}
              </div>
            </div>
          </div>

          {isDream && (
            <div style={{ display: 'flex', gap: 6 }}>
              {diary.is_locked && (
                <IconBtn icon="unlock" onClick={handleRemoveLock} />
              )}
              {!diary.is_locked && <IconBtn icon="lock" onClick={onEdit} />}
              <IconBtn icon="edit" onClick={onEdit} />
              <IconBtn icon="delete" onClick={handleDelete} />
            </div>
          )}
        </div>

        {/* Title */}
        {diary.title && (
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 14, lineHeight: 1.3 }}>
            {diary.title}
          </div>
        )}

        {/* Content */}
        <div style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
          {diary.content}
        </div>

        {/* Highlights (chen) */}
        {!isDream && diary.highlights && diary.highlights.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, fontWeight: 500 }}>HIGHLIGHTS</div>
            <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.8 }}>
              {(typeof diary.highlights === 'string' ? JSON.parse(diary.highlights as string) : diary.highlights).join(' · ')}
            </div>
          </div>
        )}
      </div>

      {/* Unlock attempts */}
      {unlockAttempts.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span style={{ fontSize: 11, color: C.textSecondary, letterSpacing: '0.08em', fontWeight: 500, fontFamily: FONTS.mono }}>UNLOCK ATTEMPTS ({unlockAttempts.length})</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          {unlockAttempts.map(a => {
            const who = a.attempted_by === 'dream' ? 'Dream' : 'Claude'
            const whoColor = a.attempted_by === 'dream' ? INK.dream : INK.chen
            const time = new Date(a.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
            return (
              <div key={a.id} style={{
                background: a.success ? 'rgba(94,138,75,0.06)' : 'rgba(200,120,100,0.04)',
                borderRadius: 10, padding: '8px 12px', marginBottom: 6,
                border: `1px solid ${a.success ? 'rgba(94,138,75,0.15)' : C.border}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: whoColor }}>{who}</span>
                <span style={{ fontSize: 11, color: a.success ? '#5E8A4B' : C.textSecondary }}>
                  {a.success ? '成功解锁了' : '尝试解锁但失败了'}
                </span>
                <span style={{ fontSize: 9, color: C.textMuted, marginLeft: 'auto', fontFamily: FONTS.mono }}>{time}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Comments */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '0 4px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span style={{ fontSize: 11, color: C.textSecondary, letterSpacing: '0.08em', fontWeight: 500 }}>评论 ({comments.length})</span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>

        {comments.map(c => (
          <div key={c.id} style={{
            background: 'rgba(160,120,90,0.04)', borderRadius: 12, padding: '12px 14px',
            border: `1px solid ${C.border}`, marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 5,
                background: c.author === 'dream' ? INK.dreamBg : INK.chenBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 600, color: c.author === 'dream' ? INK.dream : INK.chen,
              }}>
                {c.author === 'dream' ? 'D' : 'C'}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: c.author === 'dream' ? INK.dream : INK.chen }}>
                {c.author === 'dream' ? 'Dream' : 'Claude'}
              </span>
              <span style={{ fontSize: 9, color: C.textMuted }}>
                {new Date(c.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })}
              </span>
              {c.author === 'dream' && (
                <svg onClick={() => { deleteComment(c.id).then(loadComments) }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer', marginLeft: 'auto' }}><path d="M18 6L6 18M6 6l12 12"/></svg>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.7, paddingLeft: 26 }}>
              {c.content}
            </div>
          </div>
        ))}

        {/* Comment input */}
        <div style={{
          background: C.surfaceSolid, borderRadius: 12, padding: '10px 12px',
          border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleComment()}
            placeholder="留一条评论…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: C.text, fontSize: 13, fontFamily: FONTS.body,
            }}
          />
          <div onClick={handleComment} style={{
            width: 30, height: 30, borderRadius: 8,
            background: commentText.trim() ? C.accent : 'rgba(160,120,90,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: commentText.trim() ? 'pointer' : 'default',
            transition: 'background 0.2s',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={commentText.trim() ? '#fff' : C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>
          </div>
        </div>
      </div>
    </div>
  )
}

function IconBtn({ icon, onClick }: { icon: string; onClick: () => void }) {
  const paths: Record<string, string> = {
    lock: 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
    unlock: 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 019.9-1',
    edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
    delete: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
  }
  return (
    <div onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 8,
      background: 'rgba(160,120,90,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={paths[icon] || ''}/></svg>
    </div>
  )
}

// ===== Locked View =====
function LockedView({ diary, source, onBack, onUnlocked }: {
  diary: Diary; source: 'dream' | 'chen'
  onBack: () => void; onUnlocked: (d: Diary) => void
}) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState<UnlockAttempt[]>([])

  useEffect(() => {
    fetchUnlockAttempts(source, diary.id).then(r => setAttempts(r.attempts)).catch(() => {})
  }, [source, diary.id])

  const handleUnlock = async () => {
    if (!pwd) return
    try {
      const r = source === 'dream' ? await unlockDiary(diary.id, pwd) : await unlockChenDiary(diary.id, pwd)
      onUnlocked(r.diary)
    } catch (e: any) {
      setError(e.message || '密码错误')
    }
  }

  const isTimeLock = diary.lock_type === 'time'

  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div onClick={onBack} style={{ cursor: 'pointer', padding: 4, display: 'flex' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.08em' }}>
          已锁定 · {diary.diary_date}
        </div>
      </div>

      <div style={{
        background: 'rgba(255,252,246,0.9)', borderRadius: 18, padding: '40px 24px',
        border: `1px solid ${C.border}`, textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Dot pattern */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(${C.border} 1px, transparent 1px)`,
          backgroundSize: '12px 12px', opacity: 0.5, pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(200,120,100,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.errorText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            这篇日记已上锁
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 24 }}>
            {isTimeLock ? `将在 ${diary.unlock_date} 自动解锁` : '输入密码即可查看内容'}
          </div>

          {!isTimeLock && (
            <>
              <div style={{
                background: C.surfaceSolid, borderRadius: 12, padding: '12px 14px',
                border: `1px solid ${C.border}`, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                <input
                  type="password"
                  value={pwd}
                  onChange={e => { setPwd(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                  placeholder="输入密码"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: C.text, fontSize: 13, fontFamily: FONTS.body,
                  }}
                />
              </div>
              {error && <div style={{ fontSize: 11, color: C.errorText, marginBottom: 8 }}>{error}</div>}
              <div onClick={handleUnlock} style={{
                padding: '12px 0', borderRadius: 12,
                background: pwd ? C.accent : 'rgba(160,120,90,0.06)',
                color: pwd ? '#fff' : C.textMuted,
                fontSize: 13, fontWeight: 600,
                cursor: pwd ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}>
                解锁
              </div>
            </>
          )}

          {source === 'dream' && (
            <div
              onClick={async () => {
                try {
                  await removeLock(diary.id)
                  toast.success('已解锁')
                  const d = await fetchDreamDiary(diary.id)
                  onUnlocked(d)
                } catch { toast.error('解锁失败') }
              }}
              style={{
                marginTop: 16, padding: '10px 0', borderRadius: 10,
                background: 'rgba(160,120,90,0.04)', border: `1px solid ${C.border}`,
                color: C.textSecondary, fontSize: 12, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              这是我的日记，直接解锁
            </div>
          )}
        </div>
      </div>

      {/* Unlock attempts log */}
      {attempts.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
            <span style={{ fontSize: 11, color: C.textSecondary, letterSpacing: '0.08em', fontWeight: 500, fontFamily: FONTS.mono }}>UNLOCK ATTEMPTS ({attempts.length})</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          {attempts.map(a => {
            const who = a.attempted_by === 'dream' ? 'Dream' : 'Claude'
            const whoColor = a.attempted_by === 'dream' ? INK.dream : INK.chen
            const time = new Date(a.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
            return (
              <div key={a.id} style={{
                background: a.success ? 'rgba(94,138,75,0.06)' : 'rgba(200,120,100,0.04)',
                borderRadius: 10, padding: '8px 12px', marginBottom: 6,
                border: `1px solid ${a.success ? 'rgba(94,138,75,0.15)' : C.border}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: whoColor }}>{who}</span>
                <span style={{ fontSize: 11, color: a.success ? '#5E8A4B' : C.textSecondary }}>
                  {a.success ? '成功解锁了' : '尝试解锁但失败了'}
                </span>
                <span style={{ fontSize: 9, color: C.textMuted, marginLeft: 'auto', fontFamily: FONTS.mono }}>{time}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===== Editor =====
function DiaryEditor({ diary, date, onBack, onSaved }: {
  diary: Diary | null; date: string
  onBack: () => void; onSaved: (d: Diary) => void
}) {
  const [title, setTitle] = useState(diary?.title || '')
  const [content, setContent] = useState(diary?.content || '')
  const [mood, setMood] = useState(diary?.mood || '')
  const [saving, setSaving] = useState(false)
  const [showLock, setShowLock] = useState(false)
  const [lockType, setLockType] = useState<'password' | 'time'>('password')
  const [lockPwd, setLockPwd] = useState('')
  const [lockDate, setLockDate] = useState('')

  const isEdit = !!diary

  const handleSave = async () => {
    if (!content.trim() || saving) return
    setSaving(true)
    try {
      let saved: Diary
      if (isEdit) {
        const r = await updateDreamDiary(diary!.id, { title: title || undefined, content, mood: mood || undefined })
        saved = r.diary
      } else {
        const now = new Date()
        const r = await createDreamDiary({
          title: title || undefined, content, mood: mood || undefined,
          diary_date: date, time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        })
        saved = r.diary
      }

      // Apply lock if set
      if (showLock && saved.id) {
        if (lockType === 'password' && lockPwd) {
          await lockDiary(saved.id, { lock_type: 'password', password: lockPwd })
        } else if (lockType === 'time' && lockDate) {
          await lockDiary(saved.id, { lock_type: 'time', unlock_date: lockDate })
        }
      }

      toast.success(isEdit ? '已保存' : '日记已创建')
      onSaved(saved)
    } catch { toast.error('保存失败') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '0 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div onClick={onBack} style={{ cursor: 'pointer', padding: 4, display: 'flex' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.08em' }}>
          {isEdit ? '编辑' : '写日记'} · {date}
        </div>
        <div onClick={handleSave} style={{
          padding: '6px 14px', borderRadius: 8,
          background: content.trim() ? C.accent : 'rgba(160,120,90,0.1)',
          color: content.trim() ? '#fff' : C.textMuted,
          fontSize: 12, fontWeight: 600, cursor: content.trim() ? 'pointer' : 'default',
          transition: 'all 0.2s',
        }}>
          {saving ? '保存中…' : '保存'}
        </div>
      </div>

      {/* Paper */}
      <div style={{
        background: 'rgba(255,252,246,0.9)', borderRadius: 18, padding: '20px 20px 16px',
        border: `1px solid ${C.border}`, marginBottom: 14,
      }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="标题…"
          style={{
            width: '100%', background: 'transparent', border: 'none', outline: 'none',
            fontSize: 20, fontWeight: 700, color: C.text, fontFamily: FONTS.body,
            marginBottom: 14, padding: 0,
          }}
        />
        <div style={{ height: 1, background: C.border, marginBottom: 14 }} />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="今天发生了什么…"
          rows={12}
          style={{
            width: '100%', background: 'transparent', border: 'none', outline: 'none',
            fontSize: 14, color: C.textSecondary, lineHeight: 1.85,
            fontFamily: FONTS.body, resize: 'none', padding: 0,
          }}
        />
      </div>

      {/* Mood selector */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', padding: '0 2px',
      }}>
        {MOOD_LABELS.map(k => (
          <div key={k} onClick={() => setMood(mood === k ? '' : k)} style={{
            padding: '4px 10px', borderRadius: 16,
            background: mood === k ? INK.dreamBg : 'rgba(160,120,90,0.04)',
            border: `1px solid ${mood === k ? C.accent : C.border}`,
            fontSize: 11, cursor: 'pointer',
            color: mood === k ? C.accent : C.textSecondary,
            transition: 'all 0.15s',
          }}>
            {k}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        background: C.surfaceSolid, borderRadius: 14, padding: '10px 14px',
        border: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {/* Bold */}
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(160,120,90,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6zM6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></svg>
        </div>
        {/* Color */}
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(160,120,90,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c5.5-2.5 7-7.5 7-12S14 2 12 2 5 5 5 10s1.5 9.5 7 12z"/></svg>
        </div>
        {/* Emoji */}
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(160,120,90,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>
        </div>

        <div style={{ flex: 1 }} />
        <div onClick={() => setShowLock(!showLock)} style={{
          padding: '8px 12px', borderRadius: 9,
          background: showLock ? 'rgba(200,120,100,0.08)' : 'rgba(160,120,90,0.06)',
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={showLock ? C.errorText : C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span style={{ fontSize: 11, color: showLock ? C.errorText : C.textSecondary }}>上锁</span>
        </div>
      </div>

      {/* Lock options */}
      {showLock && (
        <div style={{
          marginTop: 10, background: C.surfaceSolid, borderRadius: 14,
          padding: 14, border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, letterSpacing: '0.05em', fontWeight: 500 }}>
            选择锁类型
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div onClick={() => setLockType('password')} style={{
              flex: 1, padding: 12, borderRadius: 10,
              background: 'rgba(160,120,90,0.04)',
              border: `1px solid ${lockType === 'password' ? C.accent : C.border}`,
              cursor: 'pointer',
            }}>
              <div style={{ marginBottom: 4 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></div>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>密码锁</div>
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>设一个密码才能解锁</div>
            </div>
            <div onClick={() => setLockType('time')} style={{
              flex: 1, padding: 12, borderRadius: 10,
              background: 'rgba(160,120,90,0.04)',
              border: `1px solid ${lockType === 'time' ? C.accent : C.border}`,
              cursor: 'pointer',
            }}>
              <div style={{ marginBottom: 4 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>时间锁</div>
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>到指定日期自动解锁</div>
            </div>
          </div>
          {lockType === 'password' && (
            <input value={lockPwd} onChange={e => setLockPwd(e.target.value)}
              type="password" placeholder="设置密码…"
              style={{
                width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 10,
                background: 'rgba(160,120,90,0.04)', border: `1px solid ${C.border}`,
                outline: 'none', color: C.text, fontSize: 13, fontFamily: FONTS.body,
              }}
            />
          )}
          {lockType === 'time' && (
            <input value={lockDate} onChange={e => setLockDate(e.target.value)}
              type="date" placeholder="选择解锁日期"
              style={{
                width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 10,
                background: 'rgba(160,120,90,0.04)', border: `1px solid ${C.border}`,
                outline: 'none', color: C.text, fontSize: 13, fontFamily: FONTS.body,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
