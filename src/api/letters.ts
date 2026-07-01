import { client } from './client'

export interface PendingLetter {
  id: string
  deliver_on: string
  created_at: string
}

export interface OpenedLetter {
  id: string
  content: string
  deliver_on: string
  created_at: string
  opened_at: string
}

export function listPendingLetters() {
  return client.get<PendingLetter[]>('/letters/pending')
}

export function openLetter(id: string) {
  return client.post<OpenedLetter>(`/letters/${id}/open`, {})
}

export function listOpenedLetters(limit = 20) {
  return client.get<OpenedLetter[]>(`/letters/opened?limit=${limit}`)
}
