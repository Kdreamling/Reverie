import { client } from './client'

export interface Session {
  id: string
  title: string | null
  model: string
  scene_type: string
  created_at: string
  updated_at: string
  closed_by_ai?: boolean
  closed_at?: string | null
}

export async function fetchSessionsAPI(): Promise<Session[]> {
  const res = await client.get<{ sessions: Session[] }>('/sessions')
  return res.sessions
}

export async function createSessionAPI(scene_type: string, model: string): Promise<Session> {
  return client.post<Session>('/sessions', { scene_type, model })
}

export async function deleteSessionAPI(id: string): Promise<void> {
  return client.delete<void>(`/sessions/${id}`)
}

export async function fetchTodaySessionAPI(): Promise<Session> {
  return client.get<Session>('/sessions/today')
}

export async function fetchSessionByIdAPI(id: string): Promise<Session> {
  return client.get<Session>(`/sessions/${id}`)
}

export async function updateSessionAPI(
  id: string,
  data: Partial<Pick<Session, 'title' | 'model' | 'scene_type'>>,
): Promise<Session> {
  return client.patch<Session>(`/sessions/${id}`, data)
}

// Calendar API
export interface CalendarSession {
  id: string
  title: string
  scene_type: string
  message_count: number
}

export interface CalendarDates {
  year: number
  month: number
  dates: Record<string, CalendarSession[]>
}

export interface CalendarDetail {
  date: string
  sessions: (CalendarSession & {
    model: string
    created_at: string
    updated_at: string
    preview: { user_msg: string; assistant_msg: string; created_at: string }[]
  })[]
}

export async function fetchCalendarDates(year: number, month: number): Promise<CalendarDates> {
  return client.get<CalendarDates>(`/sessions/calendar/dates?year=${year}&month=${month}`)
}

export async function fetchCalendarDetail(date: string): Promise<CalendarDetail> {
  return client.get<CalendarDetail>(`/sessions/calendar/${date}`)
}
