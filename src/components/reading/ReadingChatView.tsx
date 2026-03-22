import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Send } from 'lucide-react'
import { useReadingStore } from '../../stores/readingStore'
import { useChatStore } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'

interface ReadingChatViewProps {
  sessionId: string
  onClose: () => void
}

export default function ReadingChatView({ sessionId, onClose }: ReadingChatViewProps) {
  const sections = useReadingStore(s => s.sections)
  const chatSectionIndex = useReadingStore(s => s.chatSectionIndex)
  const activeSelection = useReadingStore(s => s.activeSelection)

  const currentSession = useSessionStore(s => s.currentSession)
  const messages = useChatStore(s => s.messages)
  const isStreaming = useChatStore(s => s.isStreaming)
  const sendMessage = useChatStore(s => s.sendMessage)
  const loadMessages = useChatStore(s => s.loadMessages)

  const [input, setInput] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!hasLoadedRef.current) {
      loadMessages(sessionId)
      hasLoadedRef.current = true
    }
  }, [sessionId, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  useEffect(() => {
    const syncLayout = () => {
      setIsMobile(window.innerWidth < 768)
    }

    syncLayout()
    window.addEventListener('resize', syncLayout)
    return () => window.removeEventListener('resize', syncLayout)
  }, [])

  const contextSection = chatSectionIndex !== null
    ? sections.find(s => s.id === chatSectionIndex)
    : null

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return

    const readingContext = activeSelection || contextSection
      ? {
          section_index: chatSectionIndex ?? undefined,
          selected_text: activeSelection || undefined,
          section_excerpt: contextSection?.content.slice(0, 180) || undefined,
        }
      : undefined

    const model = currentSession?.model ?? 'claude-sonnet-4.5'
    sendMessage(sessionId, model, text, { readingContext })
    setInput('')
  }, [input, isStreaming, sessionId, activeSelection, contextSection, chatSectionIndex, sendMessage, currentSession])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <>
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.15)' }}
        onClick={onClose}
      />

      <div
        className="fixed z-50 flex flex-col transition-transform duration-300"
        style={{
          top: 0,
          right: 0,
          bottom: 0,
          left: isMobile ? 0 : 'auto',
          width: isMobile ? '100%' : '40%',
          minWidth: isMobile ? 0 : 360,
          maxWidth: isMobile ? '100%' : 560,
          background: '#faf9f7',
          borderLeft: isMobile ? 'none' : '1px solid rgba(0,0,0,0.06)',
          boxShadow: isMobile ? 'none' : '-8px 0 32px rgba(0,0,0,0.08)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, color: '#002FA7', opacity: 0.5 }}>·</span>
            <span style={{ fontSize: '0.85rem', color: '#5a6477', fontWeight: 500 }}>
              讨论
            </span>
            {contextSection && (
              <span style={{ fontSize: '0.75rem', color: '#a0aac0' }}>
                · 段落 {chatSectionIndex}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer"
            style={{ color: '#8a95aa' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: '0.8rem' }}>返回阅读</span>
            <X size={16} />
          </button>
        </div>

        {(activeSelection || contextSection) && (
          <div
            className="mx-4 mt-3 px-3 py-2 rounded-lg"
            style={{
              background: 'rgba(0,47,167,0.03)',
              borderLeft: '2px solid rgba(0,47,167,0.2)',
              fontSize: '0.8rem',
              color: '#6b7a94',
              lineHeight: 1.6,
            }}
          >
            <p className="line-clamp-3">
              {activeSelection || contextSection?.content.slice(0, 150)}
              {((activeSelection?.length ?? 0) > 150 || (contextSection?.content?.length ?? 0) > 150) && '...'}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[85%] px-3 py-2 rounded-xl"
                style={{
                  background: msg.role === 'user'
                    ? 'rgba(0,47,167,0.08)'
                    : 'rgba(0,0,0,0.03)',
                  fontSize: '0.88rem',
                  lineHeight: 1.7,
                  color: '#3a4559',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#002FA7' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div
          className="shrink-0 px-4 py-3"
          style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="说点什么..."
              rows={1}
              className="flex-1 resize-none rounded-xl px-3 py-2 outline-none"
              style={{
                background: 'rgba(0,0,0,0.03)',
                border: '1px solid rgba(0,0,0,0.06)',
                fontSize: '0.88rem',
                lineHeight: 1.6,
                maxHeight: 120,
                color: '#3a4559',
              }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="p-2 rounded-xl transition-colors duration-150 cursor-pointer shrink-0"
              style={{
                background: input.trim() ? '#002FA7' : 'rgba(0,0,0,0.05)',
                color: input.trim() ? '#fff' : '#a0aac0',
                border: 'none',
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
