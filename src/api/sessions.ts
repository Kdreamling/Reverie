import { client } from './client'

export interface Session {
  id: string
  title: string | null
  model: string
  scene_type: string
  created_at: string
  updated_at: string
}

export async function fetchSessionsAPI(): Promise<Session[]> {
  return client.get<Session[]>('/sessions')
}

export async function createSessionAPI(scene_type: string, model: string): Promise<Session> {
  return client.post<Session>('/sessions', { scene_type, model })
}

export async function deleteSessionAPI(id: string): Promise<void> {
  return client.delete<void>(`/sessions/${id}`)
}

export async function updateSessionAPI(
  id: string,
  data: Partial<Pick<Session, 'title' | 'model' | 'scene_type'>>,
): Promise<Session> {
  return client.patch<Session>(`/sessions/${id}`, data)
}
