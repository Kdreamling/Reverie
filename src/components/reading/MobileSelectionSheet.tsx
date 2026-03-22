import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { ReadingSection } from '../../api/reading'

interface MobileSelectionSheetProps {
  section: ReadingSection
  onClose: () => void
  onDiscussSection: (sectionIndex: number) => void
  onDiscussSelection: (text: string, sectionIndex: number) => void
}

export default function MobileSelectionSheet({
  section,
  onClose,
  onDiscussSection,
  onDiscussSelection,
}: MobileSelectionSheetProps) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectionMode(false)
    setSelectedText('')
    window.getSelection()?.removeAllRanges()
  }, [section.id])

  useEffect(() => {
    if (!selectionMode) return

    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectedText('')
        return
      }

      const range = selection.getRangeAt(0)
      if (!textRef.current || !textRef.current.contains(range.commonAncestorContainer)) {
        setSelectedText('')
        return
      }

      setSelectedText(selection.toString().trim())
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [selectionMode])

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.18)' }}
        onClick={onClose}
      />

      <div
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-[24px] px-5 pt-4 pb-6"
        style={{
          background: '#faf9f7',
          boxShadow: '0 -10px 32px rgba(0,0,0,0.12)',
          maxHeight: '72vh',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p style={{ fontSize: '0.95rem', color: '#2a3347', fontWeight: 600 }}>段落讨论</p>
            <p style={{ fontSize: '0.75rem', color: '#8a95aa', marginTop: 2 }}>
              长按进入，避免和点按批注冲突
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.04)', border: 'none', color: '#5a6477' }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          ref={textRef}
          className="overflow-y-auto rounded-2xl px-4 py-4"
          style={{
            background: selectionMode ? '#fff' : 'rgba(0,0,0,0.025)',
            border: '1px solid rgba(0,0,0,0.06)',
            maxHeight: '38vh',
            userSelect: selectionMode ? 'text' : 'none',
            WebkitUserSelect: selectionMode ? 'text' : 'none',
          }}
        >
          <p style={{ fontSize: '1rem', lineHeight: 1.9, color: '#3a4559' }}>
            {section.content.replace(/^#{1,3}\s*/, '')}
          </p>
        </div>

        {selectionMode && (
          <div
            className="mt-3 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(0,47,167,0.04)', border: '1px solid rgba(0,47,167,0.1)' }}
          >
            <p style={{ fontSize: '0.78rem', color: '#6b7a94', marginBottom: 6 }}>
              {selectedText ? '已选中的文字' : '先在上面的段落里选中文字'}
            </p>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: '#3a4559', minHeight: 24 }}>
              {selectedText || ' '}
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => onDiscussSection(section.id)}
            className="flex-1 rounded-full px-4 py-3 text-sm font-medium cursor-pointer"
            style={{ background: '#002FA7', color: '#fff', border: 'none' }}
          >
            讨论整段
          </button>

          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="flex-1 rounded-full px-4 py-3 text-sm font-medium cursor-pointer"
              style={{ background: 'rgba(0,0,0,0.05)', color: '#3a4559', border: 'none' }}
            >
              选择部分文字
            </button>
          ) : (
            <button
              onClick={() => {
                if (!selectedText.trim()) return
                onDiscussSelection(selectedText.trim(), section.id)
                onClose()
              }}
              disabled={!selectedText.trim()}
              className="flex-1 rounded-full px-4 py-3 text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(0,0,0,0.05)', color: '#3a4559', border: 'none' }}
            >
              确认讨论
            </button>
          )}
        </div>
      </div>
    </>
  )
}
