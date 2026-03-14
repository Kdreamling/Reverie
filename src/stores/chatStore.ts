import { create } from 'zustand'
import { fetchMessagesAPI, deleteConversationAPI, streamChat, type ChatMessage } from '../api/chat'
import { updateSessionAPI } from '../api/sessions'
import { useSessionStore } from './sessionStore'

interface SseEvent {
  type: string
  content?: string
  query?: string
  found?: number
}

interface MemorySearchResult {
  query: string
  found: number
  content: string
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentThinking: string
  currentText: string
  isSearchingMemory: boolean
  searchingQuery: string
  pendingMemoryResult: MemorySearchResult | null
  lastError: string | null       // error message shown below failed user message
  retryContent: string | null    // content of last user message for retry

  loadMessages: (sessionId: string) => Promise<void>
  sendMessage: (sessionId: string, model: string, content: string) => Promise<void>
  deleteConversation: (sessionId: string, conversationId: string) => Promise<void>
  clearMessages: () => void
  retryLast: (sessionId: string, model: string) => void
  clearError: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentThinking: '',
  currentText: '',
  isSearchingMemory: false,
  searchingQuery: '',
  pendingMemoryResult: null,
  lastError: null,
  retryContent: null,

  async loadMessages(sessionId) {
    try {
      const raw: unknown = await fetchMessagesAPI(sessionId)
      console.log('[chatStore] loadMessages raw response:', raw)

      // Backend returns { messages: [...], page, page_size } with each record being
      // { id, user_msg, assistant_msg, thinking_summary, model, created_at, ... }
      const records: unknown[] =
        Array.isArray(raw) ? raw
          : Array.isArray((raw as { messages?: unknown }).messages)
            ? (raw as { messages: unknown[] }).messages
            : []

      // Backend returns records newest-first; reverse to chronological order
      records.reverse()

      // Transform each record into 1–2 ChatMessage objects (user first, then assistant)
      const messages: ChatMessage[] = []
      for (const rec of records) {
        const r = rec as {
          id: string
          user_msg?: string
          assistant_msg?: string
          thinking_summary?: string | null
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
          messages.push({
            id: `${r.id}-assistant`,
            role: 'assistant',
            content: r.assistant_msg,
            thinking: r.thinking_summary ?? null,
            created_at: r.created_at,
            conversationId: r.id,
          })
        }
      }

      console.log('[chatStore] loadMessages transformed:', messages.length, 'messages from', records.length, 'records')
      set({ messages })
    } catch {
      // silently fail — AuthGuard handles 401 via the event
    }
  },

  clearMessages() {
    set({ messages: [], isStreaming: false, currentThinking: '', currentText: '', isSearchingMemory: false, searchingQuery: '', pendingMemoryResult: null })
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
      currentThinking: '',
      currentText: '',
      isSearchingMemory: false,
      searchingQuery: '',
      pendingMemoryResult: null,
      lastError: null,
      retryContent: content,
    }))

    // 自动命名：如果标题是"新对话"或为空，用消息前20字命名
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

      // 30s timeout waiting for first SSE chunk
      const timeoutId = setTimeout(() => {
        if (!gotFirstChunk && get().isStreaming) {
          reader.cancel()
          set({ isStreaming: false, currentThinking: '', currentText: '', isSearchingMemory: false, searchingQuery: '', pendingMemoryResult: null, lastError: '连接超时，请重试' })
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
              case 'tool_searching':
                set({ isSearchingMemory: true, searchingQuery: event.query ?? '' })
                break
              case 'tool_result':
                set({
                  isSearchingMemory: false,
                  searchingQuery: '',
                  pendingMemoryResult: {
                    query: event.query ?? get().searchingQuery,
                    found: event.found ?? 0,
                    content: event.content ?? '',
                  },
                })
                break
              case 'thinking_start':
                break
              case 'thinking_delta':
                set(s => ({ currentThinking: s.currentThinking + (event.content ?? '') }))
                break
              case 'thinking_end':
                break
              case 'text_delta':
                set(s => ({ currentText: s.currentText + (event.content ?? '') }))
                break
              case 'done': {
                const { currentThinking, currentText, pendingMemoryResult } = get()
                if (currentText || currentThinking) {
                  const assistantMsg: ChatMessage = {
                    id: `ai-${Date.now()}`,
                    role: 'assistant',
                    content: currentText,
                    thinking: currentThinking || null,
                    created_at: new Date().toISOString(),
                    memoryRef: pendingMemoryResult ?? null,
                  }
                  set(s => ({
                    messages: [...s.messages, assistantMsg],
                    currentThinking: '',
                    currentText: '',
                    isStreaming: false,
                    isSearchingMemory: false,
                    searchingQuery: '',
                    pendingMemoryResult: null,
                  }))
                } else {
                  set({ currentThinking: '', currentText: '', isStreaming: false, isSearchingMemory: false, searchingQuery: '', pendingMemoryResult: null })
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
      set({ isStreaming: false, currentThinking: '', currentText: '', isSearchingMemory: false, searchingQuery: '', pendingMemoryResult: null, lastError: '发送失败，请重试' })
      return
    } finally {
      if (get().isStreaming) {
        set({ isStreaming: false, currentThinking: '', currentText: '', isSearchingMemory: false, searchingQuery: '', pendingMemoryResult: null, lastError: '连接中断，请重试' })
      }
    }
  },

  retryLast(sessionId, model) {
    const { retryContent } = get()
    if (!retryContent) return
    // remove the last user message (the failed one) then resend
    set(s => ({ messages: s.messages.slice(0, -1), lastError: null }))
    get().sendMessage(sessionId, model, retryContent)
  },

  clearError() {
    set({ lastError: null })
  },
}))
