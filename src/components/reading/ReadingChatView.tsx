import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Send, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useReadingStore } from '../../stores/readingStore'
import { useChatStore } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'
import { C, getModelColor } from '../../theme'
import { client } from '../../api/client'

interface SelectableModel {
  value: string
  label: string
  channel?: string
}

interface ReadingChatViewProps {
  sessionId: string
  onClose: () => void
}

export default function ReadingChatView({ sessionId, onClose }: ReadingChatViewProps) {
  const sections = useReadingStore(s => s.sections)
  const chatSectionIndex = useReadingStore(s => s.chatSectionIndex)
  const activeSelection = useReadingStore(s => s.activeSelection)

  const currentSession = useSessionStore(s => s.currentSession)
  const updateSessionModel = useSessionStore(s => s.updateSessionModel)
  const messages = useChatStore(s => s.messages)
  const isStreaming = useChatStore(s => s.isStreaming)
  const sendMessage = useChatStore(s => s.sendMessage)
  const loadMessages = useChatStore(s => s.loadMessages)

  const [input, setInput] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [models, setModels] = useState<SelectableModel[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const model = currentSession?.model ?? models[0]?.value ?? ''
  const modelLabel = models.find(m => m.value === model)?.label ?? (model || '加载中…')

  useEffect(() => {
    let cancelled = false
    client.get<{ models: SelectableModel[] }>('/models/selectable?scene=reading')
      .then(resp => { if (!cancelled) setModels(resp.models ?? []) })
      .catch(err => console.error('[ReadingChatView] failed to load models', err))
    return () => { cancelled = true }
  }, [])

  // Always reload messages when panel opens
  useEffect(() => {
    loadMessages(sessionId)
  }, [sessionId, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 350)
  }, [])

  const contextSection = chatSectionIndex !== null
    ? sections.find(s => s.id === chatSectionIndex)
    : null

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return

    // Always send reading_context in reading mode (for discussion_count + anti-spoiler)
    const readingContext = {
      section_index: chatSectionIndex ?? undefined,
      selected_text: activeSelection || undefined,
      section_excerpt: contextSection?.content.slice(0, 180) || undefined,
    }

    sendMessage(sessionId, model, text, { readingContext })
    setInput('')
  }, [input, isStreaming, sessionId, activeSelection, contextSection, chatSectionIndex, sendMessage, model])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(50,42,34,0.3)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          animation: 'chatFadeIn 0.2s ease',
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxHeight: '85vh', zIndex: 50,
        background: C.bg,
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -8px 40px rgba(92,75,58,0.12)',
        display: 'flex', flexDirection: 'column',
        animation: 'chatSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.borderStrong }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '4px 16px 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={C.accent}>
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>讨论</span>
            {contextSection && (
              <span style={{ fontSize: 11, color: C.textMuted }}>· 段落 {chatSectionIndex}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Model picker */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowModelPicker(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 8,
                  background: showModelPicker ? C.surface : 'transparent',
                  border: 'none', cursor: 'pointer',
                  fontSize: 11, color: C.textSecondary, fontWeight: 500,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: getModelColor(model) }} />
                {modelLabel}
                <ChevronDown size={10} style={{ transform: showModelPicker ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
              </button>
              {showModelPicker && (
                <>
                  <div onClick={() => setShowModelPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    minWidth: 180, zIndex: 999,
                    background: '#FFFCF7',
                    borderRadius: 12, border: `1px solid ${C.border}`,
                    boxShadow: '0 8px 32px rgba(100,80,50,0.12)',
                    overflow: 'hidden',
                  }}>
                    {models.map(m => (
                      <div
                        key={m.value}
                        onClick={() => { updateSessionModel(m.value); setShowModelPicker(false) }}
                        style={{
                          padding: '10px 12px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: m.value === model ? C.sidebarActive : 'transparent',
                          fontSize: 12, color: m.value === model ? C.text : C.textSecondary,
                          fontWeight: m.value === model ? 600 : 400,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: getModelColor(m.value) }} />
                        {m.label}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.textMuted, display: 'flex' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Selected text quote */}
        {(activeSelection || contextSection) && (
          <div style={{
            margin: '0 16px 8px', padding: '10px 14px',
            borderRadius: 12, background: C.memoryBg,
            borderLeft: `3px solid ${C.accent}`,
            fontSize: 13, color: C.textSecondary, lineHeight: 1.8,
            maxHeight: 60, overflow: 'hidden',
          }}>
            "{(activeSelection || contextSection?.content || '').slice(0, 120)}"
            {((activeSelection?.length ?? 0) > 120 || (contextSection?.content?.length ?? 0) > 120) && '...'}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '8px 16px', minHeight: 200, maxHeight: '50vh' }}>
          {messages.length === 0 && !isStreaming && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: C.textMuted, fontSize: 13 }}>
              选中文字或直接输入，和小克聊聊这本书
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div style={{ maxWidth: '85%' }}>
                <div
                  style={{
                    padding: '10px 14px', borderRadius: 18,
                    background: msg.role === 'user' ? C.userBubble : C.surface,
                    border: `1px solid ${msg.role === 'user' ? C.userBubbleBorder : C.border}`,
                    fontSize: 14, lineHeight: 1.75, color: C.text,
                  }}
                >
                  {msg.role === 'user' ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  ) : (
                    <div className="md-content" style={{ fontSize: 14 }}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {msg.role === 'assistant' && msg.tokens && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 4, fontSize: 10.5, color: C.metaText }}>
                    <span>{(((msg.tokens.input || 0) + (msg.tokens.output || 0)) / 1000).toFixed(1)}k tokens</span>
                    {(msg.tokens.cached || 0) > 0 && (
                      <span style={{ color: '#22c55e' }}>⚡ {((msg.tokens.cached || 0) / 1000).toFixed(1)}k cached</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isStreaming && (
            <div className="flex justify-start mb-3">
              <div style={{ padding: '10px 14px', borderRadius: 18, background: C.surface, border: `1px solid ${C.border}` }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.accent }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '8px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          borderTop: `1px solid ${C.border}`,
        }}>
          <div className="flex items-end gap-2.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="说点什么..."
              rows={1}
              className="flex-1 resize-none outline-none"
              style={{
                padding: '10px 14px', borderRadius: 20,
                background: C.inputBg, border: `1px solid ${C.border}`,
                fontSize: 14, lineHeight: 1.6, maxHeight: 100,
                color: C.text,
              }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 100) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              style={{
                width: 38, height: 38, borderRadius: '50%',
                background: input.trim() ? C.accentGradient : C.surface,
                color: input.trim() ? '#fff' : C.textMuted,
                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes chatFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes chatSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  )
}
