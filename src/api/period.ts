import { client } from './client'

export interface PeriodRecord {
  id: string
  start_date: string
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
}

export async function getLatestPeriod(): Promise<PeriodLatest> {
  return client.get<PeriodLatest>('/period/latest')
}

export async function createPeriod(start_date?: string, note?: string): Promise<PeriodRecord> {
  const body: Record<string, string> = {}
  if (start_date) body.start_date = start_date
  if (note) body.note = note
  const res = await client.post<{ ok: boolean; record: PeriodRecord }>('/period', body)
  return res.record
}

export async function listPeriod(): Promise<PeriodRecord[]> {
  const res = await client.get<{ records: PeriodRecord[] }>('/period')
  return res.records
}

export async function deletePeriod(id: string): Promise<void> {
  await client.delete(`/period/${id}`)
}
