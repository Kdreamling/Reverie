import { client } from './client'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string | null
  thinking_summary?: string | null
  created_at: string
  memoryRef?: { query: string; found: number; content: string } | null
  conversationId?: string
}

export async function fetchMessagesAPI(sessionId: string): Promise<ChatMessage[]> {
  return client.get<ChatMessage[]>(`/sessions/${sessionId}/messages`)
}

export async function deleteConversationAPI(sessionId: string, conversationId: string): Promise<void> {
  return client.delete(`/sessions/${sessionId}/messages/${conversationId}`)
}

export function streamChat(
  sessionId: string,
  model: string,
  content: string,
  token: string,
): Promise<Response> {
  return fetch('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Session-Id': sessionId,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      stream: true,
    }),
  })
}
