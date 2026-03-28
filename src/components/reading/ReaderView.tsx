import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useReadingStore } from '../../stores/readingStore'
import type { ReadingSection } from '../../api/reading'
import ReadingChatView from './ReadingChatView'
import { C } from '../../theme'

interface SectionBlockProps {
  section: ReadingSection
  index: number
}

const SectionBlock = memo(function SectionBlock({ section, index }: SectionBlockProps) {
  const isHeading = section.type === 'heading'

  return (
    <div
      data-section-id={section.id}
      style={{
        marginBottom: isHeading ? 10 : 20,
        opacity: 0,
        animation: `readFadeIn 0.4s ease ${Math.min(index * 0.03, 0.6)}s forwards`,
      }}
    >
      {isHeading ? (
        <h2 style={{
          fontSize: section.content.startsWith('##') ? '1.15rem' : '1.3rem',
          fontWeight: 600, color: C.text, lineHeight: 1.55,
        }}>
          {section.content.replace(/^#{1,3}\s*/, '')}
        </h2>
      ) : section.type === 'blockquote' ? (
        <blockquote style={{
          borderLeft: `3px solid ${C.borderStrong}`,
          paddingLeft: 14, color: C.textSecondary,
          fontStyle: 'italic', lineHeight: 2,
        }}>
          {section.content.replace(/^>\s*/gm, '')}
        </blockquote>
      ) : section.type === 'code' ? (
        <pre style={{
          background: C.surfaceSolid, borderRadius: 8,
          padding: 14, fontSize: '0.85rem', lineHeight: 1.6,
          overflow: 'auto', color: C.text,
        }}>
          {section.content.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')}
        </pre>
      ) : (
        <p style={{
          lineHeight: 2, color: C.text, fontSize: 16,
          textIndent: '2em', letterSpacing: '0.02em',
        }}>
          {section.content}
        </p>
      )}
    </div>
  )
})

function findSectionIdForNode(node: Node | null, container: HTMLElement): number | null {
  let current: Node | null = node
  while (current && current !== container) {
    if (current instanceof HTMLElement && current.dataset.sectionId !== undefined) {
      const sectionId = Number(current.dataset.sectionId)
      return Number.isNaN(sectionId) ? null : sectionId
    }
    current = current.parentNode
  }
  return null
}

function truncateSelection(text: string, limit: number = 20): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

interface ReaderViewProps {
  sessionId: string
}

export default function ReaderView({ sessionId }: ReaderViewProps) {
  const sections = useReadingStore(s => s.sections)
  const readProgress = useReadingStore(s => s.readProgress)
  const isReadThrough = useReadingStore(s => s.isReadThrough)
  const setCurrentSection = useReadingStore(s => s.setCurrentSection)
  const setActiveSelection = useReadingStore(s => s.setActiveSelection)
  const setActiveSectionIndex = useReadingStore(s => s.setActiveSectionIndex)

  const [selectionPreview, setSelectionPreview] = useState('')
  const [selectionSectionIndex, setSelectionSectionIndex] = useState<number | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasRestoredScrollRef = useRef(false)
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSelectionState = useCallback(() => {
    if (selectionDebounceRef.current) {
      clearTimeout(selectionDebounceRef.current)
      selectionDebounceRef.current = null
    }
    setSelectionPreview('')
    setSelectionSectionIndex(null)
    setActiveSelection(null)
  }, [setActiveSelection])

  const openChat = useCallback(() => {
    // If there's a selection, set the section context
    if (selectionSectionIndex !== null) {
      setCurrentSection(selectionSectionIndex)
      setActiveSectionIndex(selectionSectionIndex)
    }
    setChatOpen(true)
    window.getSelection()?.removeAllRanges()
  }, [selectionSectionIndex, setActiveSectionIndex, setCurrentSection])

  const closeChat = useCallback(() => {
    setChatOpen(false)
    setActiveSectionIndex(null)
    clearSelectionState()
  }, [clearSelectionState, setActiveSectionIndex])

  // Reset scroll restore on session change
  useEffect(() => {
    hasRestoredScrollRef.current = false
  }, [sessionId])

  // Intersection observer for tracking read progress
  useEffect(() => {
    const root = scrollRef.current
    const container = contentRef.current
    if (!root || !container || sections.length === 0) return

    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-section-id]'))
    if (nodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const topEntry = visible[0]
        if (!topEntry) return
        const sectionId = Number((topEntry.target as HTMLElement).dataset.sectionId)
        if (!Number.isNaN(sectionId)) setCurrentSection(sectionId)
      },
      { root, threshold: [0.35, 0.6, 0.85] },
    )

    nodes.forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [sections, setCurrentSection])

  // Restore scroll position
  useEffect(() => {
    if (hasRestoredScrollRef.current || sections.length === 0) return
    const targetSection = readProgress.current_section
    const container = contentRef.current
    if (!container) return
    const target = container.querySelector<HTMLElement>(`[data-section-id="${targetSection}"]`)
    hasRestoredScrollRef.current = true
    if (target && targetSection > 0) {
      requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'auto' }))
    }
  }, [readProgress.current_section, sections])

  // Text selection detection
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    const handleSelectionChange = () => {
      if (chatOpen) return
      if (selectionDebounceRef.current) clearTimeout(selectionDebounceRef.current)

      selectionDebounceRef.current = setTimeout(() => {
        const selection = window.getSelection()
        const text = selection?.toString().trim() ?? ''

        if (!selection || selection.isCollapsed || text.length === 0 || selection.rangeCount === 0) {
          clearSelectionState()
          return
        }

        const range = selection.getRangeAt(0)
        if (!container.contains(range.commonAncestorContainer)) {
          clearSelectionState()
          return
        }

        const sectionId =
          findSectionIdForNode(range.startContainer, container) ??
          findSectionIdForNode(range.commonAncestorContainer, container)

        if (sectionId === null) { clearSelectionState(); return }

        setActiveSelection(text)
        setActiveSectionIndex(sectionId)
        setSelectionSectionIndex(sectionId)
        setSelectionPreview(truncateSelection(text))
      }, 200)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      if (selectionDebounceRef.current) {
        clearTimeout(selectionDebounceRef.current)
        selectionDebounceRef.current = null
      }
    }
  }, [clearSelectionState, setActiveSectionIndex, setActiveSelection, chatOpen])

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: C.bg }}>
      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ userSelect: 'text', WebkitUserSelect: 'text', WebkitOverflowScrolling: 'touch' }}
      >
        {isReadThrough && (
          <div className="flex items-center justify-center gap-2 py-3" style={{ color: C.textMuted, fontSize: '0.8rem' }}>
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: C.accent }} />
            小克正在通读全文...
          </div>
        )}

        <div ref={contentRef} className="mx-auto px-7 md:px-10 py-8" style={{ maxWidth: 720, paddingBottom: 100 }}>
          {sections.map((section, i) => (
            <SectionBlock key={section.id} section={section} index={i} />
          ))}
        </div>
      </div>

      {/* Floating chat button */}
      {!chatOpen && (
        <button
          onClick={openChat}
          style={{
            position: 'fixed',
            right: 16,
            bottom: 'max(20px, calc(12px + env(safe-area-inset-bottom)))',
            zIndex: 30,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: selectionPreview ? '10px 16px' : '0',
            width: selectionPreview ? 'auto' : 48,
            height: 48,
            borderRadius: 24,
            background: C.text,
            color: '#FFFCF7',
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(92,75,58,0.25)',
            transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
            justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          {selectionPreview && (
            <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
              聊「{selectionPreview}」
            </span>
          )}
        </button>
      )}

      {/* Chat sheet overlay */}
      {chatOpen && (
        <ReadingChatView sessionId={sessionId} onClose={closeChat} />
      )}

      <style>{`
        @keyframes readFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
