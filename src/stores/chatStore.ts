import { create } from 'zustand'
import { fetchMessagesAPI, deleteConversationAPI, streamChat, type ChatMessage, type MemoryOperation, type DebugInfo } from '../api/chat'
import { updateSessionAPI } from '../api/sessions'
import { useSessionStore } from './sessionStore'

interface SseEvent {
  type: string
  content?: string
  query?: string
  found?: number
  mem_type?: string
  layer?: string
  memory_id?: string
  new_content?: string
  reason?: string
  usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
  debug_info?: DebugInfo
}

interface MemorySearchResult {
  query: string
  found: number
  content: string
}

/** Ordered stream block — rendered chronologically in the streaming UI */
export type StreamBlock =
  | { kind: 'thinking'; text: string; startTime: number; elapsed: number | null }
  | { kind: 'text'; text: string }
  | { kind: 'tool_searching'; query: string; startTime: number }
  | { kind: 'tool_result'; query: string; found: number; content: string; elapsed: number | null }
  | { kind: 'memory_op'; op: MemoryOperation; elapsed: number | null }

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentThinking: string
  currentText: string
  isSearchingMemory: boolean
  searchingQuery: string
  pendingMemoryResult: MemorySearchResult | null
  pendingMemoryOps: MemoryOperation[]
  lastError: string | null
  retryContent: string | null
  thinkingStartTime: number | null
  thinkingElapsedTime: number | null
  toolStartTime: number | null
  toolElapsedTime: number | null
  streamBlocks: StreamBlock[]

  loadMessages: (sessionId: string) => Promise<void>
  sendMessage: (sessionId: string, model: string, content: string) => Promise<void>
  deleteConversation: (sessionId: string, conversationId: string) => Promise<void>
  clearMessages: () => void
  retryLast: (sessionId: string, model: string) => void
  clearError: () => void
}

const EMPTY_STREAM = {
  currentThinking: '', currentText: '', isSearchingMemory: false, searchingQuery: '',
  pendingMemoryResult: null, pendingMemoryOps: [] as MemoryOperation[],
  thinkingStartTime: null, thinkingElapsedTime: null,
  toolStartTime: null, toolElapsedTime: null, streamBlocks: [] as StreamBlock[],
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  ...EMPTY_STREAM,
  lastError: null,
  retryContent: null,

  async loadMessages(sessionId) {
    try {
      const raw: unknown = await fetchMessagesAPI(sessionId)
      console.log('[chatStore] loadMessages raw response:', raw)

      const records: unknown[] =
        Array.isArray(raw) ? raw
          : Array.isArray((raw as { messages?: unknown }).messages)
            ? (raw as { messages: unknown[] }).messages
            : []

      records.reverse()

      const messages: ChatMessage[] = []
      for (const rec of records) {
        const r = rec as {
          id: string
          user_msg?: string
          assistant_msg?: string
          thinking_summary?: string | null
          thinking_time?: number | null
          input_tokens?: number | null
          output_tokens?: number | null
          memory_ops?: string | null
          model?: string
          created_at: string
        }
        if (r.user_msg) {
          messages.push({
            id: `${r.id}-user`,
            role: 'user',
            content: r.user_msg,
            created_at: r.created_at,
            conversationId: r.id,
          })
        }
        if (r.assistant_msg) {
          let parsedOps: MemoryOperation[] | null = null
          let parsedMemoryRef: { query: string; found: number; content: string } | null = null
          if (r.memory_ops) {
            try {
              const raw = typeof r.memory_ops === 'string' ? JSON.parse(r.memory_ops) : r.memory_ops
              const allOps = raw as Array<{type?: string; content?: string; mem_type?: string; layer?: string; memory_id?: string; new_content?: string; reason?: string; query?: string; found?: number}>
              // Extract search results
              const searchOp = allOps.find(op => op.type === 'tool_result')
              if (searchOp) {
                parsedMemoryRef = { query: searchOp.query ?? '', found: searchOp.found ?? 0, content: searchOp.content ?? '' }
              }
              // Extract memory operations (save/update/delete)
              const memOps = allOps.filter(op => op.type !== 'tool_result' && op.type !== 'tool_searching')
              if (memOps.length > 0) {
                parsedOps = memOps.map(op => ({
                  type: op.type === 'memory_saved' ? 'saved' : op.type === 'memory_updated' ? 'updated' : op.type === 'memory_deleted' ? 'deleted' : (op.type as 'saved'),
                  content: op.content ?? op.new_content ?? '',
                  mem_type: op.mem_type,
                  layer: op.layer,
                  memory_id: op.memory_id,
                  reason: op.reason,
                  timestamp: '',
                }))
              }
            } catch { /* ignore parse errors */ }
          }
          messages.push({
            id: `${r.id}-assistant`,
            role: 'assistant',
            content: r.assistant_msg,
            thinking: r.thinking_summary ?? null,
            created_at: r.created_at,
            conversationId: r.id,
            memoryRef: parsedMemoryRef,
            memoryOps: parsedOps,
            thinkingTime: r.thinking_time ?? null,
            tokens: (r.input_tokens || r.output_tokens) ? { input: r.input_tokens ?? 0, output: r.output_tokens ?? 0 } : null,
          })
        }
      }

      console.log('[chatStore] loadMessages transformed:', messages.length, 'messages from', records.length, 'records')
      set({ messages })
    } catch {
      // silently fail
    }
  },

  clearMessages() {
    set({ messages: [], isStreaming: false, ...EMPTY_STREAM })
  },

  async deleteConversation(sessionId, conversationId) {
    await deleteConversationAPI(sessionId, conversationId)
    set(s => ({
      messages: s.messages.filter(m => m.conversationId !== conversationId)
    }))
  },

  async sendMessage(sessionId, model, content) {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    set(s => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      ...EMPTY_STREAM,
      lastError: null,
      retryContent: content,
    }))

    // 自动命名
    const sessionStore = useSessionStore.getState()
    const session = sessionStore.sessions.find(s => s.id === sessionId)
    if (session && (!session.title || session.title === '新对话')) {
      const autoTitle = content.length > 20 ? content.slice(0, 20) + '…' : content
      updateSessionAPI(sessionId, { title: autoTitle })
        .then(() => sessionStore.fetchSessions())
        .catch(() => {})
    }

    const token = localStorage.getItem('token') ?? ''
    try {
      const res = await streamChat(sessionId, model, content, token)

      if (res.status === 401) {
        window.dispatchEvent(new Event('auth:unauthorized'))
        set({ isStreaming: false })
        return
      }
      if (!res.ok || !res.body) {
        set({ isStreaming: false })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let gotFirstChunk = false

      const timeoutId = setTimeout(() => {
        if (!gotFirstChunk && get().isStreaming) {
          reader.cancel()
          set({ isStreaming: false, ...EMPTY_STREAM, lastError: '连接超时，请重试' })
        }
      }, 30000)

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          gotFirstChunk = true
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr || jsonStr === '[DONE]') continue

            let event: SseEvent
            try { event = JSON.parse(jsonStr) } catch { continue }

            console.log('[chatStore] SSE event:', event.type, event)

            switch (event.type) {
              case 'tool_searching': {
                const now = Date.now()
                set(s => ({
                  isSearchingMemory: true,
                  searchingQuery: event.query ?? '',
                  toolStartTime: now,
                  toolElapsedTime: null,
                  streamBlocks: [...s.streamBlocks, { kind: 'tool_searching', query: event.query ?? '', startTime: now }],
                }))
                break
              }
              case 'tool_result': {
                set(s => {
                  const elapsed = s.toolStartTime ? (Date.now() - s.toolStartTime) / 1000 : null
                  // Replace last tool_searching block with tool_result
                  const blocks = [...s.streamBlocks]
                  const lastSearchIdx = blocks.map((b, i) => b.kind === 'tool_searching' ? i : -1).filter(i => i >= 0).pop() ?? -1
                  if (lastSearchIdx >= 0) {
                    blocks[lastSearchIdx] = {
                      kind: 'tool_result',
                      query: event.query ?? s.searchingQuery,
                      found: event.found ?? 0,
                      content: event.content ?? '',
                      elapsed,
                    }
                  }
                  return {
                    isSearchingMemory: false,
                    searchingQuery: '',
                    toolElapsedTime: elapsed,
                    toolStartTime: null,
                    pendingMemoryResult: {
                      query: event.query ?? s.searchingQuery,
                      found: event.found ?? 0,
                      content: event.content ?? '',
                    },
                    streamBlocks: blocks,
                  }
                })
                break
              }
              case 'memory_saved': {
                const op: MemoryOperation = {
                  type: 'saved', content: event.content ?? '', mem_type: event.mem_type, layer: event.layer,
                  timestamp: new Date().toISOString(),
                }
                set(s => {
                  const elapsed = s.toolStartTime ? (Date.now() - s.toolStartTime) / 1000 : null
                  return {
                    pendingMemoryOps: [...s.pendingMemoryOps, op],
                    toolStartTime: null,
                    toolElapsedTime: elapsed,
                    streamBlocks: [...s.streamBlocks, { kind: 'memory_op', op, elapsed }],
                  }
                })
                break
              }
              case 'memory_updated': {
                const op: MemoryOperation = {
                  type: 'updated', content: event.new_content ?? '', memory_id: event.memory_id,
                  timestamp: new Date().toISOString(),
                }
                set(s => {
                  const elapsed = s.toolStartTime ? (Date.now() - s.toolStartTime) / 1000 : null
                  return {
                    pendingMemoryOps: [...s.pendingMemoryOps, op],
                    toolStartTime: null,
                    toolElapsedTime: elapsed,
                    streamBlocks: [...s.streamBlocks, { kind: 'memory_op', op, elapsed }],
                  }
                })
                break
              }
              case 'memory_deleted': {
                const op: MemoryOperation = {
                  type: 'deleted', content: '', memory_id: event.memory_id, reason: event.reason,
                  timestamp: new Date().toISOString(),
                }
                set(s => {
                  const elapsed = s.toolStartTime ? (Date.now() - s.toolStartTime) / 1000 : null
                  return {
                    pendingMemoryOps: [...s.pendingMemoryOps, op],
                    toolStartTime: null,
                    toolElapsedTime: elapsed,
                    streamBlocks: [...s.streamBlocks, { kind: 'memory_op', op, elapsed }],
                  }
                })
                break
              }
              case 'thinking_start': {
                const now = Date.now()
                set(s => ({
                  thinkingStartTime: now,
                  thinkingElapsedTime: null,
                  streamBlocks: [...s.streamBlocks, { kind: 'thinking', text: '', startTime: now, elapsed: null }],
                }))
                break
              }
              case 'thinking_delta':
                set(s => {
                  const blocks = [...s.streamBlocks]
                  const lastThinkingIdx = blocks.map((b, i) => b.kind === 'thinking' ? i : -1).filter(i => i >= 0).pop() ?? -1
                  if (lastThinkingIdx >= 0) {
                    const b = blocks[lastThinkingIdx] as { kind: 'thinking'; text: string; startTime: number; elapsed: number | null }
                    blocks[lastThinkingIdx] = { ...b, text: b.text + (event.content ?? '') }
                  }
                  return {
                    currentThinking: s.currentThinking + (event.content ?? ''),
                    streamBlocks: blocks,
                  }
                })
                break
              case 'thinking_end':
                set(s => {
                  const elapsed = s.thinkingStartTime ? (Date.now() - s.thinkingStartTime) / 1000 : null
                  const blocks = [...s.streamBlocks]
                  const lastThinkingIdx = blocks.map((b, i) => b.kind === 'thinking' ? i : -1).filter(i => i >= 0).pop() ?? -1
                  if (lastThinkingIdx >= 0) {
                    const b = blocks[lastThinkingIdx] as { kind: 'thinking'; text: string; startTime: number; elapsed: number | null }
                    blocks[lastThinkingIdx] = { ...b, elapsed }
                  }
                  return {
                    thinkingElapsedTime: elapsed,
                    thinkingStartTime: null,
                    streamBlocks: blocks,
                  }
                })
                break
              case 'text_delta':
                set(s => {
                  const blocks = [...s.streamBlocks]
                  const last = blocks[blocks.length - 1]
                  if (last && last.kind === 'text') {
                    blocks[blocks.length - 1] = { ...last, text: last.text + (event.content ?? '') }
                  } else {
                    blocks.push({ kind: 'text', text: event.content ?? '' })
                  }
                  return {
                    currentText: s.currentText + (event.content ?? ''),
                    streamBlocks: blocks,
                  }
                })
                break
              case 'done': {
                const { currentThinking, currentText, pendingMemoryResult, pendingMemoryOps, thinkingElapsedTime } = get()
                const usage = event.usage
                const tokens = usage ? {
                  input: usage.input_tokens ?? usage.prompt_tokens ?? 0,
                  output: usage.output_tokens ?? usage.completion_tokens ?? 0,
                } : null
                if (currentText || currentThinking) {
                  const assistantMsg: ChatMessage = {
                    id: `ai-${Date.now()}`,
                    role: 'assistant',
                    content: currentText,
                    thinking: currentThinking || null,
                    created_at: new Date().toISOString(),
                    memoryRef: pendingMemoryResult ?? null,
                    memoryOps: pendingMemoryOps.length > 0 ? pendingMemoryOps : null,
                    tokens,
                    thinkingTime: thinkingElapsedTime,
                    debugInfo: event.debug_info ?? null,
                  }
                  set(s => ({
                    messages: [...s.messages, assistantMsg],
                    isStreaming: false,
                    ...EMPTY_STREAM,
                  }))
                } else {
                  set({ isStreaming: false, ...EMPTY_STREAM })
                }
                break
              }
            }
          }
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch {
      set({ isStreaming: false, ...EMPTY_STREAM, lastError: '发送失败，请重试' })
      return
    } finally {
      if (get().isStreaming) {
        set({ isStreaming: false, ...EMPTY_STREAM, lastError: '连接中断，请重试' })
      }
    }
  },

  retryLast(sessionId, model) {
    const { retryContent } = get()
    if (!retryContent) return
    set(s => ({ messages: s.messages.slice(0, -1), lastError: null }))
    get().sendMessage(sessionId, model, retryContent)
  },

  clearError() {
    set({ lastError: null })
  },
}))
