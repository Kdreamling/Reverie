import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, MessageCircle, X, FileText, Upload } from 'lucide-react'
import { listBooksAPI, createBookAPI, startReadingAPI, deleteBookAPI, type Book } from '../api/reading'
import { C } from '../theme'
import { toast } from '../stores/toastStore'

// ─── Add Book Sheet ───

function AddBookSheet({ show, onClose, onCreated }: { show: boolean; onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<null | 'paste' | 'file'>(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  if (!show) return null

  async function handleSubmit() {
    if (!text.trim()) return
    setLoading(true)
    try {
      await createBookAPI(text, title || undefined, author || undefined, mode === 'file' ? 'file' : 'paste')
      onClose()
      onCreated()
      setMode(null); setTitle(''); setAuthor(''); setText('')
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setText(reader.result as string)
      if (!title) setTitle(file.name.replace(/\.(txt|md)$/, ''))
    }
    reader.readAsText(file)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(92,75,58,0.25)',
        backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#FFFCF7', borderRadius: '24px 24px 0 0',
        padding: '12px 24px 44px',
        boxShadow: '0 -4px 30px rgba(92,75,58,0.1)',
        animation: 'sheetUp 0.36s cubic-bezier(0.32, 0.72, 0, 1)',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 20px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }} />
        </div>

        {!mode ? (
          <>
            <p style={{ textAlign: 'center', fontSize: 17, fontWeight: 500, letterSpacing: '0.12em', marginBottom: 6, color: C.text }}>
              添加新书
            </p>
            <p style={{ textAlign: 'center', fontSize: 13, color: C.textMuted, marginBottom: 28 }}>
              导入一段文字，和小克一起读
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { key: 'paste' as const, icon: <FileText size={26} strokeWidth={1.3} />, label: '粘贴文本', sub: '直接粘贴内容' },
                { key: 'file' as const, icon: <Upload size={26} strokeWidth={1.3} />, label: '导入文件', sub: '.txt / .md' },
              ].map(item => (
                <button key={item.key} onClick={() => setMode(item.key)} style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '26px 16px', borderRadius: 16,
                  border: `1.5px dashed ${C.border}`,
                  background: C.bg, cursor: 'pointer', color: C.textSecondary,
                }}>
                  {item.icon}
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{item.label}</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{item.sub}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={() => setMode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSecondary, padding: 4 }}>
                <ChevronLeft size={20} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
                {mode === 'paste' ? '粘贴文本' : '导入文件'}
              </span>
              <div style={{ width: 28 }} />
            </div>

            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="书名"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: `1px solid ${C.border}`, fontSize: 14, color: C.text,
                outline: 'none', background: C.bg, marginBottom: 10, boxSizing: 'border-box',
              }}
            />
            <input
              value={author} onChange={e => setAuthor(e.target.value)}
              placeholder="作者（可选）"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: `1px solid ${C.border}`, fontSize: 14, color: C.text,
                outline: 'none', background: C.bg, marginBottom: 10, boxSizing: 'border-box',
              }}
            />

            {mode === 'file' && (
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px', borderRadius: 12, border: `1.5px dashed ${C.border}`,
                cursor: 'pointer', color: C.textSecondary, marginBottom: 10,
              }}>
                <Upload size={16} />
                <span style={{ fontSize: 13 }}>{text ? '已导入，点击重新选择' : '选择 .txt / .md 文件'}</span>
                <input type="file" accept=".txt,.md" onChange={handleFile} style={{ display: 'none' }} />
              </label>
            )}

            <textarea
              value={text} onChange={e => setText(e.target.value)}
              placeholder={mode === 'paste' ? '在此粘贴书籍内容...' : '文件内容预览'}
              rows={8}
              style={{
                width: '100%', padding: 14, borderRadius: 12,
                border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7,
                color: C.text, background: C.bg, resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
              }}
            />

            <button
              onClick={handleSubmit}
              disabled={loading || !text.trim()}
              style={{
                width: '100%', marginTop: 14, padding: '12px',
                borderRadius: 12, border: 'none',
                background: text.trim() ? C.accentGradient : C.surface,
                color: text.trim() ? '#fff' : C.textMuted,
                fontSize: 14, fontWeight: 600, cursor: text.trim() ? 'pointer' : 'default',
              }}
            >
              {loading ? '创建中...' : '添加到书架'}
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  )
}

// ─── Featured Card ───

function FeaturedCard({ book, onClick }: { book: Book; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left',
      background: '#FFFCF7', borderRadius: 20,
      padding: '22px 22px 18px', cursor: 'pointer',
      border: 'none', boxShadow: '0 2px 12px rgba(92,75,58,0.06)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: '#E8D9C5', opacity: 0.4,
      }} />

      <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px', color: C.text, lineHeight: 1.3 }}>
        {book.title}
      </h3>
      <p style={{ fontSize: 13, color: C.textSecondary, margin: '0 0 16px' }}>
        {book.author || '未知作者'}
      </p>

      <div style={{ height: 5, borderRadius: 3, background: '#E8DFD3', overflow: 'hidden', marginBottom: 8 }}>
        <div style={{
          height: '100%', borderRadius: 3,
          background: `linear-gradient(90deg, ${C.accentWarm}, ${C.accent})`,
          width: `${book.progress}%`, transition: 'width 0.6s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.textMuted }}>
        <span>已读 {book.progress}%</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <MessageCircle size={14} /> {book.discussion_count} 次讨论
        </span>
      </div>

      {book.last_read_at && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          上次阅读：{new Date(book.last_read_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </button>
  )
}

// ─── Compact Card ───

function CompactCard({ book, onClick, onDelete }: { book: Book; onClick: () => void; onDelete: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#FFFCF7', borderRadius: 16,
      padding: 16, position: 'relative',
      boxShadow: '0 2px 12px rgba(92,75,58,0.06)',
      textAlign: 'left', minHeight: 140,
    }}>
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 22, height: 22, borderRadius: '50%',
          background: 'rgba(200,120,100,0.08)', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.textMuted, opacity: 0.6,
        }}
      >
        <X size={12} />
      </button>

      <div onClick={onClick} style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 3px', color: C.text, lineHeight: 1.3, paddingRight: 20 }}>
          {book.title}
        </h4>
        <p style={{ fontSize: 11, color: C.textSecondary, margin: '0 0 12px' }}>
          {book.author || '未知'}
        </p>

        <div style={{ marginTop: 'auto' }}>
          <div style={{ height: 4, borderRadius: 2, background: '#E8DFD3', overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: book.progress > 0 ? `linear-gradient(90deg, ${C.accentWarm}, ${C.accent})` : 'transparent',
              width: `${book.progress}%`,
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              {book.progress > 0 ? `${book.progress}%` : '未开始'}
            </span>
            {book.discussion_count > 0 && (
              <span style={{ fontSize: 11, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 3 }}>
                <MessageCircle size={12} /> {book.discussion_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───

export default function BookshelfPage() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const fetchBooks = useCallback(async () => {
    try {
      const data = await listBooksAPI()
      setBooks(data)
    } catch (e) {
      console.error('Failed to load books:', e)
      toast.error('加载书架失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBooks() }, [fetchBooks])

  const readingBooks = books.filter(b => b.progress > 0).sort((a, b) => b.progress - a.progress)
  const featured = readingBooks[0]

  async function openBook(book: Book) {
    try {
      const result = await startReadingAPI(book.id)
      navigate(`/read/${result.session_id}`)
    } catch (e) {
      console.error('Failed to start reading:', e)
      toast.error('打开书籍失败')
    }
  }

  return (
    <div style={{
      height: '100%', overflow: 'auto',
      background: C.bg,
      fontFamily: "'Noto Serif SC', 'Source Han Serif SC', Georgia, serif",
      color: C.text,
      WebkitOverflowScrolling: 'touch',
    }}>
      <div style={{ minHeight: '100%', paddingBottom: 40 }}>
        {/* Header */}
        <div style={{ padding: '52px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => navigate('/')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.text, display: 'flex' }}
              >
                <ChevronLeft size={22} />
              </button>
              <h1 style={{ fontSize: 26, fontWeight: 300, margin: 0, letterSpacing: '0.2em', color: C.text }}>
                共 读
              </h1>
            </div>
            <p style={{ fontSize: 13, color: C.textMuted, margin: '6px 0 0', paddingLeft: 38, letterSpacing: '0.05em' }}>
              和小克一起读书
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            width: 40, height: 40, borderRadius: 20,
            background: C.surfaceSolid, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.text, marginTop: 4,
          }}>
            <Plus size={18} />
          </button>
        </div>

        {loading && (
          <p style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 14 }}>加载中...</p>
        )}

        {/* Featured */}
        {featured && (
          <div style={{ padding: '30px 24px 0' }}>
            <h2 style={{ fontSize: 13, fontWeight: 500, color: C.textSecondary, letterSpacing: '0.08em', margin: '0 0 16px', textTransform: 'uppercase' }}>
              正在阅读
            </h2>
            <FeaturedCard book={featured} onClick={() => openBook(featured)} />
          </div>
        )}

        {/* Grid */}
        {!loading && (
          <div style={{ padding: '32px 24px 0' }}>
            <h2 style={{ fontSize: 13, fontWeight: 500, color: C.textSecondary, letterSpacing: '0.08em', margin: '0 0 16px', textTransform: 'uppercase' }}>
              书架 · {books.length} 本
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {books.map(book => (
                <CompactCard key={book.id} book={book} onClick={() => openBook(book)} onDelete={async () => {
                  if (!window.confirm(`确定删除「${book.title}」吗？`)) return
                  // Optimistic: remove from UI immediately
                  setBooks(prev => prev.filter(b => b.id !== book.id))
                  try { await deleteBookAPI(book.id) } catch (e) { console.error(e); fetchBooks() }
                }} />
              ))}
              <button onClick={() => setShowAdd(true)} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'transparent', borderRadius: 16,
                padding: 24, cursor: 'pointer',
                border: `1.5px dashed ${C.border}`,
                color: C.textMuted, gap: 8, minHeight: 140,
              }}>
                <Plus size={18} />
                <span style={{ fontSize: 13 }}>添加</span>
              </button>
            </div>
          </div>
        )}

        {!loading && books.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>📖</div>
            <p style={{ fontSize: 15, color: C.textSecondary, marginBottom: 8 }}>书架还是空的</p>
            <p style={{ fontSize: 13, color: C.textMuted }}>添加一本书，和小克一起读吧</p>
          </div>
        )}
      </div>

      <AddBookSheet show={showAdd} onClose={() => setShowAdd(false)} onCreated={fetchBooks} />
    </div>
  )
}
