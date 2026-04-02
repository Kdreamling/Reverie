import { client } from './client'

export interface LifeItem {
  id: string
  type: 'todo' | 'schedule' | 'note'
  content: string
  category: string
  priority: string
  is_completed: boolean
  due_at: string | null
  scheduled_at: string | null
  remind_at?: string | null
  created_at?: string
  completed_at?: string | null
}

export interface LifeItemsCalendar {
  year: number
  month: number
  items: Record<string, LifeItem[]>
}

export async function fetchLifeItemsCalendar(year: number, month: number): Promise<LifeItemsCalendar> {
  return client.get<LifeItemsCalendar>(`/sessions/life-items/calendar?year=${year}&month=${month}`)
}

export async function fetchLifeItems(date?: string, status?: string): Promise<{ items: LifeItem[] }> {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  if (status) params.set('status', status)
  const qs = params.toString()
  return client.get<{ items: LifeItem[] }>(`/sessions/life-items${qs ? '?' + qs : ''}`)
}

export async function toggleLifeItemComplete(itemId: string): Promise<LifeItem> {
  return client.post<LifeItem>(`/sessions/life-items/${itemId}/complete`, {})
}

// Habits
export interface HabitInfo {
  id: string
  name: string
  icon: string
}

export interface HabitLog {
  habit_name: string
  icon: string
  value?: string
  note?: string
}

export interface HabitsCalendar {
  year: number
  month: number
  habits: HabitInfo[]
  logs: Record<string, HabitLog[]>
}

export async function fetchHabitsCalendar(year: number, month: number): Promise<HabitsCalendar> {
  return client.get<HabitsCalendar>(`/sessions/habits/calendar?year=${year}&month=${month}`)
}
