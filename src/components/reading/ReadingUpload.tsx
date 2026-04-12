import { useState, useRef, useCallback } from 'react'
import { Upload, ClipboardPaste } from 'lucide-react'
import { useReadingStore } from '../../stores/readingStore'
import { parseFileToText, getBaseName, UnsupportedFormatError } from '../../utils/fileParser'
import { C } from '../../theme'

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

  const [parsing, setParsing] = useState(false)

  const handleFileUpload = useCallback(async (file: File) => {
    setParsing(true)
    let text: string
    try {
      text = await parseFileToText(file)
    } catch (e) {
      setParsing(false)
      if (e instanceof UnsupportedFormatError) {
        alert('目前支持 .txt / .md / .pdf / .docx')
      } else {
        alert('文件解析失败，可能是受保护或损坏的文件')
        console.error(e)
      }
      return
    }
    setParsing(false)
    if (!text.trim()) { alert('文件内容为空'); return }
    const fileName = getBaseName(file.name)
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

  if (isUploading || parsing) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: C.accent, borderTopColor: 'transparent' }} />
        <p style={{ color: C.textMuted, fontSize: '0.9rem' }}>{parsing ? '正在解析文件...' : '正在处理文本...'}</p>
      </div>
    )
  }

  if (mode === 'paste') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="w-full flex flex-col gap-4">
          <button onClick={() => setMode('choose')} className="self-start text-xs cursor-pointer" style={{ color: C.textMuted, background: 'none', border: 'none' }}>
            ← 返回
          </button>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="标题（可选）"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: C.surfaceSolid, border: `1px solid ${C.border}`, color: C.text }}
          />
          <textarea
            value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder="把要一起读的文字粘贴到这里..."
            className="w-full rounded-xl text-sm outline-none resize-none"
            style={{
              background: C.surfaceSolid, border: `1px solid ${C.border}`,
              color: C.text, padding: '14px 16px', minHeight: 280, lineHeight: 1.8, fontSize: '0.95rem',
            }}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '0.75rem', color: C.textMuted }}>
              {pasteText.length > 0 ? `${pasteText.length} 字` : ''}
            </span>
            <button
              onClick={handlePasteSubmit} disabled={!pasteText.trim()}
              className="px-6 py-2 rounded-full text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: pasteText.trim() ? C.accentGradient : C.surface, color: '#fff', border: 'none' }}
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
        <span style={{ color: C.accent, fontSize: 22, opacity: 0.4 }}>✦</span>
        <p style={{ letterSpacing: '0.2em', color: C.textMuted, fontSize: '1rem' }}>共读</p>
        <p style={{ color: C.textMuted, fontSize: '0.85rem' }}>上传一段文字，我们一起读</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full" style={{ maxWidth: 440 }}>
        <button
          onClick={() => setMode('paste')}
          className="flex flex-col items-center gap-3 px-6 py-6 rounded-2xl transition-all duration-150 cursor-pointer"
          style={{ background: C.bg, border: `1.5px dashed ${C.border}` }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border as string }}
        >
          <ClipboardPaste size={24} style={{ color: C.textSecondary }} />
          <span style={{ fontSize: '0.9rem', color: C.text, fontWeight: 500 }}>粘贴文本</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="flex flex-col items-center gap-3 px-6 py-6 rounded-2xl transition-all duration-150 cursor-pointer"
          style={{
            background: dragOver ? C.sidebarActive : C.bg,
            border: `1.5px dashed ${dragOver ? C.accent : C.border}`,
          }}
          onMouseEnter={e => { if (!dragOver) e.currentTarget.style.borderColor = C.accent }}
          onMouseLeave={e => { if (!dragOver) e.currentTarget.style.borderColor = C.border as string }}
        >
          <Upload size={24} style={{ color: C.textSecondary }} />
          <span style={{ fontSize: '0.9rem', color: C.text, fontWeight: 500 }}>上传文件</span>
          <span style={{ fontSize: '0.7rem', color: C.textMuted }}>.txt / .md / .pdf / .docx</span>
        </button>
      </div>

      <input
        ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx" className="hidden"
        onChange={e => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); e.target.value = '' }}
      />
    </div>
  )
}
