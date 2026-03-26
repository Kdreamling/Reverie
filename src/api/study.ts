import { client } from './client'

export interface Question {
  id: number
  type: 'choice' | 'fill' | 'reading' | 'translation'
  question: string
  passage?: string // for reading comprehension
  options?: string[]
  answer: string
  knowledge?: string
}

export interface GenerateParams {
  question_types: string[]
  count: number
  include_errors?: boolean
}

export interface StudyError {
  id: string
  question_type: string
  question: string
  correct_answer: string
  user_answer?: string
  explanation?: string
  tags: string[]
  mastered: boolean
  created_at: string
}

export function generateQuestions(params: GenerateParams) {
  return client.post<{ questions: Question[]; count: number }>('/study/generate', params)
}

export function explainWrong(wrongQuestions: Array<{ question: string; user_answer: string; correct_answer: string; knowledge?: string }>) {
  return client.post<{ explanation: string }>('/study/explain', { wrong_questions: wrongQuestions })
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function explainChat(question: Record<string, string>, messages: ChatMessage[] = [], userMessage?: string) {
  return client.post<{ reply: string; messages: ChatMessage[] }>('/study/explain-chat', {
    question,
    messages,
    user_message: userMessage,
  })
}

export function saveErrorsBatch(errors: Array<{
  question_type: string
  question: string
  correct_answer: string
  user_answer?: string
  tags?: string[]
}>) {
  return client.post<{ saved: number }>('/study/errors/batch', { errors })
}

export function listErrors(params?: { mastered?: boolean }) {
  const query = new URLSearchParams()
  if (params?.mastered !== undefined) query.set('mastered', String(params.mastered))
  const qs = query.toString()
  return client.get<{ errors: StudyError[]; total: number }>(`/study/errors${qs ? `?${qs}` : ''}`)
}

export function updateError(id: string, data: { mastered?: boolean; review_count?: number }) {
  return client.patch<StudyError>(`/study/errors/${id}`, data)
}

export function deleteError(id: string) {
  return client.delete<{ ok: boolean }>(`/study/errors/${id}`)
}

export function getErrorStats() {
  return client.get<{ total: number; mastered: number; unmastered: number }>('/study/errors/stats')
}

// Study sessions
export interface ExplainData {
  current_index: number
  histories: Record<string, ChatMessage[]>
}

export interface StudySession {
  id: string
  questions: Question[]
  answers: Record<string, string>
  score?: number
  total: number
  status: 'in_progress' | 'completed'
  explain_data?: ExplainData
  created_at: string
  updated_at: string
}

export function listStudySessions(status?: string) {
  const qs = status ? `?status=${status}` : ''
  return client.get<{ sessions: StudySession[] }>(`/study/sessions${qs}`)
}

export function createStudySession(questions: Question[]) {
  return client.post<{ id: string }>('/study/sessions', { questions, status: 'in_progress' })
}

export function getStudySession(id: string) {
  return client.get<StudySession>(`/study/sessions/${id}`)
}

export function updateStudySession(id: string, data: { answers?: Record<string, string>; score?: number; status?: string; explain_data?: ExplainData }) {
  return client.patch<{ ok: boolean }>(`/study/sessions/${id}`, data)
}
