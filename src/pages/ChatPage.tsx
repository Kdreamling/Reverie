import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { Plus, Settings, ArrowUp, ChevronDown, X, Menu, Paperclip, FileText, File as FileIcon, Loader2, Square, BookOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
import StudyPanel from '../components/StudyPanel'

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

function getModelColor(value: string): string {
  const v = value.toLowerCase()
  if (v.includes('claude') || v.includes('opus') || v.includes('sonnet')) return '#002FA7'
  if (v.includes('deepseek')) return '#22c55e'
  return '#f59e0b'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  const navigate = useNavigate()
  const { sessions, currentSession, loading, fetchSessions, createSession, selectSession, deleteSession, updateSessionModel } =
    useSessionStore()
  const { messages, isStreaming, loadMessages, sendMessage, clearMessages, deleteConversation, lastError, retryLast, clearError, stopStreaming } =
    useChatStore()
  const { token } = useAuthStore()

  const model = currentSession?.model ?? MODELS[0].value
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'menu' | 'memory' | 'features'>('menu')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [debugOpenMsgId, setDebugOpenMsgId] = useState<string | null>(null)
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
  const [showStudyPanel, setShowStudyPanel] = useState(false)
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
    const session = await createSession(sceneKey, model)
    if (sceneKey === 'reading' && session) {
      navigate(`/read/${session.id}`)
    }
  }

  async function handleWelcomeScene(sceneKey: string) {
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
    <div className="flex overflow-hidden" style={{ background: '#fafbfd', height: '100%', overscrollBehavior: 'none' }}>

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed inset-0 z-40
          md:relative md:inset-auto md:z-auto
          flex flex-col flex-shrink-0
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full md:translate-x-0 opacity-0 md:opacity-100'}
        `}
        style={{
          width: undefined,  // 手机端全屏，由 inset-0 控制
          height: '100%',
          background: '#fafbfd',  // 手机端浅色
          color: '#1a1f2e',       // 手机端深色文字
        }}
        // 桌面端通过内联类覆盖：md 断点下恢复 260px 深蓝
      >
        {/* 桌面端覆盖样式（通过隐藏的 style 标签注入） */}
        <style>{`
          @media (min-width: 768px) {
            aside { width: 260px !important; background: #0a1a3a !important; color: #c8d4e8 !important; }
          }
        `}</style>

        {/* Sidebar top */}
        <div className="px-5 py-4 md:px-4" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
          <div className="flex items-center justify-between">
            {/* 手机端：关闭按钮 */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex md:hidden items-center justify-center rounded-md cursor-pointer"
              style={{ width: 32, height: 32, color: '#7a8399' }}
            >
              <X size={18} strokeWidth={1.8} />
            </button>

            <span className="text-sm font-medium select-none" style={{ letterSpacing: '0.15em' }}>
              <span className="hidden md:inline" style={{ color: '#c8d4e8' }}>✦ REVERIE</span>
              <span className="md:hidden" style={{ color: '#1a1f2e' }}>REVERIE</span>
            </span>

            <button
              onClick={() => setShowSceneSelect(s => !s)}
              className="flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer"
              style={{ width: 32, height: 32 }}
            >
              <Plus size={16} strokeWidth={1.8} />
            </button>
          </div>

          {showSceneSelect && (
            <div ref={sceneRef} className="grid grid-cols-4 md:grid-cols-2 gap-2 mt-3">
              {SCENES.map(s => {
                const defaultScene = currentSession?.scene_type || 'daily'
                const isDefault = s.key === defaultScene
                return (
                  <button
                    key={s.key}
                    onClick={() => handleCreateWithScene(s.key)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl md:rounded-lg transition-colors duration-150 cursor-pointer"
                    style={{
                      background: isDefault ? 'rgba(0,47,167,0.08)' : 'rgba(0,0,0,0.02)',
                      border: isDefault ? '1px solid rgba(0,47,167,0.25)' : '1px solid #e8ecf5',
                      color: isDefault ? '#002FA7' : '#7a8399',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{s.icon}</span>
                    <span className="text-xs font-medium">{s.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Session list */}
        <nav className="flex-1 overflow-y-auto px-3 md:px-2 pb-2" style={{ scrollbarWidth: 'none' }}>
          {loading && !sessions.length && (
            <p className="px-3 py-4 text-sm md:text-xs" style={{ color: '#9aa3b8' }}>
              Loading…
            </p>
          )}
          {GROUPS.map(({ key, label }) => {
            const items = sessions.filter(s => getGroup(s.created_at) === key)
            if (!items.length) return null
            return (
              <div key={key} className="mb-4">
                <p
                  className="px-2 pb-2 uppercase tracking-wider select-none text-xs md:text-xs"
                  style={{ color: '#9aa3b8', fontSize: undefined }}
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
                            style={{ background: '#e8ecf5', color: '#5a6a8a' }}
                            onClick={e => { e.stopPropagation(); setSwipedId(null); setRenameModal({ id: session.id, title: session.title || '' }) }}
                            onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setSwipedId(null); setRenameModal({ id: session.id, title: session.title || '' }) }}
                          >
                            重命名
                          </button>
                          <button
                            className="flex-1 flex items-center justify-center text-xs cursor-pointer"
                            style={{ background: '#f0e0e0', color: '#c05050' }}
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
                        className="relative w-full text-left rounded-xl md:rounded-md px-4 py-3.5 md:px-3 md:py-2.5 transition-colors duration-150 cursor-pointer"
                        style={{
                          background: isActive ? 'rgba(0,47,167,0.08)' : isHovered ? 'rgba(0,0,0,0.02)' : 'transparent',
                          borderLeft: isActive ? '3px solid #002FA7' : '3px solid transparent',
                          color: isActive ? '#002FA7' : '#1a1f2e',
                          transform: isSwiped ? 'translateX(-130px)' : 'translateX(0)',
                          transition: 'transform 0.25s ease',
                        }}
                      >
                        {/* 桌面端覆盖颜色 */}
                        <style>{`
                          @media (min-width: 768px) {
                            .session-item-active { background: rgba(0,47,167,0.3) !important; color: #e8edf8 !important; }
                            .session-item { color: #c8d4e8 !important; }
                            .session-item:hover { background: rgba(255,255,255,0.05) !important; }
                          }
                        `}</style>
                        <p
                          className="text-sm md:text-xs leading-snug font-medium md:font-normal"
                          style={{ paddingRight: 32, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onDoubleClick={e => { e.stopPropagation(); setRenameModal({ id: session.id, title: session.title || '' }) }}
                        >
                          {session.title || 'New Chat'}
                        </p>
                        <p
                          className="text-xs mt-1 md:mt-0.5"
                          style={{ color: '#9aa3b8', fontSize: 12 }}
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

        {/* Sidebar bottom */}
        <div style={{ borderTop: '1px solid #e8ecf5', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <style>{`@media (min-width: 768px) { .sidebar-bottom { border-color: rgba(255,255,255,0.07) !important; background: #0a1a3a !important; } }`}</style>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2.5 w-full px-5 md:px-4 py-4 text-sm transition-colors duration-150 cursor-pointer"
            style={{ color: '#7a8399' }}
          >
            <Settings size={15} strokeWidth={1.6} />
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
        <main ref={mainRef} className="flex-1 overflow-y-auto flex flex-col">
          {showWelcome ? (
          <WelcomeScreen onSelectScene={handleWelcomeScene} currentScene={currentSession?.scene_type || 'daily'} />
          ) : (
            <div className="mx-auto w-full px-3 md:px-6 pt-8" style={{ maxWidth: 800, paddingBottom: 16 }}>

              {/* Completed messages — each item is memo'd */}
              {Array.isArray(messages) && messages.map(msg => (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  isDebugOpen={debugOpenMsgId === msg.id}
                  isCopied={copiedMsgId === msg.id}
                  onToggleDebug={() => setDebugOpenMsgId(debugOpenMsgId === msg.id ? null : msg.id)}
                  onCopy={handleCopyMsg}
                  onDelete={handleDeleteConv}
                  onRetry={handleRetry}
                />
              ))}

              {/* Error / retry block */}
              {lastError && !isStreaming && (
                <div className="flex gap-3 mb-6">
                  <div
                    className="flex-shrink-0 flex items-center justify-center select-none"
                    style={{ width: 28, height: 28, color: '#002FA7', fontSize: 16, lineHeight: 1 }}
                  >
                    ✦
                  </div>
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

              {/* Live streaming — isolated component */}
              <StreamingMessage />

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Sticky input */}
          <div style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
            marginTop: 'auto',
            background: '#f2f4fa',
            paddingBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 'max(8px, env(safe-area-inset-bottom))',
          }}>
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
                        background: '#f0f2f8',
                        border: '1px solid #e2e6f0',
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
                            <FileIcon size={14} style={{ color: '#7a8399', flexShrink: 0 }} />
                          )}
                          <span className="text-xs truncate" style={{ color: '#5a6a8a', maxWidth: 120 }}>
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

              {/* Study Panel */}
              {showStudyPanel && currentSession && (
                <StudyPanel
                  onGenerate={(prompt) => {
                    setShowStudyPanel(false)
                    setInput(prompt)
                  }}
                  onClose={() => setShowStudyPanel(false)}
                />
              )}

              <div
                className={`flex gap-3 px-4 transition-all duration-200 ${isFocused || input || attachments.length > 0 ? 'rounded-2xl items-end py-3' : 'rounded-full items-center py-2.5'}`}
                style={{
                  background: '#fff',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                  border: '1px solid rgba(0,0,0,0.07)',
                }}
              >
                {/* Attach button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || isUploading || !currentSession}
                  className="flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ width: 30, height: 30, color: '#7a8399' }}
                  onMouseEnter={e => { if (!isStreaming) e.currentTarget.style.color = '#002FA7' }}
                  onMouseLeave={e => (e.currentTarget.style.color = '#7a8399')}
                  title="上传文件"
                >
                  <Paperclip size={16} strokeWidth={1.8} />
                </button>
                {/* Study mode button */}
                <button
                  onClick={() => setShowStudyPanel(s => !s)}
                  disabled={isStreaming || !currentSession}
                  className="flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ width: 30, height: 30, color: showStudyPanel ? '#002FA7' : '#7a8399' }}
                  onMouseEnter={e => { if (!isStreaming) e.currentTarget.style.color = '#002FA7' }}
                  onMouseLeave={e => { if (!showStudyPanel) e.currentTarget.style.color = '#7a8399' }}
                  title="英语练习"
                >
                  <BookOpen size={16} strokeWidth={1.8} />
                </button>
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
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer"
                    style={{ width: 30, height: 30, flexShrink: 0, background: '#1a1f2e', color: '#fff' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#1a1f2e')}
                    title="停止生成"
                  >
                    <Square size={10} strokeWidth={0} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={isUploading || (!input.trim() && attachments.length === 0) || !currentSession}
                    className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed"
                    style={{
                      width: 30, height: 30, flexShrink: 0,
                      background: (input.trim() || attachments.length > 0) && !isUploading ? '#002FA7' : '#e8ecf5',
                      color: (input.trim() || attachments.length > 0) && !isUploading ? '#fff' : '#aab2c8',
                    }}
                    onMouseEnter={e => { if ((input.trim() || attachments.length > 0) && !isUploading) e.currentTarget.style.background = '#001f80' }}
                    onMouseLeave={e => { if ((input.trim() || attachments.length > 0) && !isUploading) e.currentTarget.style.background = '#002FA7' }}
                  >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} strokeWidth={2.5} />}
                  </button>
                )}
              </div>
              <p className="hidden md:block text-center text-xs mt-2" style={{ color: '#aab2c8' }}>
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </main>

        {/* Artifact Panel */}
        <ArtifactPanel />

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
