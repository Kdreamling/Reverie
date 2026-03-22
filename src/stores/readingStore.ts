import { create } from 'zustand'
import {
  uploadReadingContentAPI,
  getReadingContentAPI,
  updateReadingProgressAPI,
  streamReadingComment,
  type ReadingSection,
  type ChapterSummary,
  type AiBookmark,
  type ReadProgress,
} from '../api/reading'

// ---- Types ----

export interface BubbleState {
  sectionIndex: number
  text: string
  isStreaming: boolean
  selectedText?: string
}

interface ReadingState {
  // Content
  contentId: string | null
  title: string | null
  sections: ReadingSection[]
  totalSections: number
  chapterSummary: ChapterSummary[] | null
  aiBookmarks: AiBookmark[] | null
  readProgress: ReadProgress

  // UI state
  activeSectionIndex: number | null
  activeSelection: string | null
  bubbles: Map<number, BubbleState>
  view: 'reader' | 'chat'
  chatSectionIndex: number | null  // which section we're discussing in chat

  // Loading states
  isLoadingContent: boolean
  isReadThrough: boolean     // true = 通读中 (轮询 ai_bookmarks)
  pendingBubble: boolean     // a comment stream is in progress
  isUploading: boolean

  // Abort controller for current comment stream
  _commentAbort: AbortController | null

  // Actions
  uploadContent: (sessionId: string, text: string, title?: string, sourceType?: string) => Promise<void>
  loadContent: (sessionId: string) => Promise<void>
  requestComment: (sessionId: string, sectionIndex: number, selectedText?: string) => Promise<void>
  cancelComment: () => void
  saveProgress: (sessionId: string) => Promise<void>
  setActiveSectionIndex: (index: number | null) => void
  setCurrentSection: (index: number) => void
  setActiveSelection: (text: string | null) => void
  setView: (view: 'reader' | 'chat', sectionIndex?: number) => void
  pollReadthrough: (sessionId: string) => void
  reset: () => void
}

// Polling state (outside store to avoid re-renders)
let _pollTimer: ReturnType<typeof setInterval> | null = null

const INITIAL_STATE = {
  contentId: null,
  title: null,
  sections: [] as ReadingSection[],
  totalSections: 0,
  chapterSummary: null as ChapterSummary[] | null,
  aiBookmarks: null as AiBookmark[] | null,
  readProgress: { current_section: 0, commented_sections: [] as number[] },
  activeSectionIndex: null as number | null,
  activeSelection: null as string | null,
  bubbles: new Map<number, BubbleState>(),
  view: 'reader' as const,
  chatSectionIndex: null as number | null,
  isLoadingContent: false,
  isReadThrough: false,
  pendingBubble: false,
  isUploading: false,
  _commentAbort: null as AbortController | null,
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  ...INITIAL_STATE,

  async uploadContent(sessionId, text, title, sourceType = 'paste') {
    set({ isUploading: true })
    try {
      const res = await uploadReadingContentAPI(sessionId, text, title, sourceType)
      set({
        contentId: res.content_id,
        title: res.title,
        sections: res.sections,
        totalSections: res.total_sections,
        isUploading: false,
        isReadThrough: true,  // 开始等待通读
      })
      // 开始轮询
      get().pollReadthrough(sessionId)
    } catch (e) {
      set({ isUploading: false })
      throw e
    }
  },

  async loadContent(sessionId) {
    set({ isLoadingContent: true })
    try {
      const content = await getReadingContentAPI(sessionId)
      set({
        contentId: content.id,
        title: content.title,
        sections: content.sections,
        totalSections: content.total_sections,
        chapterSummary: content.chapter_summary,
        aiBookmarks: content.ai_bookmarks,
        readProgress: content.read_progress ?? { current_section: 0, commented_sections: [] },
        isLoadingContent: false,
        isReadThrough: !content.ai_bookmarks,  // 没有标记则还在通读
      })
      // 如果还在通读，继续轮询
      if (!content.ai_bookmarks) {
        get().pollReadthrough(sessionId)
      }
    } catch (e) {
      set({ isLoadingContent: false })
      throw e
    }
  },

  async requestComment(sessionId, sectionIndex, selectedText) {
    // 取消之前的流
    get().cancelComment()

    const abort = new AbortController()
    const newBubbles = new Map(get().bubbles)
    newBubbles.set(sectionIndex, {
      sectionIndex,
      text: '',
      isStreaming: true,
      selectedText,
    })
    set({
      pendingBubble: true,
      activeSectionIndex: sectionIndex,
      bubbles: newBubbles,
      _commentAbort: abort,
    })

    try {
      const token = localStorage.getItem('token') ?? ''
      const res = await streamReadingComment(sessionId, sectionIndex, token, selectedText, abort.signal)

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        if (abort.signal.aborted) break
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') break

          try {
            const event = JSON.parse(payload)
            if (event.type === 'text_delta' && event.content) {
              // Update bubble in-place
              const bubbles = get().bubbles
              const bubble = bubbles.get(sectionIndex)
              if (bubble) {
                bubble.text += event.content
                // Force re-render by creating new Map ref
                set({ bubbles: new Map(bubbles) })
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      // Mark bubble as done
      const finalBubbles = new Map(get().bubbles)
      const finalBubble = finalBubbles.get(sectionIndex)
      if (finalBubble) {
        finalBubble.isStreaming = false
        set({ bubbles: finalBubbles })
      }

      // Update commented sections in progress
      const progress = { ...get().readProgress }
      if (!progress.commented_sections.includes(sectionIndex)) {
        progress.commented_sections = [...progress.commented_sections, sectionIndex]
        set({ readProgress: progress })
      }

    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error('[readingStore] comment stream error:', e)
      }
      // Mark bubble as done with error
      const bubbles = new Map(get().bubbles)
      const bubble = bubbles.get(sectionIndex)
      if (bubble) {
        bubble.isStreaming = false
        if (!bubble.text) bubble.text = '（批注生成失败，请重试）'
        set({ bubbles })
      }
    } finally {
      set({ pendingBubble: false, _commentAbort: null })
    }
  },

  cancelComment() {
    const abort = get()._commentAbort
    if (abort) abort.abort()
    set({ _commentAbort: null, pendingBubble: false })
  },

  async saveProgress(sessionId) {
    const { readProgress } = get()
    try {
      await updateReadingProgressAPI(sessionId, readProgress.current_section, readProgress.commented_sections)
    } catch (e) {
      console.error('[readingStore] save progress error:', e)
    }
  },

  setActiveSectionIndex(index) {
    set({ activeSectionIndex: index })
  },

  setCurrentSection(index) {
    set(state => ({
      readProgress: {
        ...state.readProgress,
        current_section: index,
      },
    }))
  },

  setActiveSelection(text) {
    set({ activeSelection: text })
  },

  setView(view, sectionIndex) {
    set({ view, chatSectionIndex: sectionIndex ?? get().activeSectionIndex })
  },

  pollReadthrough(sessionId) {
    // Clear any existing poll
    if (_pollTimer) {
      clearInterval(_pollTimer)
      _pollTimer = null
    }

    let attempts = 0
    const MAX_ATTEMPTS = 40  // 40 * 3s = 120s max

    _pollTimer = setInterval(async () => {
      attempts++
      if (attempts > MAX_ATTEMPTS) {
        if (_pollTimer) clearInterval(_pollTimer)
        _pollTimer = null
        set({ isReadThrough: false })
        return
      }

      try {
        const content = await getReadingContentAPI(sessionId)
        if (content.ai_bookmarks !== null && content.ai_bookmarks !== undefined) {
          // 通读完成（包括空数组也算完成）
          if (_pollTimer) clearInterval(_pollTimer)
          _pollTimer = null
          set({
            chapterSummary: content.chapter_summary,
            aiBookmarks: content.ai_bookmarks,
            isReadThrough: false,
          })
        }
      } catch {
        // ignore, retry
      }
    }, 3000)
  },

  reset() {
    if (_pollTimer) {
      clearInterval(_pollTimer)
      _pollTimer = null
    }
    get().cancelComment()
    set({ ...INITIAL_STATE, bubbles: new Map() })
  },
}))
