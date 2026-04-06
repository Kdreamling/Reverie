import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, CheckCircle, Trash2, Loader2 } from 'lucide-react'
import { listErrors, updateError, deleteError, getErrorStats, type StudyError } from '../api/study'
import { toast } from '../stores/toastStore'

const TYPE_LABELS: Record<string, string> = {
  choice: '选择题',
  fill: '填空题',
  reading: '阅读理解',
  translation: '翻译题',
}

const TYPE_ICONS: Record<string, string> = {
  choice: '🔤',
  fill: '✏️',
  reading: '📖',
  translation: '🔄',
}

export default function ErrorBookPage() {
  const navigate = useNavigate()
  const [errors, setErrors] = useState<StudyError[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unmastered' | 'mastered'>('unmastered')
  const [stats, setStats] = useState<{ total: number; mastered: number; unmastered: number } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [filter])

  const loadData = async () => {
    setLoading(true)
    try {
      const [errResult, statsResult] = await Promise.all([
        listErrors(filter === 'all' ? undefined : { mastered: filter === 'mastered' }),
        getErrorStats(),
      ])
      setErrors(errResult.errors)
      setStats(statsResult)
    } catch (e) {
      console.error('Failed to load errors:', e)
      toast.error('加载错题本失败')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleMastered = async (id: string, currentMastered: boolean) => {
    try {
      await updateError(id, { mastered: !currentMastered })
      setErrors(prev => prev.map(e => e.id === id ? { ...e, mastered: !currentMastered } : e))
      if (stats) {
        setStats({
          ...stats,
          mastered: stats.mastered + (currentMastered ? -1 : 1),
          unmastered: stats.unmastered + (currentMastered ? 1 : -1),
        })
      }
    } catch (e) {
      console.error('Failed to update:', e)
      toast.error('更新失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteError(id)
      setErrors(prev => prev.filter(e => e.id !== id))
      if (stats) setStats({ ...stats, total: stats.total - 1 })
    } catch (e) {
      console.error('Failed to delete:', e)
      toast.error('删除失败')
    }
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: '#fafbfd' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid #e8ecf5', background: 'rgba(250,251,253,0.95)', backdropFilter: 'blur(10px)' }}
      >
        <button onClick={() => navigate('/')} className="p-1.5 rounded-lg cursor-pointer" style={{ color: '#8a95aa' }}>
          <ArrowLeft size={18} />
        </button>
        <BookOpen size={18} style={{ color: '#ef4444' }} />
        <span className="text-sm font-medium" style={{ color: '#1a1f2e' }}>错题本</span>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex gap-3 px-4 py-4">
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)' }}>
            <div className="text-xl font-bold" style={{ color: '#ef4444' }}>{stats.unmastered}</div>
            <div className="text-xs" style={{ color: '#9aa3b8' }}>待掌握</div>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.1)' }}>
            <div className="text-xl font-bold" style={{ color: '#22c55e' }}>{stats.mastered}</div>
            <div className="text-xs" style={{ color: '#9aa3b8' }}>已掌握</div>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(0,47,167,0.05)', border: '1px solid rgba(0,47,167,0.1)' }}>
            <div className="text-xl font-bold" style={{ color: '#002FA7' }}>{stats.total}</div>
            <div className="text-xs" style={{ color: '#9aa3b8' }}>总计</div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 pb-3">
        {(['unmastered', 'mastered', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
            style={{
              background: filter === f ? '#002FA7' : '#fff',
              color: filter === f ? '#fff' : '#7a8399',
              border: filter === f ? '1px solid #002FA7' : '1px solid #e8ecf5',
            }}
          >
            {f === 'unmastered' ? '待掌握' : f === 'mastered' ? '已掌握' : '全部'}
          </button>
        ))}
      </div>

      {/* Error list */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: '#002FA7' }} />
          </div>
        ) : errors.length === 0 ? (
          <div className="text-center py-20">
            <span style={{ fontSize: 40 }}>🎉</span>
            <p className="text-sm mt-3" style={{ color: '#9aa3b8' }}>
              {filter === 'unmastered' ? '没有待掌握的错题！继续加油～' : '暂无错题记录'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {errors.map(err => (
              <div
                key={err.id}
                className="rounded-xl overflow-hidden"
                style={{ background: '#fff', border: `1px solid ${err.mastered ? 'rgba(34,197,94,0.2)' : '#e8ecf5'}` }}
              >
                <button
                  onClick={() => setExpandedId(prev => prev === err.id ? null : err.id)}
                  className="w-full text-left px-4 py-3 cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontSize: 14 }}>{TYPE_ICONS[err.question_type] || '📝'}</span>
                    <span className="text-xs" style={{ color: '#9aa3b8' }}>
                      {TYPE_LABELS[err.question_type] || err.question_type}
                    </span>
                    {err.mastered && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: 10 }}>
                        已掌握
                      </span>
                    )}
                    {err.tags?.length > 0 && (
                      <span className="text-xs" style={{ color: '#b0b8cc' }}>
                        {err.tags.join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: '#3a4255' }}>{err.question}</p>
                </button>

                {expandedId === err.id && (
                  <div className="px-4 pb-3 pt-0">
                    <div className="rounded-lg p-3 mb-2" style={{ background: '#f8f9fc' }}>
                      <p className="text-xs mb-1" style={{ color: '#ef4444' }}>你的答案：{err.user_answer || '未答'}</p>
                      <p className="text-xs" style={{ color: '#22c55e' }}>正确答案：{err.correct_answer}</p>
                      {err.explanation && (
                        <p className="text-xs mt-2" style={{ color: '#5a6a8a' }}>{err.explanation}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleMastered(err.id, err.mastered)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                        style={{
                          background: err.mastered ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)',
                          color: err.mastered ? '#ef4444' : '#22c55e',
                          border: `1px solid ${err.mastered ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                        }}
                      >
                        <CheckCircle size={12} />
                        {err.mastered ? '标为未掌握' : '标为已掌握'}
                      </button>
                      <button
                        onClick={() => handleDelete(err.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                        style={{ color: '#9aa3b8', border: '1px solid #e8ecf5' }}
                      >
                        <Trash2 size={12} /> 删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
