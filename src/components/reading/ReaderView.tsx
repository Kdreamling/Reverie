import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useReadingStore } from '../../stores/readingStore'
import type { ReadingSection } from '../../api/reading'
import FloatingChatButton from './FloatingChatButton'
import ReadingChatView from './ReadingChatView'

interface SectionBlockProps {
  section: ReadingSection
}

const SectionBlock = memo(function SectionBlock({ section }: SectionBlockProps) {
  const isHeading = section.type === 'heading'

  return (
    <div data-section-id={section.id} style={{ marginBottom: isHeading ? 10 : 22 }}>
      {isHeading ? (
        <h2
          style={{
            fontSize: section.content.startsWith('##') ? '1.15rem' : '1.3rem',
            fontWeight: 600,
            color: '#2a3347',
            lineHeight: 1.55,
          }}
        >
          {section.content.replace(/^#{1,3}\s*/, '')}
        </h2>
      ) : section.type === 'blockquote' ? (
        <blockquote
          style={{
            borderLeft: '3px solid #d0d7e5',
            paddingLeft: 14,
            color: '#5a6477',
            fontStyle: 'italic',
            lineHeight: 2,
          }}
        >
          {section.content.replace(/^>\s*/gm, '')}
        </blockquote>
      ) : section.type === 'code' ? (
        <pre
          style={{
            background: '#f5f7fa',
            borderRadius: 8,
            padding: 14,
            fontSize: '0.85rem',
            lineHeight: 1.6,
            overflow: 'auto',
            color: '#3a4559',
          }}
        >
          {section.content.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')}
        </pre>
      ) : (
        <p
          style={{
            lineHeight: 2,
            color: '#3a4559',
            fontSize: '1.05rem',
          }}
        >
          {section.content}
        </p>
      )}
    </div>
  )
})

interface ReaderViewProps {
  sessionId: string
}

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

function truncateSelection(text: string, limit: number = 15): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

export default function ReaderView({ sessionId }: ReaderViewProps) {
  const sections = useReadingStore(s => s.sections)
  const readProgress = useReadingStore(s => s.readProgress)
  const isReadThrough = useReadingStore(s => s.isReadThrough)
  const setCurrentSection = useReadingStore(s => s.setCurrentSection)
  const setActiveSelection = useReadingStore(s => s.setActiveSelection)
  const setActiveSectionIndex = useReadingStore(s => s.setActiveSectionIndex)
  const setView = useReadingStore(s => s.setView)
  const view = useReadingStore(s => s.view)

  const [selectionPreview, setSelectionPreview] = useState('')
  const [selectionSectionIndex, setSelectionSectionIndex] = useState<number | null>(null)
  const [showFloatingButton, setShowFloatingButton] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasRestoredScrollRef = useRef(false)
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSelectionState = useCallback((clearStoredSelection: boolean) => {
    if (selectionDebounceRef.current) {
      clearTimeout(selectionDebounceRef.current)
      selectionDebounceRef.current = null
    }

    setShowFloatingButton(false)
    setSelectionPreview('')
    setSelectionSectionIndex(null)

    if (clearStoredSelection) {
      setActiveSelection(null)
    }
  }, [setActiveSelection])

  const openSelectionDiscussion = useCallback(() => {
    const selectedText = useReadingStore.getState().activeSelection?.trim()
    if (!selectedText || selectionSectionIndex === null) return

    setCurrentSection(selectionSectionIndex)
    setActiveSectionIndex(selectionSectionIndex)
    setView('chat', selectionSectionIndex)
    setShowFloatingButton(false)

    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges()
    }
  }, [selectionSectionIndex, setActiveSectionIndex, setCurrentSection, setView])

  const handleCloseChat = useCallback(() => {
    setView('reader')
    setActiveSectionIndex(null)
    clearSelectionState(true)
  }, [clearSelectionState, setActiveSectionIndex, setView])

  useEffect(() => {
    hasRestoredScrollRef.current = false
  }, [sessionId])

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
        if (!Number.isNaN(sectionId)) {
          setCurrentSection(sectionId)
        }
      },
      {
        root,
        threshold: [0.35, 0.6, 0.85],
      },
    )

    nodes.forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [sections, setCurrentSection])

  useEffect(() => {
    if (hasRestoredScrollRef.current || sections.length === 0) return

    const targetSection = readProgress.current_section
    const container = contentRef.current
    if (!container) return

    const target = container.querySelector<HTMLElement>(`[data-section-id="${targetSection}"]`)
    hasRestoredScrollRef.current = true

    if (target && targetSection > 0) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'center', behavior: 'auto' })
      })
    }
  }, [readProgress.current_section, sections])

  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    const handleSelectionChange = () => {
      if (view === 'chat') return

      if (selectionDebounceRef.current) {
        clearTimeout(selectionDebounceRef.current)
      }

      selectionDebounceRef.current = setTimeout(() => {
        const selection = window.getSelection()
        const text = selection?.toString().trim() ?? ''

        if (!selection || selection.isCollapsed || text.length === 0 || selection.rangeCount === 0) {
          clearSelectionState(true)
          return
        }

        const range = selection.getRangeAt(0)
        if (!container.contains(range.commonAncestorContainer)) {
          clearSelectionState(true)
          return
        }

        const sectionId =
          findSectionIdForNode(range.startContainer, container) ??
          findSectionIdForNode(range.commonAncestorContainer, container)

        if (sectionId === null) {
          clearSelectionState(true)
          return
        }

        setActiveSelection(text)
        setActiveSectionIndex(sectionId)
        setSelectionSectionIndex(sectionId)
        setSelectionPreview(truncateSelection(text))
        setShowFloatingButton(true)
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
  }, [clearSelectionState, setActiveSectionIndex, setActiveSelection, view])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto"
      style={{ background: '#faf9f7' }}
    >
      {isReadThrough && (
        <div className="flex items-center justify-center gap-2 py-3" style={{ color: '#8a95aa', fontSize: '0.8rem' }}>
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#002FA7' }} />
          小克正在通读全文...
        </div>
      )}

      <div
        ref={contentRef}
        className="mx-auto px-6 md:px-10 py-8"
        style={{ maxWidth: 720 }}
      >
        {sections.map(section => (
          <SectionBlock key={section.id} section={section} />
        ))}

        <div style={{ height: 120 }} />
      </div>

      <FloatingChatButton
        visible={showFloatingButton && view !== 'chat'}
        preview={selectionPreview}
        onClick={openSelectionDiscussion}
      />

      {view === 'chat' && (
        <ReadingChatView sessionId={sessionId} onClose={handleCloseChat} />
      )}
    </div>
  )
}
