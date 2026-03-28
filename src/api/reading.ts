import { client } from './client'

// ---- Types ----

export interface ReadingSection {
  id: number
  content: string
  type: 'paragraph' | 'heading' | 'blockquote' | 'code'
  chapter_index?: number
}

export interface ChapterSummary {
  chapter_index: number
  title: string | null
  summary: string
}

export interface AiBookmark {
  section_index: number
  type: 'proactive' | 'chapter_end'
  content: string
}

export interface ReadProgress {
  current_section: number
  commented_sections: number[]
}

export interface ReadingContent {
  id: string
  session_id: string
  title: string | null
  sections: ReadingSection[]
  total_sections: number
  chapter_summary: ChapterSummary[] | null
  ai_bookmarks: AiBookmark[] | null
  read_progress: ReadProgress
  source_type: string
  created_at: string
}

// ---- Book types ----

export interface Book {
  id: string
  title: string
  author: string | null
  total_sections: number
  total_length: number
  source_type: string
  created_at: string
  progress: number          // 0-100
  last_read_at: string | null
  discussion_count: number
  latest_session_id: string | null
}

// ---- Books API ----

export async function listBooksAPI(): Promise<Book[]> {
  return client.get<Book[]>('/reading/books')
}

export async function createBookAPI(text: string, title?: string, author?: string, sourceType: string = 'paste'): Promise<{
  id: string; title: string; author: string | null; total_sections: number; total_length: number
}> {
  return client.post('/reading/books', { text, title, author, source_type: sourceType })
}

export async function getBookAPI(bookId: string): Promise<any> {
  return client.get(`/reading/books/${bookId}`)
}

export async function deleteBookAPI(bookId: string): Promise<{ ok: boolean }> {
  return client.delete(`/reading/books/${bookId}`)
}

export async function startReadingAPI(bookId: string, model?: string): Promise<{
  session_id: string; book_id: string; resumed: boolean
}> {
  return client.post(`/reading/books/${bookId}/start`, { book_id: bookId, model })
}

// ---- Legacy API ----

export async function uploadReadingContentAPI(
  sessionId: string,
  text: string,
  title?: string,
  sourceType: string = 'paste',
): Promise<{
  content_id: string
  sections: ReadingSection[]
  total_sections: number
  title: string
}> {
  return client.post(`/sessions/${sessionId}/reading-content`, {
    text,
    title,
    source_type: sourceType,
  })
}

export async function getReadingContentAPI(sessionId: string): Promise<ReadingContent> {
  return client.get<ReadingContent>(`/sessions/${sessionId}/reading-content`)
}

export async function updateReadingProgressAPI(
  sessionId: string,
  currentSection: number,
  commentedSections: number[],
): Promise<void> {
  return client.patch(`/sessions/${sessionId}/reading-progress`, {
    current_section: currentSection,
    commented_sections: commentedSections,
  })
}

/**
 * 请求AI批注（SSE流）
 * 返回原始 Response，由 store 处理 SSE 解析
 */
export function streamReadingComment(
  sessionId: string,
  sectionIndex: number,
  token: string,
  selectedText?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
  return fetch(`${BASE_URL}/sessions/${sessionId}/reading-comment`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      section_index: sectionIndex,
      selected_text: selectedText,
    }),
  })
}

/**
 * 读完章节/全书 → 生成 scene 记忆
 */
export async function completeChapterAPI(
  sessionId: string,
  chapterIndex: number,
  chapterTitle?: string,
  isBookComplete: boolean = false,
): Promise<{ ok: boolean; memory_id: string }> {
  return client.post(`/sessions/${sessionId}/reading-chapter-complete`, {
    chapter_index: chapterIndex,
    chapter_title: chapterTitle,
    is_book_complete: isBookComplete,
  })
}
