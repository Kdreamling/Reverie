import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Plus, Settings, ArrowUp, ChevronDown, ChevronRight, X, Menu } from 'lucide-react'
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
  const { messages, isStreaming, currentThinking, currentText, isSearchingMemory, searchingQuery, loadMessages, sendMessage, clearMessages } =
    useChatStore()
  const { token } = useAuthStore()

  const model = currentSession?.model ?? MODELS[0].value
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'menu' | 'memory' | 'features' | 'debug'>('menu')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [longPressMenu, setLongPressMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showSceneSelect, setShowSceneSelect] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
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
        } else setSidebarOpen(false)
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [showSettings])

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

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (!input && !isFocused) {
      el.style.height = '22px'
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

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 22 * 5 + 24) + 'px'
  }, [input])

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
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed md:relative left-0 top-0 h-full z-40 md:z-auto flex flex-col flex-shrink-0 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ width: 260, background: '#0a1a3a', color: '#c8d4e8' }}
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
                      onClick={() => { selectSession(session.id); setSidebarOpen(false) }}
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
                          autoFocus
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleRenameConfirm() }
                            if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') }
                          }}
                          onBlur={handleRenameConfirm}
                          className="text-xs leading-snug bg-transparent outline-none w-full pr-5"
                          style={{ color: '#e8edf8', borderBottom: '1px solid rgba(0,47,167,0.5)' }}
                        />
                      ) : (
                        <p
                          className="text-xs truncate leading-snug pr-5"
                          onDoubleClick={e => {
                            e.stopPropagation()
                            setEditingId(session.id)
                            setEditingTitle(session.title || '')
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
                  setEditingTitle(sessions.find(s => s.id === longPressMenu.id)?.title || '')
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

        {/* Sidebar bottom */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
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
      <div className="flex flex-col flex-1 min-w-0 h-full">

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
                <div key={msg.id} className="flex gap-3 mb-8">
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
                  </div>
                </div>
              ))}

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

        {/* Input area — unified Claude-style bubble */}
        <footer style={{
          background: '#fafbfd',
          paddingBottom: keyboardOffset > 0 ? keyboardOffset : 'env(safe-area-inset-bottom)',
        }}>
          <div className="mx-auto px-3 md:px-6 py-3" style={{ maxWidth: 800 }}>
            <div
              className={`flex gap-3 rounded-2xl px-4 transition-all duration-150 ${isFocused || input ? 'items-end py-3' : 'items-center py-2.5'}`}
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
