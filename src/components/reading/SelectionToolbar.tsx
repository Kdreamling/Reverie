import { useEffect, useState, useRef, useCallback } from 'react'
import { MessageCircle } from 'lucide-react'

interface SelectionToolbarProps {
  containerRef: React.RefObject<HTMLElement | null>
  onDiscuss: (text: string, sectionIndex: number) => void
}

export default function SelectionToolbar({ containerRef, onDiscuss }: SelectionToolbarProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [sectionIndex, setSectionIndex] = useState<number | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const handleMouseUp = useCallback(() => {
    // Small delay to let selection finalize
    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setVisible(false)
        return
      }

      const text = selection.toString().trim()
      if (text.length < 2) {
        setVisible(false)
        return
      }

      // Find which section the selection is in
      const range = selection.getRangeAt(0)
      const container = containerRef.current
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setVisible(false)
        return
      }

      // Walk up to find [data-section-id]
      let node: Node | null = range.commonAncestorContainer
      let secIdx: number | null = null
      while (node && node !== container) {
        if (node instanceof HTMLElement && node.dataset.sectionId !== undefined) {
          secIdx = parseInt(node.dataset.sectionId, 10)
          break
        }
        node = node.parentNode
      }

      if (secIdx === null) {
        setVisible(false)
        return
      }

      // Position toolbar above selection
      const rect = range.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      setPosition({
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
      })
      setSelectedText(text)
      setSectionIndex(secIdx)
      setVisible(true)
    }, 10)
  }, [containerRef])

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Hide toolbar when clicking outside it
    if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
      setVisible(false)
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [containerRef, handleMouseUp, handleMouseDown])

  if (!visible || sectionIndex === null) return null

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 flex items-center gap-1 px-2 py-1 rounded-lg shadow-lg transition-all duration-150"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)',
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      }}
    >
      <button
        onClick={() => {
          onDiscuss(selectedText, sectionIndex)
          setVisible(false)
          window.getSelection()?.removeAllRanges()
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-100 cursor-pointer"
        style={{
          color: '#002FA7',
          background: 'rgba(0,47,167,0.06)',
          border: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,47,167,0.12)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,47,167,0.06)')}
      >
        <MessageCircle size={13} />
        聊聊这段
      </button>
    </div>
  )
}
