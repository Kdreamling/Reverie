import { client } from './client'

export interface MemoryOperation {
  type: 'saved' | 'updated' | 'deleted'
  content: string
  mem_type?: string
  layer?: string
  memory_id?: string
  reason?: string
  timestamp: string
}

export interface DebugInfo {
  memories: {
    core_base: { id: string; content: string; importance: number }[]
    core_living: { id: string; content: string; recorded_at: string }[]
    scene: { id: string; content: string; scene_type: string }[]
  }
  search_results: {
    user_msg?: string; assistant_msg?: string; summary?: string
    content?: string; layer?: string
    score: number; match_type: string; source: string
  }[]
  sliding_window: { rounds: number; range: string; messages?: { user_msg?: string; assistant_msg?: string }[] }
  summaries: { dimension: string; content: string }[]
  token_usage: { budget: number; memories: number; search: number; summaries: number; total: number; graph?: number }
  session_summary?: { content: string; exists: boolean }
  graph?: {
    seed_nodes: {
      id: string; content: string; category: string; similarity: number
      emotion_intensity?: number; base_importance?: number; occurred_at?: string
    }[]
    expanded_nodes: {
      id: string; content: string; category: string; edge_relation_type: string
      edge_strength?: number; emotion_intensity?: number; base_importance?: number; occurred_at?: string
    }[]
    formatted_text?: string
  } | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string | null
  thinking_summary?: string | null
  created_at: string
  memoryRef?: { query: string; found: number; content: string } | null
  memoryOps?: MemoryOperation[] | null
  conversationId?: string
  tokens?: { input: number; output: number } | null
  thinkingTime?: number | null
  debugInfo?: DebugInfo | null
}

export interface ReadingContextPayload {
  section_index?: number
  selected_text?: string
  section_excerpt?: string
}

export interface StreamChatOptions {
  readingContext?: ReadingContextPayload
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
  options?: StreamChatOptions,
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
      ...(options?.readingContext ? { reading_context: options.readingContext } : {}),
    }),
  })
}
