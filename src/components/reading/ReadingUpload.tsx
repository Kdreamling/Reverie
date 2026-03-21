import { useState, useRef, useCallback } from 'react'
import { Upload, ClipboardPaste } from 'lucide-react'
import { useReadingStore } from '../../stores/readingStore'

interface ReadingUploadProps {
  sessionId: string
  onUploaded: () => void
}

export default function ReadingUpload({ sessionId, onUploaded }: ReadingUploadProps) {
  const [mode, setMode] = useState<'choose' | 'paste'>('choose')
  const [pasteText, setPasteText] = useState('')
  const [title, setTitle] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadContent = useReadingStore(s => s.uploadContent)
  const isUploading = useReadingStore(s => s.isUploading)

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      alert('目前只支持 .txt 和 .md 文件')
      return
    }

    const text = await file.text()
    if (!text.trim()) {
      alert('文件内容为空')
      return
    }

    const fileName = file.name.replace(/\.(txt|md)$/, '')
    try {
      await uploadContent(sessionId, text, fileName, 'file')
      onUploaded()
    } catch (e) {
      alert('上传失败，请重试')
      console.error(e)
    }
  }, [sessionId, uploadContent, onUploaded])

  const handlePasteSubmit = useCallback(async () => {
    if (!pasteText.trim()) return
    try {
      await uploadContent(sessionId, pasteText, title || undefined, 'paste')
      onUploaded()
    } catch (e) {
      alert('上传失败，请重试')
      console.error(e)
    }
  }, [sessionId, pasteText, title, uploadContent, onUploaded])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  if (isUploading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#002FA7', borderTopColor: 'transparent' }} />
        <p style={{ color: '#8a95aa', fontSize: '0.9rem' }}>正在处理文本…</p>
      </div>
    )
  }

  if (mode === 'paste') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="w-full flex flex-col gap-4">
          <button
            onClick={() => setMode('choose')}
            className="self-start text-xs cursor-pointer"
            style={{ color: '#8a95aa' }}
          >
            ← 返回
          </button>

          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="标题（可选）"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: '#f5f4f2',
              border: '1px solid #e8e6e3',
              color: '#3a4559',
            }}
          />

          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="把要一起读的文字粘贴到这里…"
            className="w-full rounded-xl text-sm outline-none resize-none"
            style={{
              background: '#f5f4f2',
              border: '1px solid #e8e6e3',
              color: '#3a4559',
              padding: '14px 16px',
              minHeight: 280,
              lineHeight: 1.8,
              fontSize: '0.95rem',
            }}
            autoFocus
          />

          <div className="flex items-center justify-between">
            <span style={{ fontSize: '0.75rem', color: '#a0aac0' }}>
              {pasteText.length > 0 ? `${pasteText.length} 字` : ''}
            </span>
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="px-6 py-2 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: pasteText.trim() ? '#002FA7' : '#d0d7e5',
                color: '#fff',
                border: 'none',
              }}
            >
              开始共读
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 px-6">
      <div className="flex flex-col items-center gap-3">
        <span style={{ color: '#002FA7', fontSize: 22, opacity: 0.4 }}>✦</span>
        <p style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          letterSpacing: '0.2em',
          color: '#c8cfe0',
          fontSize: '1rem',
        }}>
          共读
        </p>
        <p style={{ color: '#a0aac0', fontSize: '0.85rem' }}>
          上传一段文字，我们一起读
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full" style={{ maxWidth: 440 }}>
        {/* 粘贴文本 */}
        <button
          onClick={() => setMode('paste')}
          className="flex flex-col items-center gap-3 px-6 py-6 rounded-2xl transition-all duration-150 cursor-pointer"
          style={{
            background: 'rgba(0,0,0,0.02)',
            border: '1px solid #e8e6e3',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(0,47,167,0.04)'
            e.currentTarget.style.borderColor = 'rgba(0,47,167,0.2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.02)'
            e.currentTarget.style.borderColor = '#e8e6e3'
          }}
        >
          <ClipboardPaste size={24} style={{ color: '#8a95aa' }} />
          <span style={{ fontSize: '0.9rem', color: '#5a6477', fontWeight: 500 }}>粘贴文本</span>
        </button>

        {/* 上传文件 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="flex flex-col items-center gap-3 px-6 py-6 rounded-2xl transition-all duration-150 cursor-pointer"
          style={{
            background: dragOver ? 'rgba(0,47,167,0.06)' : 'rgba(0,0,0,0.02)',
            border: dragOver ? '1px solid rgba(0,47,167,0.3)' : '1px solid #e8e6e3',
          }}
          onMouseEnter={e => {
            if (!dragOver) {
              e.currentTarget.style.background = 'rgba(0,47,167,0.04)'
              e.currentTarget.style.borderColor = 'rgba(0,47,167,0.2)'
            }
          }}
          onMouseLeave={e => {
            if (!dragOver) {
              e.currentTarget.style.background = 'rgba(0,0,0,0.02)'
              e.currentTarget.style.borderColor = '#e8e6e3'
            }
          }}
        >
          <Upload size={24} style={{ color: '#8a95aa' }} />
          <span style={{ fontSize: '0.9rem', color: '#5a6477', fontWeight: 500 }}>上传文件</span>
          <span style={{ fontSize: '0.7rem', color: '#b0b8c8' }}>.txt / .md</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFileUpload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
