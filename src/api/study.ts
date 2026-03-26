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

export function getErrorStats() {
  return client.get<{ total: number; mastered: number; unmastered: number }>('/study/errors/stats')
}
