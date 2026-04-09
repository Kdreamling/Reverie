import { client } from './client'

// ---- Types ----

export interface Diary {
  id: string
  title: string | null
  content: string | null
  mood: string | null
  diary_date: string
  time: string | null
  is_locked: boolean
  lock_type: string | null
  lock_password_hash?: string
  unlock_date: string | null
  created_at: string
  updated_at: string
  // claude_diaries specific
  user_id?: string
  highlights?: string[]
  // lock display
  title_hidden?: boolean
}

export interface DiaryComment {
  id: string
  diary_id: string
  diary_source: string
  author: string
  content: string
  created_at: string
}

export interface DiaryDates {
  [date: string]: { dream: boolean; chen: boolean }
}

// ---- Dream's Diaries ----

export async function fetchDreamDiaries(params?: { limit?: number; offset?: number; month?: string }) {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  if (params?.month) q.set('month', params.month)
  return client.get<{ diaries: Diary[]; count: number }>(`/diary/dream?${q}`)
}

export async function fetchDreamDiary(id: string) {
  return client.get<Diary>(`/diary/dream/${id}`)
}

export async function createDreamDiary(body: { title?: string; content: string; mood?: string; diary_date?: string; time?: string }) {
  return client.post<{ diary: Diary }>('/diary/dream', body)
}

export async function updateDreamDiary(id: string, body: { title?: string; content?: string; mood?: string }) {
  return client.put<{ diary: Diary }>(`/diary/dream/${id}`, body)
}

export async function deleteDreamDiary(id: string) {
  return client.delete<{ ok: boolean }>(`/diary/dream/${id}`)
}

// ---- Lock/Unlock ----

export async function lockDiary(id: string, body: { lock_type: string; password?: string; unlock_date?: string }) {
  return client.post<{ ok: boolean }>(`/diary/dream/${id}/lock`, body)
}

export async function unlockDiary(id: string, password: string) {
  return client.post<{ ok: boolean; diary: Diary }>(`/diary/dream/${id}/unlock`, { password })
}

export async function removeLock(id: string) {
  return client.post<{ ok: boolean }>(`/diary/dream/${id}/remove-lock`, {})
}

// ---- Chen Lock/Unlock ----

export async function lockChenDiary(id: string, body: { lock_type: string; password?: string; unlock_date?: string }) {
  return client.post<{ ok: boolean }>(`/diary/chen/${id}/lock`, body)
}

export async function unlockChenDiary(id: string, password: string) {
  return client.post<{ ok: boolean; diary: Diary }>(`/diary/chen/${id}/unlock`, { password })
}

export async function removeChenLock(id: string) {
  return client.post<{ ok: boolean }>(`/diary/chen/${id}/remove-lock`, {})
}

// ---- Chen's Diaries ----

export async function fetchChenDiaries(params?: { limit?: number; offset?: number; month?: string }) {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  if (params?.month) q.set('month', params.month)
  return client.get<{ diaries: Diary[]; count: number }>(`/diary/chen?${q}`)
}

export async function fetchChenDiary(id: string) {
  return client.get<Diary>(`/diary/chen/${id}`)
}

// ---- Combined ----

export async function fetchDiaryDates(year: number, month: number) {
  return client.get<{ dates: DiaryDates }>(`/diary/dates?year=${year}&month=${month}`)
}

export async function fetchDiariesByDate(date: string) {
  return client.get<{ date: string; dream: Diary[]; chen: Diary[] }>(`/diary/date/${date}`)
}

// ---- Comments ----

export async function fetchComments(source: string, diaryId: string) {
  return client.get<{ comments: DiaryComment[] }>(`/diary/${source}/${diaryId}/comments`)
}

export async function createComment(source: string, diaryId: string, body: { author: string; content: string }) {
  return client.post<{ comment: DiaryComment }>(`/diary/${source}/${diaryId}/comments`, body)
}

export async function deleteComment(commentId: string) {
  return client.delete<{ ok: boolean }>(`/diary/comments/${commentId}`)
}

// ---- Unlock attempts ----

export interface UnlockAttempt {
  id: string
  diary_id: string
  diary_source: string
  attempted_by: string
  success: boolean
  created_at: string
}

export async function fetchUnlockAttempts(source: string, diaryId: string) {
  return client.get<{ attempts: UnlockAttempt[] }>(`/diary/${source}/${diaryId}/unlock-attempts`)
}
