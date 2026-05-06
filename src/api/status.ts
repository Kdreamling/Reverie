import { client } from './client'

export interface DayStatus {
  id?: string
  date: string
  mood: string | null
  meal_b: boolean
  meal_l: boolean
  meal_d: boolean
  weather_text: string | null
  weather_temp: number | null
  weather_icon: string | null
  weather_updated_at: string | null
  training_type: string | null
  training_planned: boolean
  training_done: boolean
  sleep_hours: number | null
  sleep_deep_min: number | null
  sleep_core_min: number | null
  resting_hr: number | null
  note: string | null
  updated_at?: string
}

export async function getTodayStatus(): Promise<DayStatus> {
  return client.get<DayStatus>('/status/today')
}

export async function updateTodayStatus(fields: Partial<DayStatus>): Promise<DayStatus> {
  return client.put<DayStatus>('/status/today', fields)
}
