import { create } from 'zustand'
import { fetchMessagesAPI, streamChat, type ChatMessage } from '../api/chat'

interface SseEvent {
  type: string
  content?: string
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentThinking: string
  currentText: string

  loadMessages: (sessionId: string) => Promise<void>
  sendMessage: (sessionId: string, model: string, content: string) => Promise<void>
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentThinking: '',
  currentText: '',

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
          })
        }
        if (r.assistant_msg) {
          messages.push({
            id: `${r.id}-assistant`,
            role: 'assistant',
            content: r.assistant_msg,
            thinking: r.thinking_summary ?? null,
            created_at: r.created_at,
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
    set({ messages: [], isStreaming: false, currentThinking: '', currentText: '' })
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
    }))

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

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
            case 'thinking_start':
              // marks start of a thinking block; no content
              break
            case 'thinking_delta':
              set(s => ({ currentThinking: s.currentThinking + (event.content ?? '') }))
              break
            case 'thinking_end':
              // marks end of thinking block; no content
              break
            case 'text_delta':
              set(s => ({ currentText: s.currentText + (event.content ?? '') }))
              break
            case 'done': {
              const { currentThinking, currentText } = get()
              if (currentText || currentThinking) {
                const assistantMsg: ChatMessage = {
                  id: `ai-${Date.now()}`,
                  role: 'assistant',
                  content: currentText,
                  thinking: currentThinking || null,
                  created_at: new Date().toISOString(),
                }
                set(s => ({
                  messages: [...s.messages, assistantMsg],
                  currentThinking: '',
                  currentText: '',
                  isStreaming: false,
                }))
              } else {
                set({ currentThinking: '', currentText: '', isStreaming: false })
              }
              break
            }
          }
        }
      }
    } catch {
      // network error or stream aborted — leave partial content, stop streaming
    } finally {
      // Safety net: if done event never arrived, stop the spinner and clear streaming state
      if (get().isStreaming) {
        set({ isStreaming: false, currentThinking: '', currentText: '' })
      }
    }
  },
}))
