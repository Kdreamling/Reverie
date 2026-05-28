import { client } from './client'

export interface PeriodRecord {
  id: string
  start_date: string
  end_date: string | null
  cycle_days: number | null
  note: string | null
  created_at: string
}

export interface PeriodLatest {
  latest: PeriodRecord | null
  days_since: number | null
  predicted_next: string | null
  avg_cycle_days: number | null
  is_estimated?: boolean
  in_period?: boolean
  duration?: number | null
}

export async function getLatestPeriod(): Promise<PeriodLatest> {
  return client.get<PeriodLatest>('/period/latest')
}

export interface CreatePeriodResult {
  ok: boolean
  record?: PeriodRecord
  merged?: boolean
  message?: string
}

export async function createPeriod(start_date?: string, note?: string): Promise<CreatePeriodResult> {
  const body: Record<string, string> = {}
  if (start_date) body.start_date = start_date
  if (note) body.note = note
  return client.post<CreatePeriodResult>('/period', body)
}

export async function listPeriod(): Promise<PeriodRecord[]> {
  const res = await client.get<{ records: PeriodRecord[] }>('/period')
  return res.records
}

export async function endPeriod(id: string, end_date?: string): Promise<{ ok: boolean; record?: PeriodRecord }> {
  const body: Record<string, string> = {}
  if (end_date) body.end_date = end_date
  return client.patch<{ ok: boolean; record?: PeriodRecord }>(`/period/${id}/end`, body)
}

export async function unendPeriod(id: string): Promise<{ ok: boolean; record?: PeriodRecord }> {
  return client.patch<{ ok: boolean; record?: PeriodRecord }>(`/period/${id}/unend`, {})
}

export async function deletePeriod(id: string): Promise<void> {
  await client.delete(`/period/${id}`)
}
