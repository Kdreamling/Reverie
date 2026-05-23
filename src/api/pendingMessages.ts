import { client } from './client'
import type { MessageAttachment } from './chat'

export interface PendingMessage {
  id: string
  session_id: string
  content: string
  attachments?: MessageAttachment[] | null
  failed_reason?: string | null
  created_at: string
}

export function savePendingMessageAPI(
  sessionId: string,
  content: string,
  attachments?: MessageAttachment[] | null,
  failedReason?: string,
) {
  return client.post<PendingMessage>('/pending-messages', {
    session_id: sessionId,
    content,
    attachments: attachments || null,
    failed_reason: failedReason || null,
  })
}

export function fetchPendingMessagesAPI(sessionId: string) {
  return client.get<PendingMessage[]>(`/pending-messages/${sessionId}`)
}

export function deletePendingMessageAPI(pendingId: string) {
  return client.delete(`/pending-messages/${pendingId}`)
}
