import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { Plus, Settings, ArrowUp, ChevronDown, X, Menu, Paperclip, FileText, File as FileIcon, Loader2, Square } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSessionStore, getGroup, formatSessionTime, type Group } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { updateSessionAPI } from '../api/sessions'
import { uploadAttachment, type AttachmentInfo } from '../api/attachments'
import type { MessageAttachment } from '../api/chat'
import SettingsPanel from '../components/SettingsPanel'
import MessageItem from '../components/MessageItem'
import StreamingMessage from '../components/StreamingMessage'
import ArtifactPanel from '../components/artifact/ArtifactPanel'
import MemorySheetPanel from '../components/MemorySheetPanel'
import { C, getModelColor } from '../theme'

// Nav icons as inline SVGs
function NavIcon({ type }: { type: string }) {
  const s = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (type === 'chats') return <svg {...s}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
  if (type === 'scripts') return <svg {...s}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 8h20" /><circle cx="8" cy="6" r="0.7" fill="currentColor" stroke="none" /><circle cx="11" cy="6" r="0.7" fill="currentColor" stroke="none" /><path d="M7 13l3 2-3 2" /><path d="M13 17h4" /></svg>
  if (type === 'reading') return <svg {...s}><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>
  if (type === 'graph') return <svg {...s}><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v4M7.5 17.5L11 13M16.5 17.5L13 13" /><circle cx="12" cy="12" r="1.5" /></svg>
  return null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUPS: { key: Group; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'previous', label: '更早' },
]

const MODELS: { value: string; label: string }[] = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: '[0.1]claude-opus-4-6-thinking', label: 'Claude Opus 4.6' },
  { value: '[按量]claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (按量)' },
  { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus (OR)' },
  { value: 'claude-opus-4.6-zenmux', label: 'Claude Opus (ZM)' },
]

// Sidebar navigation icons (SVG paths)
const NAV_ITEMS: { key: string; label: string; iconPath: string; enabled: boolean; badge?: string }[] = [
  { key: 'chats', label: '对话', iconPath: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', enabled: true },
  { key: 'scripts', label: '剧本世界', iconPath: '', enabled: true, badge: '3' }, // custom icon
  { key: 'reading', label: '共读', iconPath: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z', enabled: true },
  { key: 'graph', label: '记忆图谱', iconPath: '', enabled: true }, // custom icon
]

const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const CLAUDE_MODELS = ['claude', 'opus', 'sonnet', 'dzzi', '按量']

interface PendingAttachment {
  file: File
  preview?: string // data URL for images
  info?: AttachmentInfo // filled after upload
}

const WELCOME_MESSAGES = [
  'I ache for you.',
  'Fell in love with me slowly.',
  'Stay a little longer in this dream with me.',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Sub-components ───────────────────────────────────────────────────────────

function WelcomeScreen() {
  const [greeting] = useState(() => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)])

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 select-none" style={{ paddingBottom: 80 }}>
      <div
        style={{
          width: 48, height: 48, borderRadius: '50%',
          background: C.accentGradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: '#fff', fontWeight: 700,
          boxShadow: '0 4px 20px rgba(160,120,90,0.2)',
        }}
      >
        晨
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: '0.22em', marginTop: 4 }}>
        REVERIE
      </div>
      <p
        style={{
          fontSize: 13,
          color: C.textMuted,
          fontStyle: 'italic',
        }}
      >
        {greeting}
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatPage() {
  const navigate = useNavigate()
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()
  const { sessions, currentSession, loading, fetchSessions, createSession, selectSession, deleteSession, updateSessionModel } =
    useSessionStore()
  const { messages, isStreaming, loadMessages, sendMessage, clearMessages, deleteConversation, lastError, retryLast, clearError, stopStreaming } =
    useChatStore()
  const { token } = useAuthStore()

  const model = currentSession?.model ?? MODELS[0].value
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'menu' | 'memory' | 'features'>('menu')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeNav, setActiveNav] = useState('chats')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [_debugOpenMsgId, _setDebugOpenMsgId] = useState<string | null>(null)
  const [sheetDebugInfo, setSheetDebugInfo] = useState<import('../api/chat').DebugInfo | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const userScrolledUpRef = useRef(false)
  const mainRef = useRef<HTMLElement>(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const swipeStartX = useRef<number | null>(null)
  const swipeStartY = useRef<number | null>(null)

  // ─── Stable callbacks for MessageItem (prevent re-renders) ───
  const handleCopyMsg = useCallback(async (msgId: string, content: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedMsgId(msgId)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopiedMsgId(null), 1500)
  }, [])

  const handleDeleteConv = useCallback(async (conversationId: string) => {
    if (!window.confirm('确定删除这轮对话吗？')) return
    const session = useSessionStore.getState().currentSession
    if (!session) return
    try {
      await deleteConversation(session.id, conversationId)
    } catch {
      setToast('删除失败，请重试')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 1500)
    }
  }, [deleteConversation])

  const handleRetry = useCallback((_msgId: string) => {
    console.log('retry', _msgId)
  }, [])

  // Window-level swipe gesture
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
    if (!isSwiping) return
    e.preventDefault()
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

  // iOS keyboard
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
    if (!isFocused) {
      el.style.height = '22px'
      el.scrollTop = 0
      return
    }
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [input, isFocused])

  // Load sessions on mount
  useEffect(() => { if (token) fetchSessions() }, [token, fetchSessions])

  // Auto-select session from URL param (e.g. from project chapters)
  useEffect(() => {
    if (urlSessionId && sessions.length > 0 && currentSession?.id !== urlSessionId) {
      selectSession(urlSessionId)
    }
  }, [urlSessionId, sessions, currentSession?.id, selectSession])

  // Clean up swipe/rename state
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

  // Scroll to bottom on new messages (reset user scroll state)
  useEffect(() => {
    userScrolledUpRef.current = false
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // During streaming, scroll periodically — but only if user hasn't scrolled up
  useEffect(() => {
    if (!isStreaming) return
    const id = setInterval(() => {
      if (!userScrolledUpRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }, 300)
    return () => clearInterval(id)
  }, [isStreaming])

  // Track user scroll: if they scroll up, pause auto-scroll
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    function onScroll() {
      if (!el) return
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUpRef.current = distFromBottom > 150
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Restore focus after streaming
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
    if (sceneKey === 'study') { navigate('/study'); return }
    if (sceneKey === 'errors') { navigate('/errors'); return }
    const session = await createSession(sceneKey, model)
    if (sceneKey === 'reading' && session) {
      navigate(`/read/${session.id}`)
    }
  }

  // @ts-ignore unused — kept for future welcome scene feature
  async function handleWelcomeScene(sceneKey: string) {
    if (sceneKey === 'study') { navigate('/study'); return }
    if (sceneKey === 'errors') { navigate('/errors'); return }
    if (currentSession) {
      if (sceneKey === 'reading') {
        const session = await createSession(sceneKey, model)
        if (session) navigate(`/read/${session.id}`)
        return
      }
      await updateSessionAPI(currentSession.id, { scene_type: sceneKey })
      await fetchSessions()
      selectSession(currentSession.id)
    } else {
      const session = await createSession(sceneKey, model)
      if (sceneKey === 'reading' && session) {
        navigate(`/read/${session.id}`)
      }
    }
  }

  function isClaudeModel(m: string): boolean {
    const lower = m.toLowerCase()
    return CLAUDE_MODELS.some(k => lower.includes(k))
  }

  function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return
    if (!isClaudeModel(model)) {
      setToast('当前模型不支持文件上传，请切换到 Claude')
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 2500)
      return
    }
    const newAttachments: PendingAttachment[] = []
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        setToast(`${file.name} 超过 5MB 限制`)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 2500)
        continue
      }
      if (attachments.length + newAttachments.length >= 3) {
        setToast('最多 3 个附件')
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 2500)
        break
      }
      const att: PendingAttachment = { file }
      if (file.type.startsWith('image/')) {
        att.preview = URL.createObjectURL(file)
      }
      newAttachments.push(att)
    }
    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments])
    }
  }

  function removeAttachment(index: number) {
    setAttachments(prev => {
      const removed = prev[index]
      if (removed.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleSend() {
    const text = input.trim()
    if ((!text && attachments.length === 0) || isStreaming || !currentSession) return

    // 有附件时先上传
    let attachmentIds: string[] = []
    if (attachments.length > 0) {
      setIsUploading(true)
      try {
        const results = await Promise.all(
          attachments.map(att => uploadAttachment(att.file, currentSession.id))
        )
        attachmentIds = results.map(r => r.id)
      } catch (err) {
        setIsUploading(false)
        setToast(err instanceof Error ? err.message : '文件上传失败')
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 2500)
        return
      }
      setIsUploading(false)
    }

    // 构建附件信息用于消息气泡显示
    const msgAttachments: MessageAttachment[] = attachments.map((att, i) => ({
      id: attachmentIds[i] ?? '',
      file_type: att.file.type.startsWith('image/') ? 'image' as const
        : att.file.type === 'application/pdf' ? 'pdf' as const
        : 'text' as const,
      mime_type: att.file.type,
      original_filename: att.file.name,
      file_size: att.file.size,
      preview: att.preview, // 图片本地预览 URL，保留给气泡渲染
    }))

    setAttachments([])
    setInput('')

    const options = {
      ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      ...(msgAttachments.length > 0 ? { attachments: msgAttachments } : {}),
    }
    await sendMessage(currentSession.id, model, text || '(附件)', Object.keys(options).length > 0 ? options : undefined)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showWelcome = !isStreaming && !isLoadingMessages && (!Array.isArray(messages) || messages.length === 0)

  return (
    <div className="flex overflow-hidden" style={{ background: C.bg, height: '100%', overscrollBehavior: 'none' }}>

      {/* ── Sidebar overlay ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(50,42,34,0.25)',
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          }}
          className="md:hidden"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className="fixed inset-y-0 left-0 z-210 flex flex-col flex-shrink-0 transition-transform duration-350 ease-out md:relative md:translate-x-0"
        style={{
          width: '100%',
          maxWidth: 360,
          height: '100%',
          background: C.sidebarBg,
          color: C.text,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          boxShadow: sidebarOpen ? '8px 0 40px rgba(100,80,50,0.1)' : 'none',
          zIndex: 210,
        }}
      >
        <style>{`
          @media (min-width: 768px) {
            aside { width: 260px !important; max-width: 260px !important; transform: translateX(0) !important; position: relative !important; }
          }
        `}</style>

        {/* Sidebar top */}
        <div className="px-5 py-4" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex md:hidden items-center justify-center rounded-md cursor-pointer"
              style={{ width: 32, height: 32, color: C.textSecondary }}
            >
              <X size={18} strokeWidth={2} />
            </button>

            <span className="text-sm font-bold select-none" style={{ letterSpacing: '0.18em', color: C.accent }}>
              REVERIE
            </span>

            <button
              onClick={() => { handleCreateWithScene('daily'); setSidebarOpen(false) }}
              className="flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer"
              style={{ width: 32, height: 32, color: C.textSecondary }}
              title="新对话"
            >
              <Plus size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Navigation tabs */}
        <div style={{ padding: '4px 10px 12px' }}>
          {NAV_ITEMS.map(n => {
            const act = activeNav === n.key
            return (
              <button
                key={n.key}
                onClick={() => {
                  if (!n.enabled) return
                  setActiveNav(n.key)
                  if (n.key === 'reading') {
                    setSidebarOpen(false)
                    navigate('/bookshelf')
                  } else if (n.key === 'graph') {
                    setSidebarOpen(false)
                    // TODO: navigate to graph page
                  } else if (n.key === 'scripts') {
                    setSidebarOpen(false)
                    navigate('/projects')
                  }
                }}
                className="w-full flex items-center gap-3 transition-all duration-150"
                style={{
                  padding: '10px 12px', borderRadius: 10, border: 'none',
                  background: act ? C.sidebarActive : 'transparent',
                  color: n.enabled ? (act ? C.text : C.textSecondary) : '#d0c8c0',
                  fontSize: 14, fontWeight: act ? 600 : 400,
                  cursor: n.enabled ? 'pointer' : 'default',
                  opacity: n.enabled ? 1 : 0.4, position: 'relative',
                  textAlign: 'left' as const, marginBottom: 1,
                }}
              >
                {act && <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, borderRadius: 2, background: C.accent }} />}
                <span style={{ display: 'flex', opacity: act ? 0.85 : 0.5 }}><NavIcon type={n.key} /></span>
                <span style={{ flex: 1 }}>{n.label}</span>
                {n.badge && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: C.accent + '14', color: C.accent, fontWeight: 600 }}>{n.badge}</span>}
              </button>
            )
          })}
        </div>

        <div style={{ height: 1, background: C.border, margin: '0 18px' }} />

        {/* Search — below nav tabs */}
        <div style={{ padding: '12px 14px 6px' }}>
          <div className="flex items-center gap-2" style={{ padding: '7px 11px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input placeholder="搜索..." className="flex-1 border-none outline-none bg-transparent" style={{ color: C.text, fontSize: 13 }} />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-2" style={{ scrollbarWidth: 'none' }}>
          {loading && !sessions.length && (
            <p className="px-3 py-4 text-sm" style={{ color: C.textMuted }}>
              Loading…
            </p>
          )}
          {GROUPS.map(({ key, label }) => {
            const items = sessions.filter(s => getGroup(s.created_at) === key && s.scene_type !== 'reading')
            if (!items.length) return null
            return (
              <div key={key} className="mb-2">
                <p
                  className="px-3 pt-3 pb-1.5 select-none"
                  style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: '0.03em' }}
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
                      className="relative mb-1 rounded-xl select-none"
                      style={{ overflow: 'hidden' }}
                    >
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
                            style={{ background: C.surfaceSolid, color: C.textSecondary }}
                            onClick={e => { e.stopPropagation(); setSwipedId(null); setRenameModal({ id: session.id, title: session.title || '' }) }}
                            onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setSwipedId(null); setRenameModal({ id: session.id, title: session.title || '' }) }}
                          >
                            重命名
                          </button>
                          <button
                            className="flex-1 flex items-center justify-center text-xs cursor-pointer"
                            style={{ background: C.errorBg, color: C.errorText }}
                            onClick={e => { e.stopPropagation(); setSwipedId(null); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}
                            onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setSwipedId(null); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}
                          >
                            删除
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          if (isSwiped) { setSwipedId(null); return }
                          if (session.scene_type === 'reading') {
                            navigate(`/read/${session.id}`)
                            setSidebarOpen(false)
                            return
                          }
                          selectSession(session.id); setSidebarOpen(false)
                        }}
                        onMouseEnter={() => setHoveredId(session.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onTouchStart={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchStart(e, session.id) }}
                        onTouchMove={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchMove(e) }}
                        onTouchEnd={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchEnd(e) }}
                        className="relative w-full text-left rounded-xl px-4 py-3.5 transition-colors duration-150 cursor-pointer"
                        style={{
                          background: isActive ? C.sidebarActive : isHovered ? 'rgba(160,120,90,0.04)' : 'transparent',
                          color: C.text,
                          transform: isSwiped ? 'translateX(-130px)' : 'translateX(0)',
                          transition: 'transform 0.25s ease',
                        }}
                      >
                        {isActive && (
                          <div style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, borderRadius: 2, background: C.accent }} />
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <p
                            className="text-sm leading-snug"
                            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400, color: C.text }}
                            onDoubleClick={e => { e.stopPropagation(); setRenameModal({ id: session.id, title: session.title || '' }) }}
                          >
                            {session.title || 'New Chat'}
                          </p>
                          <span className="flex-shrink-0" style={{ color: C.metaText, fontSize: 11 }}>
                            {formatSessionTime(session.updated_at)}
                          </span>
                        </div>
                        {isHovered && (
                          <span
                            role="button"
                            onClick={e => { e.stopPropagation(); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}
                            className="absolute right-2 top-1/2 hidden md:flex items-center justify-center rounded cursor-pointer"
                            style={{ width: 18, height: 18, transform: 'translateY(-50%)', color: C.textMuted }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.errorText)}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}
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
            <div className="fixed inset-0 z-50" style={{ background: 'rgba(50,42,34,0.5)' }} onClick={() => { setRenameModal(null); setSwipedId(null) }} onTouchStart={e => e.nativeEvent.stopImmediatePropagation()} onTouchEnd={e => { e.nativeEvent.stopImmediatePropagation(); e.preventDefault(); setRenameModal(null); setSwipedId(null) }} />
            <div
              className="fixed z-50 rounded-2xl shadow-xl"
              onClick={e => e.stopPropagation()}
              onTouchStart={e => e.nativeEvent.stopImmediatePropagation()}
              onTouchMove={e => e.nativeEvent.stopImmediatePropagation()}
              onTouchEnd={e => e.nativeEvent.stopImmediatePropagation()}
              style={{
                left: '50%', top: '40%', transform: 'translate(-50%, -50%)',
                width: 280, background: C.bg,
                border: `1px solid ${C.borderStrong}`, padding: '20px',
              }}
            >
              <p className="text-sm mb-3 font-medium" style={{ color: C.text }}>重命名对话</p>
              <input
                autoFocus
                value={renameModal.title}
                onChange={e => setRenameModal({ ...renameModal, title: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') { setRenameModal(null); setSwipedId(null) } }}
                placeholder="输入新名称…"
                className="w-full text-sm outline-none rounded-xl px-3 py-2"
                style={{ background: C.surface, color: C.text, border: `1px solid ${C.borderStrong}` }}
              />
              <div className="flex gap-2 mt-4 justify-end">
                <button
                  className="px-4 py-1.5 rounded-lg text-sm cursor-pointer"
                  style={{ color: C.textSecondary, background: 'transparent' }}
                  onClick={() => { setRenameModal(null); setSwipedId(null) }}
                  onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setRenameModal(null); setSwipedId(null) }}
                >取消</button>
                <button
                  className="px-4 py-1.5 rounded-lg text-sm cursor-pointer"
                  style={{ background: C.accent, color: '#fff' }}
                  onClick={doRename}
                  onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); doRename() }}
                >确认</button>
              </div>
            </div>
          </>
        )}

        {/* Sidebar bottom */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-between px-5 py-3">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2.5 text-sm transition-colors duration-150 cursor-pointer"
              style={{ color: C.textSecondary }}
            >
              <Settings size={15} strokeWidth={1.6} />
              <span>设置</span>
            </button>
            <span className="text-xs" style={{ color: C.metaText }}>v3.0</span>
          </div>
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
      <div className="flex flex-col flex-1 min-w-0 h-full" style={{ background: C.bgGradient }}>

        {/* Top bar */}
        <header
          className="chat-header flex items-center justify-between flex-shrink-0 px-3.5"
          style={{
            height: 54,
            paddingTop: 'env(safe-area-inset-top)',
            background: C.glass,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            borderBottom: `1px solid ${C.border}`,
            position: 'relative',
            zIndex: 30,
          }}
        >
          <button
            className="flex md:hidden items-center justify-center rounded-md cursor-pointer"
            style={{ width: 32, height: 32, color: C.textSecondary, padding: 6 }}
            onClick={() => { setSidebarOpen(true) }}
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>
          <div className="hidden md:block" style={{ width: 32 }} />

          {/* Center: model selector */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              onClick={() => setShowModelDropdown(o => !o)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full cursor-pointer transition-all duration-200"
              style={{
                background: showModelDropdown ? C.surface : 'transparent',
                border: `1px solid ${showModelDropdown ? C.borderStrong : 'transparent'}`,
              }}
            >
              <span
                className="rounded-full flex-shrink-0"
                style={{ width: 6, height: 6, background: getModelColor(model), boxShadow: `0 0 6px ${getModelColor(model)}40` }}
              />
              <span className="text-sm font-semibold" style={{ color: C.text }}>
                {MODELS.find(m => m.value === model)?.label ?? model}
              </span>
              <span style={{ display: 'inline-flex', transform: showModelDropdown ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.25s', color: C.textMuted }}>
                <ChevronDown size={12} strokeWidth={2.5} />
              </span>
            </button>

            {showModelDropdown && (
              <div
                className="absolute top-12 left-1/2 rounded-2xl overflow-hidden"
                style={{
                  transform: 'translateX(-50%)',
                  minWidth: 260,
                  background: 'rgba(255,252,248,0.72)',
                  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                  border: `1px solid ${C.border}`,
                  boxShadow: '0 12px 48px rgba(100,80,50,0.14)',
                  zIndex: 51,
                }}
              >
                <div style={{ padding: '12px 14px 6px', fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.05em' }}>选择模型</div>
                {MODELS.map(m => {
                  const isActive = m.value === model
                  return (
                    <div
                      key={m.value}
                      onClick={() => { handleModelChange(m.value); setShowModelDropdown(false) }}
                      className="flex items-center gap-3 cursor-pointer transition-colors"
                      style={{
                        padding: '12px 14px',
                        background: isActive ? C.sidebarActive : 'transparent',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(160,120,90,0.04)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span
                        className="rounded-full flex-shrink-0"
                        style={{ width: 8, height: 8, background: getModelColor(m.value), boxShadow: isActive ? `0 0 8px ${getModelColor(m.value)}60` : 'none' }}
                      />
                      <span className="text-sm" style={{ fontWeight: isActive ? 700 : 500, color: isActive ? C.text : C.textSecondary }}>
                        {m.label}
                      </span>
                      {isActive && (
                        <span style={{ marginLeft: 'auto', color: C.accent }}>
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        </span>
                      )}
                    </div>
                  )
                })}
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
            style={{ width: 32, height: 32, color: C.textSecondary, padding: 6 }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textSecondary)}
            title="New chat"
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        </header>

        {/* Messages */}
        <main ref={mainRef} className="flex-1 overflow-y-auto flex flex-col" style={{ WebkitOverflowScrolling: 'touch' }}>
          {showWelcome ? (
          <WelcomeScreen />
          ) : (
            <div className="mx-auto w-full px-4 md:px-6 pt-5" style={{ maxWidth: 720, paddingBottom: 16 }}>

              {/* Completed messages — each item is memo'd */}
              {Array.isArray(messages) && messages.map(msg => (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  modelLabel={msg.role === 'assistant' ? (MODELS.find(m => m.value === model)?.label ?? model) : undefined}
                  isDebugOpen={_debugOpenMsgId === msg.id}
                  isCopied={copiedMsgId === msg.id}
                  onToggleDebug={() => {
                    if (msg.debugInfo) setSheetDebugInfo(msg.debugInfo)
                  }}
                  onCopy={handleCopyMsg}
                  onDelete={handleDeleteConv}
                  onRetry={handleRetry}
                />
              ))}

              {/* Error / retry block */}
              {lastError && !isStreaming && (
                <div className="flex gap-2.5 mb-6">
                  <div
                    className="flex-shrink-0 flex items-center justify-center select-none rounded-full"
                    style={{ width: 34, height: 34, background: C.errorBg, border: `1px solid ${C.errorBorder}`, fontSize: 14 }}
                  >
                    ⚠
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold mb-1.5" style={{ color: C.errorText }}>发送失败</div>
                    <div
                      className="rounded-2xl px-4 py-3"
                      style={{ background: C.errorBg, border: `1px solid ${C.errorBorder}` }}
                    >
                      <span className="text-sm" style={{ color: C.errorText }}>{lastError}</span>
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={() => retryLast(currentSession!.id, model)}
                          className="px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                          style={{ background: 'transparent', border: `1px solid ${C.errorBorder}`, color: C.errorText }}
                        >
                          重新发送
                        </button>
                        <button
                          onClick={clearError}
                          className="flex items-center justify-center cursor-pointer"
                          style={{ color: C.textMuted }}
                          title="忽略"
                        >
                          <X size={16} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live streaming — isolated component */}
              <StreamingMessage />

              <div ref={messagesEndRef} />
            </div>
          )}

        </main>

        {/* Input area — outside main, always at bottom */}
        <div className="flex-shrink-0" style={{
            background: C.glass,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            borderTop: `1px solid ${C.border}`,
            paddingBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 'max(10px, env(safe-area-inset-bottom))',
          }}>
            <div className="mx-auto px-4 md:px-6 py-2 relative" style={{ maxWidth: 720 }}>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                multiple
                className="hidden"
                onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }}
              />

              {/* Attachment preview */}
              {attachments.length > 0 && (
                <div className="flex gap-2 mb-2 px-1 flex-wrap">
                  {attachments.map((att, i) => (
                    <div
                      key={i}
                      className="relative group rounded-lg overflow-hidden flex items-center gap-2"
                      style={{
                        background: C.surfaceSolid,
                        border: `1px solid ${C.border}`,
                        ...(att.preview ? { width: 64, height: 64 } : { padding: '6px 10px' }),
                      }}
                    >
                      {att.preview ? (
                        <img src={att.preview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <>
                          {att.file.type === 'application/pdf' ? (
                            <FileText size={14} style={{ color: '#e74c3c', flexShrink: 0 }} />
                          ) : (
                            <FileIcon size={14} style={{ color: C.textSecondary, flexShrink: 0 }} />
                          )}
                          <span className="text-xs truncate" style={{ color: C.textSecondary, maxWidth: 120 }}>
                            {att.file.name}
                          </span>
                        </>
                      )}
                      <button
                        onClick={() => removeAttachment(i)}
                        className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ width: 18, height: 18, background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                      >
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                className="flex items-end gap-2.5 px-3.5 py-2.5 transition-all duration-300"
                style={{
                  borderRadius: isFocused ? 22 : 26,
                  background: C.inputBg,
                  border: `1px solid ${isFocused ? C.borderStrong : C.border}`,
                  boxShadow: isFocused ? '0 4px 24px rgba(160,120,90,0.08)' : 'none',
                }}
              >
                {/* Attach button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || isUploading || !currentSession}
                  className="flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ width: 30, height: 30, color: C.textMuted }}
                  onMouseEnter={e => { if (!isStreaming) e.currentTarget.style.color = C.accent }}
                  onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}
                  title="上传文件"
                >
                  <Paperclip size={16} strokeWidth={1.8} />
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  disabled={isStreaming || !currentSession}
                  placeholder="说点什么..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed disabled:opacity-40"
                  style={{ color: C.text, minHeight: 24, maxHeight: 120, overflowY: 'auto', scrollbarWidth: 'none' }}
                />
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer"
                    style={{ width: 32, height: 32, flexShrink: 0, background: C.text, color: '#fff' }}
                    title="停止生成"
                  >
                    <Square size={10} strokeWidth={0} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={isUploading || (!input.trim() && attachments.length === 0) || !currentSession}
                    className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-300 disabled:cursor-not-allowed"
                    style={{
                      width: 32, height: 32, flexShrink: 0,
                      background: (input.trim() || attachments.length > 0) && !isUploading ? C.accentGradient : C.surface,
                      color: (input.trim() || attachments.length > 0) && !isUploading ? '#fff' : C.textMuted,
                      boxShadow: (input.trim() || attachments.length > 0) && !isUploading ? '0 4px 20px rgba(160,120,90,0.08)' : 'none',
                    }}
                  >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} strokeWidth={2.5} />}
                  </button>
                )}
              </div>
            </div>
          </div>

        {/* Artifact Panel */}
        <ArtifactPanel />

        {/* Memory Sheet */}
        {sheetDebugInfo && (
          <MemorySheetPanel
            debugInfo={sheetDebugInfo}
            open={true}
            onClose={() => setSheetDebugInfo(null)}
          />
        )}

        {/* Toast */}
        {toast && (
          <div
            className="fixed z-50 rounded-xl px-4 py-2.5 text-sm pointer-events-none"
            style={{
              bottom: 100, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(51,42,34,0.85)', color: '#fff',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {toast}
          </div>
        )}

      </div>

    </div>
  )
}
