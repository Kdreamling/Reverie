import { client } from './client'

export interface StudyError {
  id: string
  session_id?: string
  question_type: string
  question: string
  correct_answer: string
  user_answer?: string
  explanation?: string
  difficulty: string
  tags: string[]
  review_count: number
  mastered: boolean
  created_at: string
}

export interface GenerateTestParams {
  question_types: string[]
  count: number
  difficulty?: string
  include_errors?: boolean
  extra_instruction?: string
}

export function generateTestPrompt(params: GenerateTestParams) {
  return client.post<{ prompt: string }>('/study/generate-prompt', params)
}

export function getGradePrompt() {
  return client.post<{ prompt: string }>('/study/grade-prompt', {})
}

export function listErrors(params?: { mastered?: boolean; question_type?: string }) {
  const query = new URLSearchParams()
  if (params?.mastered !== undefined) query.set('mastered', String(params.mastered))
  if (params?.question_type) query.set('question_type', params.question_type)
  const qs = query.toString()
  return client.get<{ errors: StudyError[]; total: number }>(`/study/errors${qs ? `?${qs}` : ''}`)
}

export function saveError(data: Omit<StudyError, 'id' | 'review_count' | 'mastered' | 'created_at'>) {
  return client.post<StudyError>('/study/errors', data)
}

export function updateError(id: string, data: { mastered?: boolean; review_count?: number }) {
  return client.patch<StudyError>(`/study/errors/${id}`, data)
}

export function deleteError(id: string) {
  return client.delete<{ ok: boolean }>(`/study/errors/${id}`)
}

export function getErrorStats() {
  return client.get<{ total: number; mastered: number; unmastered: number; by_type: Record<string, { total: number; mastered: number }> }>('/study/errors/stats')
}
