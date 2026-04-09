import { create } from 'zustand'
import {
  uploadReadingContentAPI,
  getReadingContentAPI,
  updateReadingProgressAPI,
  type ReadingSection,
  type ChapterSummary,
  type ReadProgress,
} from '../api/reading'

interface ReadingState {
  // Content
  contentId: string | null
  title: string | null
  sections: ReadingSection[]
  totalSections: number
  chapterSummary: ChapterSummary[] | null
  readProgress: ReadProgress

  // UI state
  activeSectionIndex: number | null
  activeSelection: string | null
  view: 'reader' | 'chat'
  chatSectionIndex: number | null  // which section we're discussing in chat

  // Loading states
  isLoadingContent: boolean
  isReadThrough: boolean     // true = 通读中（chapter_summary 还没生成）
  isUploading: boolean

  // Actions
  uploadContent: (sessionId: string, text: string, title?: string, sourceType?: string) => Promise<void>
  loadContent: (sessionId: string) => Promise<void>
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
  readProgress: { current_section: 0, commented_sections: [] as number[] },
  activeSectionIndex: null as number | null,
  activeSelection: null as string | null,
  view: 'reader' as const,
  chatSectionIndex: null as number | null,
  isLoadingContent: false,
  isReadThrough: false,
  isUploading: false,
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
        readProgress: content.read_progress ?? { current_section: 0, commented_sections: [] },
        isLoadingContent: false,
        isReadThrough: !content.chapter_summary,  // 没有摘要则还在通读
      })
      // 如果还在通读，继续轮询
      if (!content.chapter_summary) {
        get().pollReadthrough(sessionId)
      }
    } catch (e) {
      set({ isLoadingContent: false })
      throw e
    }
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
        if (content.chapter_summary) {
          // 通读完成
          if (_pollTimer) clearInterval(_pollTimer)
          _pollTimer = null
          set({
            chapterSummary: content.chapter_summary,
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
    set({ ...INITIAL_STATE })
  },
}))
