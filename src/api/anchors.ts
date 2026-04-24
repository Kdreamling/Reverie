import { client } from './client'

export interface Anchor {
  id: string
  created_at: string
  created_by: 'dream' | 'chen'
  time_window_start: string
  time_window_end: string
  session_id: string | null
  conversation_ids: string[]
  summary: string
  raw_excerpt: string | null
  emotion_tags: string[]
  topics: string[]
  entities: string[]
  importance: number
  last_evoked_at: string | null
  evoked_count: number
  dream_note: string | null
}

export interface CreateAnchorParams {
  created_by: 'dream' | 'chen'
  session_id?: string | null
  conversation_ids: string[]
  dream_note?: string
  importance?: number
}

export async function createAnchor(params: CreateAnchorParams): Promise<Anchor> {
  const res = await client.post<{ ok: boolean; anchor: Anchor }>('/anchors', params)
  return res.anchor
}

export async function listAnchors(params?: {
  limit?: number
  offset?: number
  created_by?: 'dream' | 'chen'
}): Promise<Anchor[]> {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  if (params?.created_by) qs.set('created_by', params.created_by)
  const path = qs.toString() ? `/anchors?${qs.toString()}` : '/anchors'
  const res = await client.get<{ ok: boolean; anchors: Anchor[] }>(path)
  return res.anchors
}

export async function getAnchor(id: string): Promise<Anchor> {
  const res = await client.get<{ ok: boolean; anchor: Anchor }>(`/anchors/${id}`)
  return res.anchor
}

export async function updateAnchorNote(id: string, note: string): Promise<void> {
  await client.patch<{ ok: boolean }>(`/anchors/${id}/note`, { note })
}

export async function deleteAnchor(id: string): Promise<void> {
  await client.delete<{ ok: boolean }>(`/anchors/${id}`)
}
