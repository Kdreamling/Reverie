import { create } from 'zustand'
import { toast } from './toastStore'
import {
  fetchMessagesAPI,
  deleteConversationAPI,
  streamChat,
  switchBranch as switchBranchAPI,
  type ChatMessage,
  type MessageAttachment,
  type MemoryOperation,
  type DebugInfo,
  type StreamChatOptions,
} from '../api/chat'
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
  usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number }
  debug_info?: DebugInfo
  artifacts?: Array<{ index: number; id: string; version: number; title: string; type: string }>
}

interface MemorySearchResult {
  query: string
  found: number
  content: string
}

type SendMessageOptions = StreamChatOptions & {
  attachments?: MessageAttachment[]
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
  sessionEnded: boolean
  currentThinking: string
  currentText: string
  isSearchingMemory: boolean
  searchingQuery: string
  pendingMemoryResult: MemorySearchResult | null
  pendingMemoryResults: MemorySearchResult[]
  pendingMemoryOps: MemoryOperation[]
  lastError: string | null
  thinkingStartTime: number | null
  thinkingElapsedTime: number | null
  toolStartTime: number | null
  toolElapsedTime: number | null
  streamBlocks: StreamBlock[]
  _abortController: AbortController | null
  _reader: ReadableStreamDefaultReader<Uint8Array> | null

  loadMessages: (sessionId: string) => Promise<void>
  sendMessage: (sessionId: string, model: string, content: string, options?: SendMessageOptions) => Promise<void>
  stopStreaming: () => void
  deleteConversation: (sessionId: string, conversationId: string) => Promise<void>
  clearMessages: () => void
  regenerate: (sessionId: string, model: string, conversationId: string) => Promise<void>
  switchBranch: (sessionId: string, conversationId: string, branchIndex: number) => Promise<void>
  retryFailed: (sessionId: string, model: string) => void
  clearError: () => void
}

const EMPTY_STREAM = {
  currentThinking: '', currentText: '', isSearchingMemory: false, searchingQuery: '',
  pendingMemoryResult: null, pendingMemoryResults: [] as MemorySearchResult[], pendingMemoryOps: [] as MemoryOperation[],
  thinkingStartTime: null, thinkingElapsedTime: null,
  toolStartTime: null, toolElapsedTime: null, streamBlocks: [] as StreamBlock[],
}

// ─── Perf: mutable streamBlocks array, only create new ref on structural changes
// text_delta / thinking_delta mutate in-place and bump a counter to notify subscribers

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  sessionEnded: false,
  ...EMPTY_STREAM,
  lastError: null,
  _abortController: null,
  _reader: null,

  async loadMessages(sessionId) {
    try {
      const raw: unknown = await fetchMessagesAPI(sessionId)

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
          cached_tokens?: number | null
          memory_ops?: string | null
          model?: string
          scene_type?: string
          source?: string | null
          created_at: string
          branch_group?: string | null
          branch_index?: number | null
          branch_total?: number | null
          attachments?: Array<{
            id: string
            file_type: 'image' | 'pdf' | 'text'
            mime_type: string
            original_filename: string
            file_size: number
            preview?: string | null
          }> | null
        }
        const attachments = Array.isArray(r.attachments) && r.attachments.length > 0
          ? r.attachments.map(a => ({
              id: a.id,
              file_type: a.file_type,
              mime_type: a.mime_type,
              original_filename: a.original_filename,
              file_size: a.file_size,
              preview: a.preview ?? undefined,
            }))
          : null
        // Event messages (from Dream's device status)
        if (r.scene_type === 'event' && r.user_msg) {
          messages.push({
            id: `${r.id}-event`,
            role: 'event',
            content: r.user_msg,
            created_at: r.created_at,
            conversationId: r.id,
          })
          continue
        }
        // Detect silent_read marker — assistant_msg = "[已读]" means Claude chose not to reply
        const isSilentRead = (r.assistant_msg || '').trim() === '[已读]'
        if (r.user_msg) {
          messages.push({
            id: `${r.id}-user`,
            role: 'user',
            content: r.user_msg,
            created_at: r.created_at,
            conversationId: r.id,
            silentRead: isSilentRead,
            attachments,
          })
        }
        if (r.assistant_msg && !isSilentRead) {
          let parsedOps: MemoryOperation[] | null = null
          let parsedDevOps: Array<{ tool: string; args?: string; result?: string }> | null = null
          let parsedMemoryRef: { query: string; found: number; content: string } | null = null
          let parsedMemoryRefs: Array<{ query: string; found: number; content: string }> | null = null
          if (r.memory_ops) {
            try {
              const raw = typeof r.memory_ops === 'string' ? JSON.parse(r.memory_ops) : r.memory_ops
              const allOps = raw as Array<{type?: string; content?: string; mem_type?: string; layer?: string; memory_id?: string; new_content?: string; reason?: string; query?: string; found?: number; tool?: string; args?: string; result?: string}>
              const searchOps = allOps.filter(op => op.type === 'tool_result')
              if (searchOps.length > 0) {
                parsedMemoryRef = { query: searchOps[0].query ?? '', found: searchOps[0].found ?? 0, content: searchOps[0].content ?? '' }
                parsedMemoryRefs = searchOps.map(op => ({ query: op.query ?? '', found: op.found ?? 0, content: op.content ?? '' }))
              }
              const devOps = allOps.filter(op => op.type === 'dev_tool_op')
              if (devOps.length > 0) {
                parsedDevOps = devOps.map(op => ({
                  tool: op.tool ?? '?',
                  args: op.args,
                  result: op.result,
                }))
              }
              const memOps = allOps.filter(op =>
                op.type !== 'tool_result'
                && op.type !== 'tool_searching'
                && op.type !== 'dev_tool_op'
              )
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
            memoryRefs: parsedMemoryRefs,
            memoryOps: parsedOps,
            devToolOps: parsedDevOps,
            thinkingTime: r.thinking_time ?? null,
            tokens: (r.input_tokens || r.output_tokens) ? { input: r.input_tokens ?? 0, output: r.output_tokens ?? 0, cached: r.cached_tokens ?? 0 } : null,
            source: r.source ?? null,
            branchGroup: r.branch_group ?? null,
            branchIndex: r.branch_index ?? null,
            branchTotal: r.branch_total ?? null,
          })
        }
      }

      set({ messages, sessionEnded: false })
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

  async sendMessage(sessionId, model, content, options) {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      attachments: options?.attachments ?? null,
    }
    set(s => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      ...EMPTY_STREAM,
      lastError: null,
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
    const abortController = new AbortController()
    set({ _abortController: abortController })
    try {
      const res = await streamChat(sessionId, model, content, token, options, abortController.signal)

      if (res.status === 401) {
        window.dispatchEvent(new Event('auth:unauthorized'))
        set({ isStreaming: false, _abortController: null })
        return
      }
      if (!res.ok || !res.body) {
        set(s => ({
          isStreaming: false, _abortController: null,
          messages: s.messages.map((m, i) => i === s.messages.length - 1 && m.role === 'user' ? { ...m, failed: true } : m),
        }))
        return
      }

      const reader = res.body.getReader()
      set({ _reader: reader })
      const decoder = new TextDecoder()
      let buffer = ''
      let gotFirstChunk = false

      // Perf: batch text_delta updates — accumulate for 16ms then flush once
      let pendingTextDelta = ''
      let pendingThinkingDelta = ''
      let flushTimer: ReturnType<typeof setTimeout> | null = null

      const flushDeltas = () => {
        flushTimer = null
        const textChunk = pendingTextDelta
        const thinkingChunk = pendingThinkingDelta
        pendingTextDelta = ''
        pendingThinkingDelta = ''

        if (!textChunk && !thinkingChunk) return

        set(s => {
          const blocks = [...s.streamBlocks]
          let newThinking = s.currentThinking
          let newText = s.currentText

          if (thinkingChunk) {
            newThinking += thinkingChunk
            const lastThinkingIdx = findLastIndex(blocks, b => b.kind === 'thinking')
            if (lastThinkingIdx >= 0) {
              const b = blocks[lastThinkingIdx] as { kind: 'thinking'; text: string; startTime: number; elapsed: number | null }
              blocks[lastThinkingIdx] = { ...b, text: b.text + thinkingChunk }
            }
          }

          if (textChunk) {
            newText += textChunk
            const last = blocks[blocks.length - 1]
            if (last && last.kind === 'text') {
              blocks[blocks.length - 1] = { ...last, text: last.text + textChunk }
            } else {
              blocks.push({ kind: 'text', text: textChunk })
            }
          }

          return {
            currentThinking: newThinking,
            currentText: newText,
            streamBlocks: blocks,
          }
        })
      }

      const scheduleFlush = () => {
        if (!flushTimer) {
          flushTimer = setTimeout(flushDeltas, 16)
        }
      }

      const markFailed = () => set(s => ({
        isStreaming: false, ...EMPTY_STREAM, _abortController: null, _reader: null,
        messages: s.messages.map((m, i) => i === s.messages.length - 1 && m.role === 'user' ? { ...m, failed: true } : m),
      }))

      const timeoutId = setTimeout(() => {
        if (!gotFirstChunk && get().isStreaming) {
          reader.cancel()
          markFailed()
        }
      }, 120000)

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

            switch (event.type) {
              case 'tool_searching': {
                flushDeltas() // flush any pending text first
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
                flushDeltas()
                set(s => {
                  const elapsed = s.toolStartTime ? (Date.now() - s.toolStartTime) / 1000 : null
                  const blocks = [...s.streamBlocks]
                  const lastSearchIdx = findLastIndex(blocks, b => b.kind === 'tool_searching')
                  if (lastSearchIdx >= 0) {
                    blocks[lastSearchIdx] = {
                      kind: 'tool_result',
                      query: event.query ?? s.searchingQuery,
                      found: event.found ?? 0,
                      content: event.content ?? '',
                      elapsed,
                    }
                  }
                  const newResult = {
                    query: event.query ?? s.searchingQuery,
                    found: event.found ?? 0,
                    content: event.content ?? '',
                  }
                  return {
                    isSearchingMemory: false,
                    searchingQuery: '',
                    toolElapsedTime: elapsed,
                    toolStartTime: null,
                    pendingMemoryResult: newResult,
                    pendingMemoryResults: [...s.pendingMemoryResults, newResult],
                    streamBlocks: blocks,
                  }
                })
                break
              }
              case 'memory_saved': {
                flushDeltas()
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
                flushDeltas()
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
                flushDeltas()
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
                flushDeltas()
                const now = Date.now()
                set(s => {
                  return {
                    thinkingStartTime: now,
                    thinkingElapsedTime: null,
                    streamBlocks: [...s.streamBlocks, { kind: 'thinking', text: '', startTime: now, elapsed: null }],
                  }
                })
                break
              }
              case 'thinking_delta':
                // Batch: accumulate and schedule flush
                pendingThinkingDelta += event.content ?? ''
                scheduleFlush()
                break
              case 'thinking_end':
                flushDeltas() // flush pending thinking text first
                set(s => {
                  const elapsed = s.thinkingStartTime ? (Date.now() - s.thinkingStartTime) / 1000 : null
                  const blocks = [...s.streamBlocks]
                  const lastThinkingIdx = findLastIndex(blocks, b => b.kind === 'thinking')
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
              case 'text_delta': {
                // Batch: accumulate and schedule flush
                pendingTextDelta += event.content ?? ''
                scheduleFlush()
                break
              }
              case 'silent_read': {
                // Claude chose not to reply — mark Dream's last user message as 已读
                flushDeltas()
                set(s => {
                  const msgs = [...s.messages]
                  // Find last user message and mark it
                  for (let i = msgs.length - 1; i >= 0; i--) {
                    if (msgs[i].role === 'user') {
                      msgs[i] = { ...msgs[i], silentRead: true }
                      break
                    }
                  }
                  return { messages: msgs }
                })
                break
              }
              case 'clear_thinking': {
                // Don't expose Claude's reasoning when he chooses silence
                set({ currentThinking: '' })
                // Also clear thinking from streamBlocks
                set(s => ({ streamBlocks: s.streamBlocks.filter(b => b.kind !== 'thinking') }))
                break
              }
              case 'error': {
                flushDeltas()
                markFailed()
                return
              }
              case 'session_ended': {
                // Claude ended the session
                flushDeltas()
                set(s => {
                  const msgs = [...s.messages]
                  for (let i = msgs.length - 1; i >= 0; i--) {
                    if (msgs[i].role === 'user') {
                      msgs[i] = { ...msgs[i], silentRead: true }
                      break
                    }
                  }
                  return { messages: msgs, sessionEnded: true }
                })
                // Notify session store that the current session is now closed
                window.dispatchEvent(new CustomEvent('session:closed-by-ai'))
                break
              }
              case 'done': {
                flushDeltas() // flush any remaining text
                if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
                const { currentThinking, currentText, pendingMemoryResult, pendingMemoryOps, thinkingElapsedTime } = get()
                const usage = event.usage
                const tokens = usage ? {
                  input: usage.input_tokens ?? usage.prompt_tokens ?? 0,
                  output: usage.output_tokens ?? usage.completion_tokens ?? 0,
                  cached: usage.cached_tokens ?? 0,
                } : null
                // Detect [已读] silent reply marker — don't add assistant bubble
                const isSilentRead = currentText.trim() === '[已读]' || currentText.trim().startsWith('[已读]')
                if (isSilentRead) {
                  set(s => {
                    const msgs = [...s.messages]
                    for (let i = msgs.length - 1; i >= 0; i--) {
                      if (msgs[i].role === 'user') {
                        msgs[i] = { ...msgs[i], silentRead: true }
                        break
                      }
                    }
                    return { messages: msgs, isStreaming: false, ...EMPTY_STREAM }
                  })
                } else if (currentText || currentThinking) {
                  const assistantMsg: ChatMessage = {
                    id: `ai-${Date.now()}`,
                    role: 'assistant',
                    content: currentText,
                    thinking: currentThinking || null,
                    created_at: new Date().toISOString(),
                    memoryRef: pendingMemoryResult ?? null,
                    memoryRefs: get().pendingMemoryResults.length > 0 ? get().pendingMemoryResults : null,
                    memoryOps: pendingMemoryOps.length > 0 ? pendingMemoryOps : null,
                    tokens,
                    thinkingTime: thinkingElapsedTime,
                    debugInfo: event.debug_info ?? null,
                    artifacts: event.artifacts ?? null,
                  }
                  set(s => ({
                    messages: [...s.messages, assistantMsg],
                    isStreaming: false,
                    ...EMPTY_STREAM,
                  }))
                } else {
                  markFailed()
                }
                break
              }
            }
          }
        }
      } finally {
        clearTimeout(timeoutId)
        if (flushTimer) { clearTimeout(flushTimer); flushDeltas() }
      }
    } catch (e) {
      // 如果是用户主动停止（abort），不显示错误
      if (e instanceof DOMException && e.name === 'AbortError') return
      markFailed()
      return
    } finally {
      if (get().isStreaming) {
        set(s => ({
          isStreaming: false, ...EMPTY_STREAM, _abortController: null, _reader: null,
          messages: s.messages.map((m, i) => i === s.messages.length - 1 && m.role === 'user' ? { ...m, failed: true } : m),
        }))
      }
    }
  },

  stopStreaming() {
    const { _abortController, _reader, isStreaming, currentText, currentThinking, pendingMemoryResult, pendingMemoryOps, thinkingElapsedTime } = get()
    if (!isStreaming) return
    try { _reader?.cancel() } catch { /* ignore */ }
    try { _abortController?.abort() } catch { /* ignore */ }
    // 保留已收到的内容作为消息
    if (currentText || currentThinking) {
      const partialMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: currentText + '\n\n*（已停止生成）*',
        thinking: currentThinking || null,
        created_at: new Date().toISOString(),
        memoryRef: pendingMemoryResult ?? null,
        memoryRefs: get().pendingMemoryResults.length > 0 ? get().pendingMemoryResults : null,
        memoryOps: pendingMemoryOps.length > 0 ? pendingMemoryOps : null,
        thinkingTime: thinkingElapsedTime,
      }
      set(s => ({
        messages: [...s.messages, partialMsg],
        isStreaming: false,
        ...EMPTY_STREAM,
        _abortController: null,
        _reader: null,
      }))
    } else {
      set({ isStreaming: false, ...EMPTY_STREAM, _abortController: null, _reader: null })
    }
  },

  async regenerate(sessionId, model, conversationId) {
    const msgs = get().messages
    const assistantIdx = msgs.findIndex(m => m.conversationId === conversationId && m.role === 'assistant')
    if (assistantIdx === -1) return
    const assistantMsg = msgs[assistantIdx]
    const userMsg = msgs.find(m => m.role === 'user' && m.conversationId === conversationId) ?? null

    set(s => ({
      messages: s.messages.filter(m => m.conversationId !== conversationId || m.role !== 'assistant'),
      isStreaming: true,
      ...EMPTY_STREAM,
      lastError: null,
    }))

    const token = localStorage.getItem('token') ?? ''
    const abortController = new AbortController()
    set({ _abortController: abortController })

    try {
      const res = await streamChat(sessionId, model, userMsg?.content ?? '', token, { regenerateFrom: conversationId }, abortController.signal)
      if (!res.ok || !res.body) {
        set(s => ({
          isStreaming: false, _abortController: null,
          messages: [...s.messages, assistantMsg],
        }))
        toast.error('重新生成失败')
        return
      }
      const reader = res.body.getReader()
      set({ _reader: reader })
      const decoder = new TextDecoder()
      let buffer = ''

      const streamBlocks: StreamBlock[] = []
      const thinking_buffer: string[] = []
      const text_buffer: string[] = []
      let collected_memory_ops: MemoryOperation[] = []
      let collected_memory_results: MemorySearchResult[] = []
      let stream_debug_info: DebugInfo | null = null
      let stream_artifacts: ChatMessage['artifacts'] = null
      let thinking_start: number | null = null
      let thinking_elapsed: number | null = null
      let stream_usage: ChatMessage['tokens'] = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const evt: SseEvent = JSON.parse(payload)
            if (evt.type === 'thinking_delta') {
              if (!thinking_start) { thinking_start = Date.now(); streamBlocks.push({ kind: 'thinking', text: '', startTime: thinking_start, elapsed: null }) }
              thinking_buffer.push(evt.content ?? '')
              const last = streamBlocks[streamBlocks.length - 1]
              if (last?.kind === 'thinking') last.text = thinking_buffer.join('')
              set({ streamBlocks: [...streamBlocks] })
            } else if (evt.type === 'thinking_done') {
              thinking_elapsed = thinking_start ? (Date.now() - thinking_start) / 1000 : null
              const last = streamBlocks[streamBlocks.length - 1]
              if (last?.kind === 'thinking') last.elapsed = thinking_elapsed ? thinking_elapsed * 1000 : null
            } else if (evt.type === 'text_delta') {
              text_buffer.push(evt.content ?? '')
              const last = streamBlocks[streamBlocks.length - 1]
              if (last?.kind === 'text') { last.text = text_buffer.join('') } else { streamBlocks.push({ kind: 'text', text: text_buffer.join('') }) }
              set({ streamBlocks: [...streamBlocks] })
            } else if (evt.type === 'debug_info') {
              stream_debug_info = evt.debug_info ?? null
            } else if (evt.type === 'usage' && evt.usage) {
              const u = evt.usage
              stream_usage = { input: u.input_tokens ?? u.prompt_tokens ?? 0, output: u.output_tokens ?? u.completion_tokens ?? 0, cached: u.cached_tokens ?? 0 }
            } else if (evt.type === 'artifacts' && evt.artifacts) {
              stream_artifacts = evt.artifacts
            }
          } catch { /* ignore parse errors */ }
        }
      }

      const fullText = text_buffer.join('')
      if (fullText) {
        const newMsg: ChatMessage = {
          id: `ai-regen-${Date.now()}`,
          role: 'assistant',
          content: fullText,
          thinking: thinking_buffer.join('') || null,
          created_at: new Date().toISOString(),
          memoryOps: collected_memory_ops.length > 0 ? collected_memory_ops : null,
          memoryRefs: collected_memory_results.length > 0 ? collected_memory_results : null,
          thinkingTime: thinking_elapsed,
          tokens: stream_usage,
          debugInfo: stream_debug_info,
          artifacts: stream_artifacts,
          branchGroup: assistantMsg.branchGroup ?? conversationId,
          branchIndex: (assistantMsg.branchIndex ?? 0) + 1,
          branchTotal: (assistantMsg.branchTotal ?? 1) + 1,
        }
        set(s => ({
          messages: [...s.messages, newMsg],
          isStreaming: false,
          ...EMPTY_STREAM,
          _abortController: null, _reader: null,
        }))
      } else {
        set(s => ({
          messages: [...s.messages, assistantMsg],
          isStreaming: false, ...EMPTY_STREAM, _abortController: null, _reader: null,
        }))
      }
    } catch {
      set(s => ({
        messages: [...s.messages, assistantMsg],
        isStreaming: false, ...EMPTY_STREAM, _abortController: null, _reader: null,
      }))
    }

    get().loadMessages(sessionId)
  },

  async switchBranch(sessionId, conversationId, branchIndex) {
    try {
      await switchBranchAPI(sessionId, conversationId, branchIndex)
      await get().loadMessages(sessionId)
    } catch {
      toast.error('切换分支失败')
    }
  },

  retryFailed(sessionId, model) {
    const msgs = get().messages
    const failedIdx = findLastIndex(msgs, m => m.role === 'user' && m.failed === true)
    if (failedIdx === -1) return
    const content = msgs[failedIdx].content
    const attachments = msgs[failedIdx].attachments
    set(s => ({ messages: s.messages.filter((_, i) => i !== failedIdx) }))
    get().sendMessage(sessionId, model, content, attachments ? { attachments } : undefined)
  },

  clearError() {
    set({ lastError: null })
  },
}))

// ─── Utils ───────────────────────────────────────────────────────────────────

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i
  }
  return -1
}
