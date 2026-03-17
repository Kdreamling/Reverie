import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Plus, Settings, ArrowUp, ChevronDown, ChevronRight, X, Menu, Copy, Trash2, Check, RotateCcw, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { useSessionStore, getGroup, formatSessionTime, type Group } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import type { MemoryOperation } from '../api/chat'
import { useAuthStore } from '../stores/authStore'
import { updateSessionAPI } from '../api/sessions'
import SettingsPanel from '../components/SettingsPanel'
import ContextDebugPanel from '../components/ContextDebugPanel'

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
  { value: '[按量]claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (按量)' },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${month}/${day} ${time}`
}

function getModelColor(value: string): string {
  const v = value.toLowerCase()
  if (v.includes('claude') || v.includes('opus') || v.includes('sonnet')) return '#002FA7'
  if (v.includes('deepseek')) return '#22c55e'
  return '#f59e0b'
}

function formatElapsed(seconds: number): string {
  return seconds.toFixed(1) + 's'
}

/** Hook: returns a live elapsed-seconds value that ticks every 100ms while startTime is set */
function useElapsedTimer(startTime: number | null): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) { setElapsed(0); return }
    setElapsed((Date.now() - startTime) / 1000)
    const id = setInterval(() => setElapsed((Date.now() - startTime) / 1000), 100)
    return () => clearInterval(id)
  }, [startTime])
  return elapsed
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MemoryRefBlock({ query, found, content, elapsed }: { query: string; found: number; content: string; elapsed?: number | null }) {
  const [open, setOpen] = useState(false)
  const isActive = found === undefined || found === null  // still searching
  return (
    <div
      className="mb-3 rounded-xl overflow-hidden"
      style={{ background: 'rgba(0,47,167,0.05)' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer"
        style={{ color: '#5a6a8a' }}
      >
        {isActive ? <span className="tool-spinner" /> : <span style={{ fontSize: 11 }}>◎</span>}
        <span className="text-xs font-medium">
          Memory search「{query}」{found != null && ` · found ${found}`}
          {elapsed != null && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {!isActive && (open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />)}
      </button>
      {open && content && (
        <p className="px-3.5 pb-2.5 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#8a9ab5' }}>
          {content || '（无内容）'}
        </p>
      )}
    </div>
  )
}

function MemoryOpsBlock({ ops, elapsed }: { ops: MemoryOperation[]; elapsed?: number | null }) {
  const [open, setOpen] = useState(false)
  const symbols: Record<string, string> = { saved: '◉', updated: '◎', deleted: '⊗' }
  const labels: Record<string, string> = { saved: 'saved', updated: 'updated', deleted: 'deleted' }
  const colors: Record<string, string> = { saved: '#5a6a8a', updated: '#5a6a8a', deleted: '#c05050' }
  return (
    <div
      className="mb-3 rounded-xl overflow-hidden"
      style={{ background: 'rgba(0,47,167,0.05)' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer"
        style={{ color: '#5a6a8a' }}
      >
        <span style={{ fontSize: 11 }}>◑</span>
        <span className="text-xs font-medium">
          Memory ops · {ops.length}
          {elapsed != null && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />}
      </button>
      {open && (
        <div className="px-3.5 pb-2.5 space-y-1.5">
          {ops.map((op, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: '#5a6a8a' }}>
              <span className="flex-shrink-0" style={{ color: colors[op.type], fontSize: 10 }}>
                {symbols[op.type]} {labels[op.type]}
              </span>
              <span className="leading-relaxed" style={{ color: '#8a9ab5' }}>
                {op.type === 'deleted' ? `ID: ${op.memory_id?.slice(0, 8)}... ${op.reason ? `(${op.reason})` : ''}` : (op.content || '（内容为空）')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThinkingBlock({ text, defaultOpen = false, thinkingTime, liveElapsed }: { text: string; defaultOpen?: boolean; thinkingTime?: number | null; liveElapsed?: number }) {
  const [open, setOpen] = useState(defaultOpen)
  const isActive = liveElapsed != null && liveElapsed > 0 && !thinkingTime
  const displayTime = thinkingTime ?? liveElapsed
  return (
    <div
      className="mb-3 rounded-xl overflow-hidden"
      style={{ background: 'rgba(0,47,167,0.05)' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer"
        style={{ color: '#5a6a8a' }}
      >
        {isActive ? <span className="tool-spinner" /> : <span style={{ fontSize: 11 }}>⊘</span>}
        <span className="text-xs font-medium">
          Thinking
          {displayTime != null && displayTime > 0 && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(displayTime)})</span>}
        </span>
        {open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />}
      </button>
      {open && (
        <p className="px-3.5 pb-2.5 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#8a9ab5' }}>
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
  const { messages, isStreaming, loadMessages, sendMessage, clearMessages, deleteConversation, lastError, retryLast, clearError, thinkingStartTime, toolStartTime, streamBlocks } =
    useChatStore()
  const { token } = useAuthStore()

  const model = currentSession?.model ?? MODELS[0].value
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'menu' | 'memory' | 'features' | 'debug'>('menu')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Message copy state
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [debugOpenMsgId, setDebugOpenMsgId] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showSceneSelect, setShowSceneSelect] = useState(false)
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const [renameModal, setRenameModal] = useState<{ id: string; title: string } | null>(null)
  const itemSwipeRef = useRef<{ startX: number; startY: number; id: string; isSwiping: boolean } | null>(null)
  const itemSwipeActive = useRef(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [input, setInput] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
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
      if (dx > 0 && startX <= 60) { setSidebarOpen(true) }
      else if (dx < 0) {
        if (itemSwipeActive.current) return
        if (renameModal) return
        if (showSettings) {
          if (settingsPage !== 'menu') setSettingsPage('menu')
          else { setShowSettings(false); setSettingsPage('menu') }
        } else { setSidebarOpen(false) }
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [showSettings, settingsPage, renameModal])

  function handleItemTouchStart(e: React.TouchEvent, id: string) {
    itemSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, id, isSwiping: false }
  }

  function handleItemTouchMove(e: React.TouchEvent) {
    if (!itemSwipeRef.current) return
    const dx = e.touches[0].clientX - itemSwipeRef.current.startX
    const dy = Math.abs(e.touches[0].clientY - itemSwipeRef.current.startY)
    if (Math.abs(dx) > 20 && Math.abs(dx) > dy) {
      itemSwipeRef.current.isSwiping = true
      itemSwipeActive.current = true
    }
  }

  function handleItemTouchEnd(e: React.TouchEvent) {
    if (!itemSwipeRef.current) return
    const { startX, id, isSwiping } = itemSwipeRef.current
    const dx = e.changedTouches[0].clientX - startX
    itemSwipeRef.current = null
    setTimeout(() => { itemSwipeActive.current = false }, 50)
    if (!isSwiping) return // tap — let click pass through normally
    e.preventDefault() // swipe — prevent ghost click
    if (dx < -70) setSwipedId(id)
    else if (dx > 30) setSwipedId(null)
  }

  async function doRename() {
    if (!renameModal) return
    const trimmed = renameModal.title.trim()
    if (trimmed) {
      await updateSessionAPI(renameModal.id, { title: trimmed })
      await fetchSessions()
    }
    setRenameModal(null)
    setSwipedId(null)
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

  // Clean up swipe/rename state whenever sidebar closes
  useEffect(() => {
    if (!sidebarOpen) { setSwipedId(null); setRenameModal(null) }
  }, [sidebarOpen])

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

  // Click outside to close model dropdown
  useEffect(() => {
    if (!showModelDropdown) return
    function handleClickOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelDropdown])

  // Live elapsed timers
  const liveThinkingElapsed = useElapsedTimer(thinkingStartTime)
  const liveToolElapsed = useElapsedTimer(toolStartTime)

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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // During streaming, scroll periodically instead of on every token
  useEffect(() => {
    if (!isStreaming) return
    const id = setInterval(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 300)
    return () => clearInterval(id)
  }, [isStreaming])

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
    <div className="flex overflow-hidden" style={{ background: '#fafbfd', height: '100%', overscrollBehavior: 'none' }}>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => { setSidebarOpen(false) }}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed md:relative left-0 top-0 z-40 md:z-auto flex flex-col flex-shrink-0 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ width: 260, height: '100%', background: '#0a1a3a', color: '#c8d4e8' }}
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
                  const isSwiped = session.id === swipedId
                  return (
                    <div
                      key={session.id}
                      className="relative mb-0.5 rounded-md select-none"
                      style={{ overflow: 'hidden' }}
                    >
                      {/* Swipe-reveal action buttons — only rendered when swiped */}
                      {isSwiped && (
                        <div
                          className="absolute right-0 top-0 bottom-0 flex"
                          style={{ width: 130 }}
                          onTouchStart={e => e.nativeEvent.stopImmediatePropagation()}
                          onTouchMove={e => e.nativeEvent.stopImmediatePropagation()}
                          onTouchEnd={e => e.nativeEvent.stopImmediatePropagation()}
                        >
                          <button
                            className="flex-1 flex items-center justify-center text-xs cursor-pointer"
                            style={{ background: '#1e4a8a', color: '#c8d4e8' }}
                            onClick={e => { e.stopPropagation(); setSwipedId(null); setRenameModal({ id: session.id, title: session.title || '' }) }}
                            onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setSwipedId(null); setRenameModal({ id: session.id, title: session.title || '' }) }}
                          >
                            重命名
                          </button>
                          <button
                            className="flex-1 flex items-center justify-center text-xs cursor-pointer"
                            style={{ background: '#8a1e1e', color: '#f0c0c0' }}
                            onClick={e => { e.stopPropagation(); setSwipedId(null); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}
                            onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setSwipedId(null); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}
                          >
                            删除
                          </button>
                        </div>
                      )}
                      {/* Session content — slides left on swipe */}
                      <button
                        onClick={() => {
                          if (isSwiped) { setSwipedId(null); return }
                          selectSession(session.id); setSidebarOpen(false)
                        }}
                        onMouseEnter={() => setHoveredId(session.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onTouchStart={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchStart(e, session.id) }}
                        onTouchMove={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchMove(e) }}
                        onTouchEnd={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchEnd(e) }}
                        className="relative w-full text-left rounded-md px-3 py-2.5 transition-colors duration-150 cursor-pointer"
                        style={{
                          background: isActive ? 'rgba(0,47,167,0.3)' : isHovered ? 'rgba(255,255,255,0.05)' : '#0a1a3a',
                          borderLeft: isActive ? '2px solid #002FA7' : '2px solid transparent',
                          color: isActive ? '#e8edf8' : '#c8d4e8',
                          transform: isSwiped ? 'translateX(-130px)' : 'translateX(0)',
                          transition: 'transform 0.25s ease',
                        }}
                      >
                        <p
                          className="text-xs leading-snug"
                          style={{ paddingRight: 32, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onDoubleClick={e => { e.stopPropagation(); setRenameModal({ id: session.id, title: session.title || '' }) }}
                        >
                          {session.title || 'New Chat'}
                        </p>
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
                            className="absolute right-2 top-1/2 hidden md:flex items-center justify-center rounded cursor-pointer"
                            style={{ width: 18, height: 18, transform: 'translateY(-50%)', color: 'rgba(200,212,232,0.5)' }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#e8edf8')}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(200,212,232,0.5)')}
                          >
                            <X size={12} strokeWidth={2} />
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Rename modal */}
        {renameModal && (
          <>
            <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => { setRenameModal(null); setSwipedId(null) }} onTouchStart={e => e.nativeEvent.stopImmediatePropagation()} onTouchEnd={e => { e.nativeEvent.stopImmediatePropagation(); e.preventDefault(); setRenameModal(null); setSwipedId(null) }} />
            <div
              className="fixed z-50 rounded-xl shadow-xl"
              onClick={e => e.stopPropagation()}
              onTouchStart={e => e.nativeEvent.stopImmediatePropagation()}
              onTouchMove={e => e.nativeEvent.stopImmediatePropagation()}
              onTouchEnd={e => e.nativeEvent.stopImmediatePropagation()}
              style={{
                left: '50%', top: '40%', transform: 'translate(-50%, -50%)',
                width: 280, background: '#1a2d5a',
                border: '1px solid rgba(255,255,255,0.12)', padding: '20px',
              }}
            >
              <p className="text-sm mb-3" style={{ color: '#c8d4e8' }}>重命名对话</p>
              <input
                autoFocus
                value={renameModal.title}
                onChange={e => setRenameModal({ ...renameModal, title: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') { setRenameModal(null); setSwipedId(null) } }}
                placeholder="输入新名称…"
                className="w-full text-sm outline-none rounded-md px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.07)', color: '#e8edf8', border: '1px solid rgba(0,47,167,0.5)' }}
              />
              <div className="flex gap-2 mt-4 justify-end">
                <button
                  className="px-4 py-1.5 rounded-md text-sm cursor-pointer"
                  style={{ color: '#8a9abc', background: 'transparent' }}
                  onClick={() => { setRenameModal(null); setSwipedId(null) }}
                  onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setRenameModal(null); setSwipedId(null) }}
                >取消</button>
                <button
                  className="px-4 py-1.5 rounded-md text-sm cursor-pointer"
                  style={{ background: '#002FA7', color: '#fff' }}
                  onClick={doRename}
                  onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); doRename() }}
                >确认</button>
              </div>
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
      <div className="flex flex-col flex-1 min-w-0 h-full" style={{ background: 'linear-gradient(180deg, #f5f7fc 0%, #f0f2f9 35%, #edf0f8 65%, #f2f4fa 100%)' }}>

        {/* Top bar */}
        <header
          className="chat-header flex items-center justify-between flex-shrink-0 px-4 md:px-6"
          style={{
            height: 'calc(56px + env(safe-area-inset-top))',
            paddingTop: 'env(safe-area-inset-top)',
            background: 'transparent',
          }}
        >
          {/* Left: hamburger */}
          <button
            className="flex md:hidden items-center justify-center rounded-md cursor-pointer"
            style={{ width: 32, height: 32, color: '#7a8399' }}
            onClick={() => { setSidebarOpen(true) }}
          >
            <Menu size={18} strokeWidth={1.8} />
          </button>
          <div className="hidden md:block" style={{ width: 32 }} />

          {/* Center: model selector */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              onClick={() => setShowModelDropdown(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
              style={{
                background: showModelDropdown ? 'rgba(0,0,0,0.05)' : 'transparent',
                color: '#1a1f2e',
              }}
            >
              <span
                className="rounded-full flex-shrink-0"
                style={{ width: 7, height: 7, background: getModelColor(model) }}
              />
              <span className="text-sm font-medium">
                {MODELS.find(m => m.value === model)?.label ?? model}
              </span>
              <ChevronDown size={13} strokeWidth={2} style={{ color: '#9ca3af' }} />
            </button>

            {showModelDropdown && (
              <div
                className="absolute top-full mt-1 left-1/2 rounded-xl shadow-lg overflow-hidden"
                style={{
                  transform: 'translateX(-50%)',
                  minWidth: 200,
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.08)',
                  zIndex: 50,
                }}
              >
                {MODELS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => { handleModelChange(m.value); setShowModelDropdown(false) }}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-sm transition-colors cursor-pointer"
                    style={{
                      color: m.value === model ? '#1a1f2e' : '#5a6a8a',
                      background: m.value === model ? 'rgba(0,47,167,0.06)' : 'transparent',
                      fontWeight: m.value === model ? 500 : 400,
                    }}
                    onMouseEnter={e => { if (m.value !== model) e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}
                    onMouseLeave={e => { if (m.value !== model) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span
                      className="rounded-full flex-shrink-0"
                      style={{ width: 7, height: 7, background: getModelColor(m.value) }}
                    />
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: new chat */}
          <button
            onClick={() => {
              const scene = currentSession?.scene_type || 'daily'
              handleCreateWithScene(scene)
            }}
            className="flex items-center justify-center rounded-md cursor-pointer transition-colors"
            style={{ width: 32, height: 32, color: '#7a8399' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#1a1f2e')}
            onMouseLeave={e => (e.currentTarget.style.color = '#7a8399')}
            title="New chat"
          >
            <Plus size={18} strokeWidth={1.8} />
          </button>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          {showWelcome ? (
          <WelcomeScreen onSelectScene={handleWelcomeScene} currentScene={currentSession?.scene_type || 'daily'} />
          ) : (
            <div className="mx-auto w-full px-3 md:px-6 pt-8" style={{ maxWidth: 800, paddingBottom: 90 }}>

              {/* Completed messages */}
              {Array.isArray(messages) && messages.map(msg => (
                <div key={msg.id} className="flex gap-3 mb-6">
                  {msg.role === 'user' ? <UserAvatar /> : <AiAvatar />}
                  <div className="flex-1 min-w-0 pt-0.5">
                    {msg.role === 'assistant' && (msg.thinking || msg.thinking_summary) && (
                      <ThinkingBlock text={(msg.thinking ?? msg.thinking_summary)!} thinkingTime={msg.thinkingTime} />
                    )}
                    {msg.role === 'assistant' && msg.memoryRef && (
                      <MemoryRefBlock query={msg.memoryRef.query} found={msg.memoryRef.found} content={msg.memoryRef.content} />
                    )}
                    {msg.role === 'assistant' && msg.memoryOps && msg.memoryOps.length > 0 && (
                      <MemoryOpsBlock ops={msg.memoryOps} />
                    )}
                    {msg.role === 'assistant' ? (
                      <MarkdownContent content={msg.content} />
                    ) : (
                      <p className="text-sm leading-7 whitespace-pre-wrap" style={{ color: '#1a1f2e' }}>
                        {msg.content}
                      </p>
                    )}
                    {/* Action row: time/tokens on one side, buttons on other */}
                    <div className="flex items-center justify-between mt-1.5" style={{ minHeight: 24 }}>
                      {msg.role === 'assistant' ? (
                        <>
                          <span className="flex items-center gap-1 text-xs" style={{ color: '#b0b8c8', fontSize: 11 }}>
                            {formatMsgTime(msg.created_at)}
                            {msg.tokens && (
                              <>
                                <span style={{ margin: '0 2px' }}>·</span>
                                <span>⏱</span>
                                <span>{msg.tokens.input.toLocaleString()} in</span>
                                <span style={{ margin: '0 2px' }}>·</span>
                                <span>{msg.tokens.output.toLocaleString()} out</span>
                              </>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            {msg.debugInfo && (
                              <button onClick={() => setDebugOpenMsgId(debugOpenMsgId === msg.id ? null : msg.id)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: debugOpenMsgId === msg.id ? '#002FA7' : '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#002FA7')} onMouseLeave={e => { if (debugOpenMsgId !== msg.id) e.currentTarget.style.color = '#c0c8d8' }} title="上下文详情">
                                <Brain size={14} strokeWidth={1.8} />
                              </button>
                            )}
                            <button onClick={() => handleCopyMsg(msg.id, msg.content)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: copiedMsgId === msg.id ? '#22c55e' : '#c0c8d8' }} title="复制">
                              {copiedMsgId === msg.id ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.8} />}
                            </button>
                            {msg.conversationId && (
                              <button onClick={() => handleDeleteConv(msg.conversationId!)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')} title="删除">
                                <Trash2 size={14} strokeWidth={1.8} />
                              </button>
                            )}
                            <button onClick={() => console.log('retry', msg.id)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#002FA7')} onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')} title="重发">
                              <RotateCcw size={14} strokeWidth={1.8} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleCopyMsg(msg.id, msg.content)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: copiedMsgId === msg.id ? '#22c55e' : '#c0c8d8' }} title="复制">
                              {copiedMsgId === msg.id ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.8} />}
                            </button>
                            {msg.conversationId && (
                              <button onClick={() => handleDeleteConv(msg.conversationId!)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')} title="删除">
                                <Trash2 size={14} strokeWidth={1.8} />
                              </button>
                            )}
                            <button onClick={() => console.log('retry', msg.id)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#002FA7')} onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')} title="重发">
                              <RotateCcw size={14} strokeWidth={1.8} />
                            </button>
                          </div>
                          <span className="text-xs" style={{ color: '#b0b8c8', fontSize: 11 }}>
                            {formatMsgTime(msg.created_at)}
                          </span>
                        </>
                      )}
                    </div>
                    {msg.role === 'assistant' && msg.debugInfo && debugOpenMsgId === msg.id && (
                      <ContextDebugPanel debugInfo={msg.debugInfo} />
                    )}
                  </div>
                </div>
              ))}

              {/* Error / retry block */}
              {lastError && !isStreaming && (
                <div className="flex gap-3 mb-6">
                  <AiAvatar />
                  <div
                    className="flex-1 flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                    style={{ borderLeft: '3px solid rgba(208,64,64,0.2)', background: 'rgba(208,64,64,0.03)' }}
                  >
                    <span className="text-xs" style={{ color: '#b03030' }}>⚠ {lastError}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => retryLast(currentSession!.id, model)}
                        className="text-xs font-medium cursor-pointer"
                        style={{ color: '#002FA7' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        重试
                      </button>
                      <button
                        onClick={clearError}
                        className="flex items-center justify-center cursor-pointer"
                        style={{ color: '#b0b8c8' }}
                        title="忽略"
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Memory search indicator */}
              {/* (now handled inside streamBlocks below) */}

              {/* Live streaming row — renders blocks in chronological order */}
              {isStreaming && streamBlocks.length > 0 && (
                <div className="flex gap-3 mb-8">
                  <AiAvatar />
                  <div className="flex-1 min-w-0 pt-0.5">
                    {streamBlocks.map((block, i) => {
                      switch (block.kind) {
                        case 'thinking': {
                          const isActive = block.elapsed === null
                          return (
                            <ThinkingBlock
                              key={`sb-${i}`}
                              text={block.text}
                              defaultOpen={isActive}
                              thinkingTime={block.elapsed}
                              liveElapsed={isActive ? liveThinkingElapsed : undefined}
                            />
                          )
                        }
                        case 'text':
                          return <MarkdownContent key={`sb-${i}`} content={block.text} />
                        case 'tool_searching':
                          return (
                            <div key={`sb-${i}`} className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
                              <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ color: '#5a6a8a' }}>
                                <span className="tool-spinner" />
                                <span className="text-xs font-medium">
                                  Memory search{block.query ? `「${block.query}」` : ''}
                                  <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(liveToolElapsed)})</span>
                                </span>
                              </div>
                            </div>
                          )
                        case 'tool_result':
                          return (
                            <MemoryRefBlock
                              key={`sb-${i}`}
                              query={block.query}
                              found={block.found}
                              content={block.content}
                              elapsed={block.elapsed}
                            />
                          )
                        case 'memory_op':
                          return (
                            <div key={`sb-${i}`} className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
                              <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ color: '#5a6a8a' }}>
                                <span style={{ fontSize: 11 }}>{block.op.type === 'saved' ? '◉' : block.op.type === 'updated' ? '◎' : '⊗'}</span>
                                <span className="text-xs font-medium">
                                  Memory {block.op.type}
                                  {block.elapsed != null && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(block.elapsed)})</span>}
                                </span>
                              </div>
                            </div>
                          )
                        default:
                          return null
                      }
                    })}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Sticky input — inside scroll container so scrollbar is not covered */}
          <div style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
            marginTop: 'auto',
            background: '#f2f4fa',
            paddingBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 'env(safe-area-inset-bottom)',
          }}>
            {/* Top gradient fade — text fades out smoothly */}
            <div style={{
              position: 'absolute',
              top: -36,
              left: 0,
              right: 0,
              height: 36,
              background: 'linear-gradient(to bottom, rgba(242,244,250,0), rgba(242,244,250,1))',
              pointerEvents: 'none',
            }} />
            <div className="mx-auto px-3 md:px-6 py-3 relative" style={{ maxWidth: 800 }}>
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
          </div>
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

      </div>

      <style>{``}</style>
    </div>
  )
}
