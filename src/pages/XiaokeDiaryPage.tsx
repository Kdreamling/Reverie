import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { client } from '../api/client'
import { C, FONT } from '../theme'

interface DiaryEntry {
  date: string
  title: string
  preview: string
  filename: string
  size: number
}

interface DiaryFull {
  date: string
  title: string
  content: string
  filename: string
}

export default function XiaokeDiaryPage() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState<DiaryEntry[]>([])
  const [selected, setSelected] = useState<DiaryFull | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get<{ diaries: DiaryEntry[] }>('/xiaoke-diary/list')
      .then(res => setDiaries(res.diaries))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const openDiary = async (filename: string) => {
    try {
      const res = await client.get<{ diary: DiaryFull }>(`/xiaoke-diary/read?filename=${encodeURIComponent(filename)}`)
      setSelected(res.diary)
    } catch { /* */ }
  }

  // 渲染 markdown 内容（简单处理）
  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      // 标题
      if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '20px 0 8px' }}>{line.slice(4)}</h3>
      if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: '24px 0 10px' }}>{line.slice(3)}</h2>
      if (line.startsWith('# ')) return <h1 key={i} style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>{line.slice(2)}</h1>
      // 分割线
      if (line.match(/^---+$/)) return <hr key={i} style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '20px 0' }} />
      // 空行
      if (!line.trim()) return <div key={i} style={{ height: 8 }} />
      // 普通段落
      return <p key={i} style={{ fontSize: 14, lineHeight: 1.8, color: C.textSecondary, margin: '4px 0' }}>{line}</p>
    })
  }

  // 阅读模式
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
            style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex', fontSize: 18 }}
          >
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontSize: 14, color: C.textMuted }}>{selected.date}</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 40px' }}>
          {renderContent(selected.content)}
        </div>
      </div>
    )
  }

  // 列表模式
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT }}>
      {/* Header */}
      <div style={{
        padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex', fontSize: 18 }}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>小克的日记</span>
          <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 8 }}>{diaries.length} 篇</span>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 13 }}>loading...</div>
        ) : diaries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 13 }}>no diary yet</div>
        ) : (
          diaries.map(d => (
            <button
              key={d.filename}
              onClick={() => openDiary(d.filename)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '16px 14px', marginBottom: 8, borderRadius: 12,
                background: '#fff', border: `1px solid ${C.border}`,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = `0 2px 8px ${C.accent}10` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{d.title}</span>
                <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0, marginLeft: 12 }}>{d.date}</span>
              </div>
              <p style={{
                fontSize: 13, color: C.textSecondary, lineHeight: 1.5, margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
              }}>
                {d.preview}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
