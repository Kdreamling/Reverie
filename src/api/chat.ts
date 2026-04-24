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

export interface DevToolOp {
  tool: string
  args?: string
  result?: string
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
  session_memories?: { id: string; content: string; mem_type: string }[]
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
  life_items?: { id: string; type: string; content: string; priority: string; due_at?: string; scheduled_at?: string }[]
  events?: { type: string; value: string; time: string }[]
  keepalive?: { time: string; mode: string; thoughts: string; action: string; content: string }[]
  system_config?: {
    history_budget: number
    history_fetch_limit: number
    rerank_threshold: number
    dedup_threshold: number
    micro_summary_model: string
    graph_enabled: boolean
  }
  last_micro_summary?: {
    content: string
    layer: string
    time: string
  }
}

export interface MessageAttachment {
  id: string
  file_type: 'image' | 'pdf' | 'text'
  mime_type: string
  original_filename: string
  file_size: number
  preview?: string // local preview URL for images
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'event'
  content: string
  thinking?: string | null
  thinking_summary?: string | null
  created_at: string
  memoryRef?: { query: string; found: number; content: string } | null
  memoryRefs?: Array<{ query: string; found: number; content: string }> | null
  silentRead?: boolean
  memoryOps?: MemoryOperation[] | null
  devToolOps?: DevToolOp[] | null
  conversationId?: string
  tokens?: { input: number; output: number; cached?: number } | null
  thinkingTime?: number | null
  debugInfo?: DebugInfo | null
  attachments?: MessageAttachment[] | null
  source?: string | null
  artifacts?: Array<{ index: number; id: string; version: number; title: string; type: string }> | null
}

export interface ReadingContextPayload {
  section_index?: number
  selected_text?: string
  section_excerpt?: string
}

export interface StreamChatOptions {
  readingContext?: ReadingContextPayload
  attachmentIds?: string[]
  thinking?: boolean  // 覆盖通道默认 thinking 开关（true/false 显式；缺省 = 跟随通道默认）
}

export async function fetchMessagesAPI(sessionId: string): Promise<ChatMessage[]> {
  return client.get<ChatMessage[]>(`/sessions/${sessionId}/messages`)
}

export async function deleteConversationAPI(sessionId: string, conversationId: string): Promise<void> {
  return client.delete(`/sessions/${sessionId}/messages/${conversationId}`)
}

export interface DreamEvent {
  type: string
  value: string | null
  ts: string
}

export async function fetchDreamEvents(limit: number = 10): Promise<DreamEvent[]> {
  return client.get<DreamEvent[]>(`/dream/events?limit=${limit}`)
}

export function streamChat(
  sessionId: string,
  model: string,
  content: string,
  token: string,
  options?: StreamChatOptions,
  signal?: AbortSignal,
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
      ...(options?.attachmentIds?.length ? { attachment_ids: options.attachmentIds } : {}),
      ...(typeof options?.thinking === 'boolean' ? { thinking: options.thinking } : {}),
    }),
    signal,
  })
}
