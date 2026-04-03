import { client } from './client'

// ---- 类型定义 ----

export interface UsageStats {
  period: string
  start: string
  end: string
  totals: {
    input_tokens: number
    output_tokens: number
    cached_tokens: number
    cache_creation_tokens: number
    message_count: number
    cost: number
    saved: number
    hit_rate: number
    avg_cost: number
  }
  daily: DailyUsage[]
  pricing: Record<string, number>
}

export interface DailyUsage {
  date: string
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cache_creation_tokens: number
  message_count: number
  cost: number
  saved: number
  hit_rate: number
  avg_cost: number
}

export interface KeepaliveLog {
  id: string
  time: string
  mode: string
  hours_since_chat: number | null
  thoughts: string
  action: string
  content: string
  cached_tokens: number
  input_tokens: number
  output_tokens: number
}

export interface CalendarDetail {
  date: string
  sessions: CalendarSession[]
  keepalive_logs: KeepaliveLog[]
}

export interface CalendarSession {
  id: string
  title: string
  scene_type: string
  model: string
  message_count: number
  created_at: string
  updated_at: string
  preview: { user_msg: string; assistant_msg: string; created_at: string }[]
}

export interface CalendarDates {
  year: number
  month: number
  dates: Record<string, { id: string; title: string; scene_type: string; message_count: number }[]>
  keepalive_dates: string[]
}

// ---- API 调用 ----

export async function fetchUsageStats(period: string = 'today'): Promise<UsageStats> {
  return client.get<UsageStats>(`/sessions/stats/usage?period=${period}`)
}

export async function fetchCalendarDates(year: number, month: number): Promise<CalendarDates> {
  return client.get<CalendarDates>(`/sessions/calendar/dates?year=${year}&month=${month}`)
}

export async function fetchCalendarDetail(date: string): Promise<CalendarDetail> {
  return client.get<CalendarDetail>(`/sessions/calendar/${date}`)
}
