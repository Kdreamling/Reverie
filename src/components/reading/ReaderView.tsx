import { memo, useCallback, useEffect, useRef } from 'react'
import { useReadingStore, type BubbleState } from '../../stores/readingStore'
import type { ReadingSection, AiBookmark } from '../../api/reading'
import SelectionToolbar from './SelectionToolbar'
import ReadingChatView from './ReadingChatView'

// ---- SectionBlock ----

interface SectionBlockProps {
  section: ReadingSection
  isActive: boolean
  bookmark: AiBookmark | undefined
  bubble: BubbleState | undefined
  onClickSection: (index: number) => void
  onClickBookmark: (index: number) => void
}

export const SectionBlock = memo(function SectionBlock({
  section,
  isActive,
  bookmark,
  bubble,
  onClickSection,
  onClickBookmark,
}: SectionBlockProps) {
  const isHeading = section.type === 'heading'

  return (
    <div className="relative group" data-section-id={section.id} style={{ marginBottom: isHeading ? 8 : 20 }}>
      {/* AI bookmark dot */}
      {bookmark && !bubble && (
        <button
          onClick={(e) => { e.stopPropagation(); onClickBookmark(section.id) }}
          className="absolute transition-all duration-200 hover:scale-150"
          style={{
            left: -20,
            top: isHeading ? 8 : 6,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'rgba(0,47,167,0.35)',
            border: 'none',
            cursor: 'pointer',
          }}
          title="小克想说的话"
        />
      )}

      {/* Section text */}
      <div
        onClick={() => onClickSection(section.id)}
        className="cursor-pointer transition-all duration-150 rounded-lg"
        style={{
          padding: isHeading ? '4px 0' : '6px 8px',
          marginLeft: -8,
          marginRight: -8,
          background: isActive ? 'rgba(0,47,167,0.04)' : 'transparent',
          borderLeft: isActive ? '2px solid rgba(0,47,167,0.3)' : '2px solid transparent',
        }}
      >
        {isHeading ? (
          <h2 style={{
            fontSize: section.content.startsWith('##') ? '1.15rem' : '1.3rem',
            fontWeight: 600,
            color: '#2a3347',
            lineHeight: 1.5,
          }}>
            {section.content.replace(/^#{1,3}\s*/, '')}
          </h2>
        ) : section.type === 'blockquote' ? (
          <blockquote style={{
            borderLeft: '3px solid #d0d7e5',
            paddingLeft: 14,
            color: '#5a6477',
            fontStyle: 'italic',
            lineHeight: 2,
          }}>
            {section.content.replace(/^>\s*/gm, '')}
          </blockquote>
        ) : section.type === 'code' ? (
          <pre style={{
            background: '#f5f7fa',
            borderRadius: 8,
            padding: 14,
            fontSize: '0.85rem',
            lineHeight: 1.6,
            overflow: 'auto',
            color: '#3a4559',
          }}>
            {section.content.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')}
          </pre>
        ) : (
          <p style={{
            lineHeight: 2,
            color: '#3a4559',
            fontSize: '1.05rem',
          }}>
            {section.content}
          </p>
        )}
      </div>

      {/* AI Bubble */}
      {bubble && (
        <AiBubbleInline bubble={bubble} />
      )}
    </div>
  )
})

// ---- AiBubble (inline under section) ----

function AiBubbleInline({ bubble }: { bubble: BubbleState }) {
  return (
    <div
      className="mt-2 ml-4 transition-all duration-300"
      style={{
        background: 'rgba(0,47,167,0.03)',
        border: '1px solid rgba(0,47,167,0.1)',
        borderRadius: 12,
        padding: '10px 14px',
        maxWidth: '85%',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ fontSize: 11, color: '#002FA7', opacity: 0.6 }}>✦</span>
        <span style={{ fontSize: 11, color: '#8a95aa', letterSpacing: '0.03em' }}>小克的纸条</span>
        {bubble.isStreaming && (
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#002FA7' }} />
        )}
      </div>
      <p style={{
        fontSize: '0.92rem',
        lineHeight: 1.7,
        color: '#4a5568',
      }}>
        {bubble.text || '...'}
      </p>
    </div>
  )
}

// ---- ChapterEndCard ----

interface ChapterEndCardProps {
  bookmark: AiBookmark
  onChat: () => void
}

export const ChapterEndCard = memo(function ChapterEndCard({ bookmark, onChat }: ChapterEndCardProps) {
  return (
    <div
      className="mx-auto my-8"
      style={{
        maxWidth: 420,
        background: 'rgba(0,47,167,0.02)',
        border: '1px dashed rgba(0,47,167,0.15)',
        borderRadius: 14,
        padding: '16px 20px',
        textAlign: 'center',
      }}
    >
      <p style={{
        fontSize: '0.9rem',
        color: '#5a6477',
        lineHeight: 1.6,
        marginBottom: 12,
        fontStyle: 'italic',
      }}>
        {bookmark.content}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onChat}
          className="px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer"
          style={{
            background: '#002FA7',
            color: '#fff',
            border: 'none',
          }}
        >
          聊聊
        </button>
        <span style={{ fontSize: '0.75rem', color: '#a0aac0' }}>或继续读 ↓</span>
      </div>
    </div>
  )
})

// ---- ReaderView (main reading area) ----

interface ReaderViewProps {
  sessionId: string
}

export default function ReaderView({ sessionId }: ReaderViewProps) {
  const sections = useReadingStore(s => s.sections)
  const aiBookmarks = useReadingStore(s => s.aiBookmarks)
  const activeSectionIndex = useReadingStore(s => s.activeSectionIndex)
  const bubbles = useReadingStore(s => s.bubbles)
  const pendingBubble = useReadingStore(s => s.pendingBubble)
  const requestComment = useReadingStore(s => s.requestComment)
  const setActiveSectionIndex = useReadingStore(s => s.setActiveSectionIndex)
  const setCurrentSection = useReadingStore(s => s.setCurrentSection)
  const setActiveSelection = useReadingStore(s => s.setActiveSelection)
  const setView = useReadingStore(s => s.setView)
  const view = useReadingStore(s => s.view)
  const isReadThrough = useReadingStore(s => s.isReadThrough)
  const readProgress = useReadingStore(s => s.readProgress)

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasRestoredScrollRef = useRef(false)

  // Build bookmark map for O(1) lookup
  const bookmarkMap = useRef(new Map<number, AiBookmark>())
  if (aiBookmarks) {
    bookmarkMap.current.clear()
    for (const bm of aiBookmarks) {
      // Only show proactive bookmarks as dots (chapter_end shown as cards)
      if (bm.type === 'proactive') {
        bookmarkMap.current.set(bm.section_index, bm)
      }
    }
  }

  const handleClickSection = useCallback((sectionIndex: number) => {
    if (pendingBubble) return  // don't interrupt current stream
    setCurrentSection(sectionIndex)
    setActiveSectionIndex(sectionIndex)
    requestComment(sessionId, sectionIndex)
  }, [sessionId, pendingBubble, setActiveSectionIndex, setCurrentSection, requestComment])

  const handleClickBookmark = useCallback((sectionIndex: number) => {
    // Show the pre-generated bookmark content as a bubble
    const bm = bookmarkMap.current.get(sectionIndex)
    if (!bm) return

    // Set bubble directly from bookmark content (no API call needed)
    const store = useReadingStore.getState()
    const newBubbles = new Map(store.bubbles)
    newBubbles.set(sectionIndex, {
      sectionIndex,
      text: bm.content,
      isStreaming: false,
    })
    useReadingStore.setState({
      bubbles: newBubbles,
      activeSectionIndex: sectionIndex,
      readProgress: {
        ...store.readProgress,
        current_section: sectionIndex,
      },
    })
  }, [])

  // Selection toolbar: user selects text → open chat
  const handleDiscussSelection = useCallback((text: string, sectionIndex: number) => {
    setCurrentSection(sectionIndex)
    setActiveSelection(text)
    setActiveSectionIndex(sectionIndex)
    setView('chat', sectionIndex)
  }, [setCurrentSection, setActiveSelection, setActiveSectionIndex, setView])

  const handleChapterChat = useCallback((sectionIndex: number) => {
    setCurrentSection(sectionIndex)
    setActiveSelection(null)
    setView('chat', sectionIndex)
  }, [setCurrentSection, setActiveSelection, setView])

  const handleCloseChat = useCallback(() => {
    setView('reader')
    setActiveSelection(null)
  }, [setView, setActiveSelection])

  // Group sections by chapter for chapter_end cards
  const chapterEndBookmarks = (aiBookmarks ?? []).filter(b => b.type === 'chapter_end')
  // Find last section index per chapter
  const lastSectionByChapter = new Map<number, number>()
  for (const sec of sections) {
    const ch = sec.chapter_index ?? 0
    lastSectionByChapter.set(ch, sec.id)
  }

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
  }, [sections, readProgress.current_section])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto"
      style={{
        background: '#faf9f7',
      }}
    >
      {/* Reading header area */}
      {isReadThrough && (
        <div className="flex items-center justify-center gap-2 py-3" style={{ color: '#8a95aa', fontSize: '0.8rem' }}>
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#002FA7' }} />
          小克正在通读全文…
        </div>
      )}

      {/* Sections */}
      <div
        ref={contentRef}
        className="relative mx-auto px-6 md:px-10 py-8"
        style={{ maxWidth: 720 }}
      >
        {sections.map((section) => {
          const isLastOfChapter = lastSectionByChapter.get(section.chapter_index ?? 0) === section.id
          const chapterEndBm = isLastOfChapter
            ? chapterEndBookmarks.find(b => {
                // Find chapter_end bookmark closest to this chapter's last section
                const chapterSections = sections.filter(s => s.chapter_index === section.chapter_index)
                const lastId = chapterSections[chapterSections.length - 1]?.id
                return b.section_index === lastId || b.section_index === section.id
              })
            : undefined

          return (
            <div key={section.id}>
              <SectionBlock
                section={section}
                isActive={activeSectionIndex === section.id}
                bookmark={bookmarkMap.current.get(section.id)}
                bubble={bubbles.get(section.id)}
                onClickSection={handleClickSection}
                onClickBookmark={handleClickBookmark}
              />
              {chapterEndBm && (
                <ChapterEndCard
                  bookmark={chapterEndBm}
                  onChat={() => handleChapterChat(section.id)}
                />
              )}
            </div>
          )
        })}

        {/* Selection toolbar */}
        <SelectionToolbar
          containerRef={contentRef}
          onDiscuss={handleDiscussSelection}
        />

        {/* Bottom spacer */}
        <div style={{ height: 120 }} />
      </div>

      {/* Chat slide-in panel */}
      {view === 'chat' && (
        <ReadingChatView sessionId={sessionId} onClose={handleCloseChat} />
      )}
    </div>
  )
}
