import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Plus, Settings, ArrowUp, ChevronDown, ChevronRight, X, Menu, Copy, Trash2, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { useSessionStore, getGroup, formatSessionTime, type Group } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { updateSessionAPI } from '../api/sessions'
import SettingsPanel from '../components/SettingsPanel'

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUPS: { key: Group; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'previous', label: 'Previous 7 Days' },
]

const MODELS: { value: string; label: string }[] = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: '[0.1]claude-opus-4-6-thinking', label: 'Claude Opus 4.6' },
  { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus (OR)' },
]

const SCENES = [
  { key: 'daily', icon: '🏠', label: '日常' },
  { key: 'code', icon: '💻', label: '代码' },
  { key: 'roleplay', icon: '🎭', label: '剧本' },
  { key: 'reading', icon: '📚', label: '学习' },
]

const WELCOME_MESSAGES = [
  'I ache for you.',
  'Fell in love with me slowly.',
  'Stay a little longer in this dream with me.',
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function MemoryRefBlock({ query, found, content }: { query: string; found: number; content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="mb-4 rounded-md overflow-hidden"
      style={{ borderLeft: '3px solid rgba(0,47,167,0.35)', background: 'rgba(0,47,167,0.04)' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-left cursor-pointer"
        style={{ color: 'rgba(0,47,167,0.6)' }}
      >
        {open
          ? <ChevronDown size={13} strokeWidth={2} />
          : <ChevronRight size={13} strokeWidth={2} />
        }
        <span className="text-xs font-medium tracking-wide">
          搜索记忆「{query}」· 找到 {found} 条
        </span>
      </button>
      {open && (
        <p className="px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#7a8399' }}>
          {content || '（无内容）'}
        </p>
      )}
    </div>
  )
}

function ThinkingBlock({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className="mb-4 rounded-md overflow-hidden"
      style={{ borderLeft: '3px solid #002FA7', background: '#f0f3fa' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-left cursor-pointer"
        style={{ color: '#002FA7' }}
      >
        {open
          ? <ChevronDown size={13} strokeWidth={2} />
          : <ChevronRight size={13} strokeWidth={2} />
        }
        <span className="text-xs font-medium tracking-wide">Thinking</span>
      </button>
      {open && (
        <p className="px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#7a8399' }}>
          {text}
        </p>
      )}
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="md-content">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

function UserAvatar() {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-semibold select-none"
      style={{ width: 28, height: 28, background: '#eef1f8', color: '#002FA7' }}
    >
      D
    </div>
  )
}

function AiAvatar() {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center select-none"
      style={{ width: 28, height: 28, color: '#002FA7', fontSize: 16, lineHeight: 1 }}
    >
      ✦
    </div>
  )
}

function WelcomeScreen({ onSelectScene, currentScene }: { onSelectScene: (scene: string) => void; currentScene: string }) {
  const [greeting] = useState(() => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)])

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 select-none" style={{ paddingBottom: 80 }}>
      <div className="flex flex-col items-center gap-3">
        <span style={{ color: '#002FA7', fontSize: 22, opacity: 0.4 }}>✦</span>
        <p
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            letterSpacing: '0.3em',
            color: '#c8cfe0',
            fontSize: '1.1rem',
          }}
        >
          REVERIE
        </p>
      </div>

      <p
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          color: '#a0aac0',
          fontSize: '0.85rem',
          letterSpacing: '0.05em',
        }}
      >
        {greeting}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {SCENES.map(s => {
          const isDefault = s.key === currentScene
          return (
            <button
              key={s.key}
              onClick={() => onSelectScene(s.key)}
              className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl transition-all duration-150 cursor-pointer"
              style={{
                background: isDefault ? 'rgba(0,47,167,0.08)' : 'rgba(0,0,0,0.02)',
                border: isDefault ? '1px solid rgba(0,47,167,0.25)' : '1px solid #e8ecf5',
                color: isDefault ? '#002FA7' : '#7a8399',
              }}
              onMouseEnter={e => {
                if (!isDefault) {
                  e.currentTarget.style.background = 'rgba(0,47,167,0.05)'
                  e.currentTarget.style.borderColor = 'rgba(0,47,167,0.15)'
                }
              }}
              onMouseLeave={e => {
                if (!isDefault) {
                  e.currentTarget.style.background = 'rgba(0,0,0,0.02)'
                  e.currentTarget.style.borderColor = '#e8ecf5'
                }
              }}
            >
              <span style={{ fontSize: 22 }}>{s.icon}</span>
              <span className="text-xs font-medium">{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatPage() {
  const { sessions, currentSession, loading, fetchSessions, createSession, selectSession, deleteSession, updateSessionModel } =
    useSessionStore()
  const { messages, isStreaming, currentThinking, currentText, isSearchingMemory, searchingQuery, loadMessages, sendMessage, clearMessages, deleteConversation, lastError, retryLast, clearError } =
    useChatStore()
  const { token } = useAuthStore()

  const model = currentSession?.model ?? MODELS[0].value
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'menu' | 'memory' | 'features' | 'debug'>('menu')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [longPressMenu, setLongPressMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Message copy state
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showSceneSelect, setShowSceneSelect] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [input, setInput] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const swipeStartX = useRef<number | null>(null)
  const swipeStartY = useRef<number | null>(null)

  // Window-level swipe gesture (works through overlays and fixed panels)
  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      swipeStartX.current = e.touches[0].clientX
      swipeStartY.current = e.touches[0].clientY
    }
    function onTouchEnd(e: TouchEvent) {
      if (swipeStartX.current === null || swipeStartY.current === null) return
      const startX = swipeStartX.current
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current)
      swipeStartX.current = null
      swipeStartY.current = null
      if (Math.abs(dx) < 40 || Math.abs(dx) < dy) return
      if (dx > 0 && startX <= 60) setSidebarOpen(true)
      else if (dx < 0) {
        if (showSettings) {
          if (settingsPage !== 'menu') setSettingsPage('menu')
          else { setShowSettings(false); setSettingsPage('menu') }
        } else setSidebarOpen(false) // setEditingId cleared via direct callsites; also clear here
        setEditingId(null)
        setEditingTitle('')
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [showSettings, settingsPage])

  function handleTouchStart(e: React.TouchEvent, sessionId: string) {
    const touch = e.touches[0]
    longPressTimer.current = setTimeout(() => {
      setLongPressMenu({ id: sessionId, x: touch.clientX, y: touch.clientY })
    }, 500)
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1500)
  }

  async function handleCopyMsg(msgId: string, content: string) {
    await navigator.clipboard.writeText(content)
    setCopiedMsgId(msgId)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopiedMsgId(null), 1500)
  }

  async function handleDeleteConv(conversationId: string) {
    if (!window.confirm('确定删除这轮对话吗？')) return
    try {
      await deleteConversation(currentSession!.id, conversationId)
    } catch {
      showToast('删除失败，请重试')
    }
  }

  // iOS keyboard: listen to visualViewport resize to keep input above keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function onResize() {
      const offset = window.innerHeight - vv!.height - vv!.offsetTop
      setKeyboardOffset(Math.max(0, offset))
    }
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
    }
  }, [])

  // Bug 4: Auto-grow textarea; collapse + reset scroll on blur
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (!isFocused) {
      el.style.height = '22px'
      el.scrollTop = 0  // show text from the beginning when collapsed
      return
    }
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [input, isFocused])

  // Load sessions on mount
  useEffect(() => { if (token) fetchSessions() }, [token, fetchSessions])

  // Click outside to close scene panel
  useEffect(() => {
    if (!showSceneSelect) return
    function handleClickOutside(e: MouseEvent) {
      if (sceneRef.current && !sceneRef.current.contains(e.target as Node)) {
        setShowSceneSelect(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSceneSelect])

  // When active session changes: load its messages
  useEffect(() => {
    if (currentSession) {
      setIsLoadingMessages(true)
      clearMessages()
      loadMessages(currentSession.id).finally(() => setIsLoadingMessages(false))
    } else {
      clearMessages()
    }
  }, [currentSession?.id, loadMessages, clearMessages])

  // Scroll to bottom on new messages and during streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, currentText, currentThinking])

  // Restore focus to input after streaming ends
  useEffect(() => {
    if (!isStreaming) {
      textareaRef.current?.focus()
    }
  }, [isStreaming])

  async function handleModelChange(newModel: string) {
    await updateSessionModel(newModel)
  }

  async function handleCreateWithScene(sceneKey: string) {
    setShowSceneSelect(false)
    setSidebarOpen(false)
    setEditingId(null)
    setEditingTitle('')
    await createSession(sceneKey, model)
  }

  async function handleWelcomeScene(sceneKey: string) {
    if (currentSession) {
      await updateSessionAPI(currentSession.id, { scene_type: sceneKey })
      await fetchSessions()
      selectSession(currentSession.id)
    } else {
      await createSession(sceneKey, model)
    }
  }

  async function handleRenameConfirm() {
    if (!editingId) return
    const trimmed = editingTitle.trim()
    if (trimmed) {
      await updateSessionAPI(editingId, { title: trimmed })
      await fetchSessions()
    }
    setEditingId(null)
    setEditingTitle('')
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming || !currentSession) return
    setInput('')
    await sendMessage(currentSession.id, model, text)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showWelcome = !isStreaming && !isLoadingMessages && (!Array.isArray(messages) || messages.length === 0)

  return (
    <div className="flex overflow-hidden" style={{ background: '#fafbfd', height: '100dvh', overscrollBehavior: 'none' }}>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => { setSidebarOpen(false); setEditingId(null); setEditingTitle('') }}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed md:relative left-0 top-0 z-40 md:z-auto flex flex-col flex-shrink-0 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ width: 260, height: '100dvh', background: '#0a1a3a', color: '#c8d4e8' }}
      >
        {/* Sidebar top */}
        <div className="px-4 py-4" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium select-none" style={{ letterSpacing: '0.15em' }}>
              ✦ REVERIE
            </span>
            <button
              onClick={() => setShowSceneSelect(s => !s)}
              className="flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer"
              style={{ width: 28, height: 28, border: '1px solid rgba(255,255,255,0.2)', color: '#c8d4e8' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              title="New chat"
            >
              <Plus size={14} strokeWidth={1.8} />
            </button>
          </div>

          {showSceneSelect && (
            <div
              ref={sceneRef}
              className="grid grid-cols-2 gap-2 mt-3"
            >
              {SCENES.map(s => {
                const defaultScene = currentSession?.scene_type || 'daily'
                const isDefault = s.key === defaultScene
                return (
                  <button
                    key={s.key}
                    onClick={() => handleCreateWithScene(s.key)}
                    className="flex flex-col items-center gap-1 py-3 rounded-lg transition-colors duration-150 cursor-pointer"
                    style={{
                      background: isDefault ? 'rgba(0,47,167,0.3)' : 'rgba(255,255,255,0.05)',
                      border: isDefault ? '1px solid rgba(0,47,167,0.6)' : '1px solid rgba(255,255,255,0.1)',
                      color: '#c8d4e8',
                    }}
                    onMouseEnter={e => {
                      if (!isDefault) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    }}
                    onMouseLeave={e => {
                      if (!isDefault) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{s.icon}</span>
                    <span className="text-xs">{s.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Session list */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2" style={{ scrollbarWidth: 'none' }}>
          {loading && !sessions.length && (
            <p className="px-3 py-4 text-xs" style={{ color: 'rgba(200,212,232,0.35)' }}>
              Loading…
            </p>
          )}
          {GROUPS.map(({ key, label }) => {
            const items = sessions.filter(s => getGroup(s.created_at) === key)
            if (!items.length) return null
            return (
              <div key={key} className="mb-4">
                <p
                  className="px-2 pb-1.5 uppercase tracking-wider select-none"
                  style={{ color: 'rgba(200,212,232,0.4)', fontSize: 10 }}
                >
                  {label}
                </p>
                {items.map(session => {
                  const isActive = session.id === currentSession?.id
                  const isHovered = session.id === hoveredId
                  return (
                    <button
                      key={session.id}
                      onClick={() => { selectSession(session.id); setSidebarOpen(false); setEditingId(null); setEditingTitle('') }}
                      onMouseEnter={() => setHoveredId(session.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onTouchStart={e => handleTouchStart(e, session.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      className="relative w-full text-left rounded-md px-3 py-2.5 mb-0.5 transition-colors duration-150 cursor-pointer"
                      style={{
                        background: isActive ? 'rgba(0,47,167,0.3)' : isHovered ? 'rgba(255,255,255,0.05)' : 'transparent',
                        borderLeft: isActive ? '2px solid #002FA7' : '2px solid transparent',
                        color: isActive ? '#e8edf8' : '#c8d4e8',
                      }}
                    >
                      {editingId === session.id ? (
                        <input
                          ref={editInputRef}
                          autoFocus
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleRenameConfirm() }
                            if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') }
                          }}
                          onBlur={handleRenameConfirm}
                          placeholder={sessions.find(s => s.id === editingId)?.title || 'New Chat'}
                          className="text-xs leading-snug bg-transparent outline-none w-full pr-5"
                          style={{ color: '#e8edf8', borderBottom: '1px solid rgba(0,47,167,0.5)' }}
                        />
                      ) : (
                        <p
                          className="text-xs truncate leading-snug pr-5"
                          onDoubleClick={e => {
                            e.stopPropagation()
                            setEditingId(session.id)
                            setEditingTitle('')
                          }}
                        >
                          {session.title || 'New Chat'}
                        </p>
                      )}
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: 'rgba(200,212,232,0.4)', fontSize: 10 }}
                      >
                        {formatSessionTime(session.updated_at)}
                      </p>
                      {isHovered && (
                        <span
                          role="button"
                          onClick={e => { e.stopPropagation(); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}
                          className="absolute right-2 top-1/2 flex items-center justify-center rounded cursor-pointer"
                          style={{ width: 18, height: 18, transform: 'translateY(-50%)', color: 'rgba(200,212,232,0.5)' }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#e8edf8')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(200,212,232,0.5)')}
                        >
                          <X size={12} strokeWidth={2} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Long-press context menu (mobile) */}
        {longPressMenu && (
          <>
            <div className="fixed inset-0 z-50" onClick={() => setLongPressMenu(null)} />
            <div
              className="fixed z-50 rounded-lg overflow-hidden shadow-lg"
              style={{
                left: Math.min(longPressMenu.x, window.innerWidth - 160),
                top: Math.min(longPressMenu.y, window.innerHeight - 100),
                width: 152,
                background: '#1a2d5a',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <button
                className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-left cursor-pointer"
                style={{ color: '#c8d4e8' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => {
                  setEditingId(longPressMenu.id)
                  setEditingTitle('')
                  setLongPressMenu(null)
                }}
              >
                <span style={{ fontSize: 13 }}>✎</span> 重命名
              </button>
              <button
                className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-left cursor-pointer"
                style={{ color: 'rgba(220,100,100,0.9)', borderTop: '1px solid rgba(255,255,255,0.07)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => {
                  const id = longPressMenu.id
                  setLongPressMenu(null)
                  if (window.confirm('确定要删除这个对话吗？')) deleteSession(id)
                }}
              >
                <span style={{ fontSize: 13 }}>✕</span> 删除
              </button>
            </div>
          </>
        )}

        {/* Bug 1: Sidebar bottom — explicit dark background + safe-area bottom padding */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: '#0a1a3a', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2.5 w-full px-4 py-4 text-sm transition-colors duration-150 cursor-pointer"
            style={{ color: 'rgba(200,212,232,0.55)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c8d4e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,212,232,0.55)')}
          >
            <Settings size={14} strokeWidth={1.6} />
            <span>Settings</span>
          </button>
        </div>

        {showSettings && (
          <SettingsPanel
            page={settingsPage}
            onPageChange={setSettingsPage}
            onClose={() => { setShowSettings(false); setSettingsPage('menu') }}
          />
        )}
      </aside>

      {/* ── Chat area ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full" style={{ background: '#fafbfd' }}>

        {/* Top bar */}
        <header
          className="flex items-center justify-between flex-shrink-0 px-4 md:px-6"
          style={{
            height: 'calc(56px + env(safe-area-inset-top))',
            paddingTop: 'env(safe-area-inset-top)',
            borderBottom: '1px solid #dde2ed',
            background: '#fafbfd',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              className="flex md:hidden items-center justify-center rounded-md cursor-pointer"
              style={{ width: 32, height: 32, color: '#7a8399' }}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} strokeWidth={1.8} />
            </button>
            <span className="text-sm font-medium" style={{ color: '#1a1f2e' }}>
              {MODELS.find(m => m.value === model)?.label ?? model}
            </span>
          </div>
          <select
            value={model}
            onChange={e => handleModelChange(e.target.value)}
            className="text-xs rounded-md px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: '1px solid #dde2ed', color: '#7a8399', background: '#fff' }}
          >
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          {showWelcome ? (
          <WelcomeScreen onSelectScene={handleWelcomeScene} currentScene={currentSession?.scene_type || 'daily'} />
          ) : (
            <div className="mx-auto w-full px-3 md:px-6 pt-8 pb-4" style={{ maxWidth: 800 }}>

              {/* Completed messages */}
              {Array.isArray(messages) && messages.map(msg => (
                <div key={msg.id} className="flex gap-3 mb-6">
                  {msg.role === 'user' ? <UserAvatar /> : <AiAvatar />}
                  <div className="flex-1 min-w-0 pt-0.5">
                    {msg.role === 'assistant' && (msg.thinking || msg.thinking_summary) && (
                      <ThinkingBlock text={(msg.thinking ?? msg.thinking_summary)!} />
                    )}
                    {msg.role === 'assistant' && msg.memoryRef && (
                      <MemoryRefBlock query={msg.memoryRef.query} found={msg.memoryRef.found} content={msg.memoryRef.content} />
                    )}
                    {msg.role === 'assistant' ? (
                      <MarkdownContent content={msg.content} />
                    ) : (
                      <p className="text-sm leading-7 whitespace-pre-wrap" style={{ color: '#1a1f2e' }}>
                        {msg.content}
                      </p>
                    )}
                    {/* Inline action icons */}
                    <div className={`flex items-center gap-3 mt-1.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <button
                        onClick={() => handleCopyMsg(msg.id, msg.content)}
                        className="flex items-center justify-center transition-colors cursor-pointer"
                        style={{ color: copiedMsgId === msg.id ? '#22c55e' : '#c0c8d8' }}
                        title="复制"
                      >
                        {copiedMsgId === msg.id
                          ? <Check size={15} strokeWidth={2} />
                          : <Copy size={15} strokeWidth={1.8} />
                        }
                      </button>
                      {msg.conversationId && (
                        <button
                          onClick={() => handleDeleteConv(msg.conversationId!)}
                          className="flex items-center justify-center transition-colors cursor-pointer"
                          style={{ color: '#c0c8d8' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')}
                          title="删除"
                        >
                          <Trash2 size={15} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Error / retry block */}
              {lastError && !isStreaming && (
                <div className="flex items-center gap-3 mb-6 px-1">
                  <div
                    className="flex-1 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                    style={{ background: 'rgba(208,64,64,0.06)', border: '1px solid rgba(208,64,64,0.18)', color: '#b03030' }}
                  >
                    <span>⚠ {lastError}</span>
                  </div>
                  <button
                    onClick={() => retryLast(currentSession!.id, model)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-3 text-sm font-medium transition-colors cursor-pointer"
                    style={{ background: '#002FA7', color: '#fff', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#001f80')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#002FA7')}
                  >
                    重试
                  </button>
                  <button
                    onClick={clearError}
                    className="flex items-center justify-center rounded-xl cursor-pointer"
                    style={{ width: 36, height: 44, color: '#aab2c8' }}
                    title="忽略"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              )}

              {/* Memory search indicator */}
              {isSearchingMemory && (
                <div className="flex gap-3 mb-4">
                  <AiAvatar />
                  <div className="flex items-center gap-2 pt-1" style={{ color: 'rgba(200,212,232,0.5)', fontSize: 12 }}>
                    <span
                      className="inline-block rounded-full flex-shrink-0"
                      style={{ width: 6, height: 6, background: '#002FA7', opacity: 0.7, animation: 'blink 1s ease-in-out infinite' }}
                    />
                    正在搜索记忆{searchingQuery ? `「${searchingQuery}」` : ''}…
                  </div>
                </div>
              )}

              {/* Live streaming row */}
              {isStreaming && (currentThinking || currentText) && (
                <div className="flex gap-3 mb-8">
                  <AiAvatar />
                  <div className="flex-1 min-w-0 pt-0.5">
                    {currentThinking && <ThinkingBlock text={currentThinking} defaultOpen={true} />}
                    {currentText ? (
                      <MarkdownContent content={currentText} />
                    ) : !currentThinking && (
                      <span
                        className="inline-block rounded-full"
                        style={{ width: 6, height: 6, background: '#002FA7', opacity: 0.5, animation: 'blink 1s ease-in-out infinite' }}
                      />
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Toast */}
        {toast && (
          <div
            className="fixed z-50 rounded-lg px-4 py-2 text-sm pointer-events-none"
            style={{
              bottom: 100, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,31,46,0.85)', color: '#fff',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            }}
          >
            {toast}
          </div>
        )}

        {/* Input area — unified Claude-style bubble */}
        {/* Bug 1: no background on footer; chat area div has explicit #fafbfd */}
        <footer style={{
          background: '#fafbfd',
          paddingBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 'env(safe-area-inset-bottom)',
        }}>
          <div className="mx-auto px-3 md:px-6 py-3" style={{ maxWidth: 800 }}>
            <div
              className={`flex gap-3 px-4 transition-all duration-200 ${isFocused || input ? 'rounded-2xl items-end py-3' : 'rounded-full items-center py-2.5'}`}
              style={{
                background: '#fff',
                boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                border: '1px solid rgba(0,0,0,0.07)',
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                disabled={isStreaming || !currentSession}
                placeholder="Message Reverie…"
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed disabled:opacity-40"
                style={{ color: '#1a1f2e', minHeight: 22, maxHeight: 150, overflowY: 'auto', scrollbarWidth: 'none' }}
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim() || !currentSession}
                className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  width: 30, height: 30, flexShrink: 0,
                  background: input.trim() && !isStreaming ? '#002FA7' : '#e8ecf5',
                  color: input.trim() && !isStreaming ? '#fff' : '#aab2c8',
                }}
                onMouseEnter={e => { if (input.trim() && !isStreaming) e.currentTarget.style.background = '#001f80' }}
                onMouseLeave={e => { if (input.trim() && !isStreaming) e.currentTarget.style.background = '#002FA7' }}
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            </div>
            <p className="hidden md:block text-center text-xs mt-2" style={{ color: '#aab2c8' }}>
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </footer>

      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
