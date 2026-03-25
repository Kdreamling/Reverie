import { client } from './client'

export interface Artifact {
  id: string
  session_id: string
  message_id?: string
  type: 'code' | 'html' | 'svg' | 'markdown' | 'csv' | 'mermaid'
  title: string
  language?: string
  content: string
  version: number
  parent_id?: string
  created_at: string
}

export function listSessionArtifacts(sessionId: string) {
  return client.get<{ artifacts: Artifact[] }>(`/sessions/${sessionId}/artifacts`)
}

export function getArtifact(id: string) {
  return client.get<Artifact>(`/artifacts/${id}`)
}

export function createArtifact(data: Omit<Artifact, 'id' | 'version' | 'parent_id' | 'created_at'>) {
  return client.post<Artifact>('/artifacts', data)
}

export function updateArtifact(id: string, data: { title?: string; content?: string; language?: string }) {
  return client.post<Artifact>(`/artifacts/${id}`, data)
}

export function deleteArtifact(id: string) {
  return client.delete<{ ok: boolean }>(`/artifacts/${id}`)
}

export function getArtifactVersions(id: string) {
  return client.get<{ versions: Artifact[] }>(`/artifacts/${id}/versions`)
}
