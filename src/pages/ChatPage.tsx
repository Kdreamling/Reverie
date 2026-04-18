import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { Plus, Settings, ArrowUp, ChevronDown, X, Menu, Paperclip, FileText, File as FileIcon, Loader2, Square, MapPin, Image } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSessionStore, getGroup, formatSessionTime, type Group } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { updateSessionAPI } from '../api/sessions'
import { uploadAttachment, type AttachmentInfo } from '../api/attachments'
import type { MessageAttachment, DreamEvent } from '../api/chat'
import { fetchDreamEvents } from '../api/chat'
import { fetchSelectableModels, sceneTypeToScene, type SelectableModel } from '../api/models'
import SettingsPanel from '../components/SettingsPanel'
import EventBubble from '../components/EventBubble'
import MessageItem from '../components/MessageItem'
import StreamingMessage from '../components/StreamingMessage'
import ArtifactPanel from '../components/artifact/ArtifactPanel'
import MemorySheetPanel from '../components/MemorySheetPanel'
import PushNotification from '../components/PushNotification'
import { C, getModelColor } from '../theme'

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUPS: { key: Group; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'previous', label: '更早' },
]

// 模型清单从后端动态拉取（gateway_models 表），不再硬编码
// MODELS 作为 fallback 保底，仅在后端请求失败时使用
const FALLBACK_MODELS: { value: string; label: string }[] = [
  { value: '[按量]claude-opus-4-6-thinking', label: 'Claude Opus 4.6' },
]

const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.docx,.doc,.xlsx,.xls'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const CLAUDE_MODELS = ['claude', 'opus', 'sonnet', 'dzzi', '按量', 'xianyu', 'guagua']

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
    <div className="flex flex-col items-center justify-center flex-1 gap-4 select-none" style={{ paddingBottom: 80, minHeight: '60vh' }}>
      <div style={{
        fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
        fontSize: 48,
        fontWeight: 400,
        letterSpacing: '0.2em',
        color: C.accent,
        opacity: 0.7,
      }}>
        REVERIE
      </div>
      <div style={{ width: 1, height: 48, background: `linear-gradient(to bottom, ${C.accent}, transparent)`, opacity: 0.4 }} />
      <p style={{
        fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
        fontSize: 17,
        fontStyle: 'italic',
        color: C.textMuted,
        fontWeight: 400,
        letterSpacing: '0.03em',
        lineHeight: 1.8,
        maxWidth: 360,
        textAlign: 'center',
      }}>
        {greeting}
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatPage() {
  const navigate = useNavigate()
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()
  const [searchParams] = useSearchParams()
  const fromCalendar = searchParams.get('from') === 'calendar'
  const { sessions, currentSession, loading, fetchSessions, ensureTodaySession, createSession, selectSession, deleteSession, updateSessionModel } =
    useSessionStore()
  const { messages, isStreaming, sessionEnded: streamSessionEnded, loadMessages, sendMessage, clearMessages, deleteConversation, lastError, retryLast, clearError, stopStreaming } =
    useChatStore()
  const { token } = useAuthStore()

  // 动态拉取可选模型（scene_tags 过滤）—— 替代旧 MODELS 常量
  const [models, setModels] = useState<SelectableModel[]>(FALLBACK_MODELS.map(m => ({
    value: m.value, label: m.label, name: m.value, channel: '', channel_tag: null,
  })))
  const currentScene = sceneTypeToScene(currentSession?.scene_type)
  useEffect(() => {
    let cancelled = false
    fetchSelectableModels(currentScene).then(list => {
      if (cancelled || list.length === 0) return
      setModels(list)
    })
    return () => { cancelled = true }
  }, [currentScene])

  const model = currentSession?.model ?? models[0]?.value ?? FALLBACK_MODELS[0].value
  const sessionEnded = streamSessionEnded || !!currentSession?.closed_by_ai
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'menu' | 'memory' | 'features' | 'prompt'>('menu')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pcHover, setPcHover] = useState(false)
  const pcHoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const [isNight, setIsNight] = useState(() => {
    const saved = localStorage.getItem('reverie_night')
    if (saved !== null) return saved === '1'
    const h = new Date().getHours()
    return h >= 20 || h < 6
  })
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
  const [_dreamEvents, _setDreamEvents] = useState<DreamEvent[]>([])
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
  const [locating, setLocating] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const [lockInfo, setLockInfo] = useState<{ chen_locked_dream: any; dream_locked_chen: any } | null>(null)
  const [knockMsg, setKnockMsg] = useState('')
  const [knockSending, setKnockSending] = useState(false)
  const [knockHistory, setKnockHistory] = useState<{ message: string; created_at: string }[]>([])
  const [knockCount, setKnockCount] = useState(0)
  const [lockDismissed, setLockDismissed] = useState(false)
  const maxKnocks = 3

  // Night mode: toggle body class + persist
  useEffect(() => {
    document.body.classList.toggle('night-mode', isNight)
    localStorage.setItem('reverie_night', isNight ? '1' : '0')
    return () => { document.body.classList.remove('night-mode') }
  }, [isNight])

  const toggleNight = useCallback(() => setIsNight(n => !n), [])

  // 检查封锁状态
  useEffect(() => {
    if (!token) return
    const checkLock = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api'}/admin/lock/status?_t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) setLockInfo(await res.json())
      } catch { /* ignore */ }
    }
    checkLock()
    const timer = setInterval(checkLock, 60_000) // 每分钟刷新
    return () => clearInterval(timer)
  }, [token])

  const isLockedByChen = !!lockInfo?.chen_locked_dream
  const dreamLockedChen = !!lockInfo?.dream_locked_chen
  const chenLockId = lockInfo?.chen_locked_dream?.id || ''

  // 锁解除时重新加载 session（清除 closed_by_ai 状态）
  const prevLockedRef = useRef(isLockedByChen)
  useEffect(() => {
    if (prevLockedRef.current && !isLockedByChen) {
      fetchSessions()
    }
    prevLockedRef.current = isLockedByChen
  }, [isLockedByChen, fetchSessions])

  // 被锁时加载敲门历史
  useEffect(() => {
    if (!isLockedByChen || !chenLockId || !token) {
      setKnockHistory([])
      setKnockCount(0)
      return
    }
    const base = import.meta.env.VITE_API_BASE_URL ?? '/api'
    fetch(`${base}/admin/lock/knocks?lock_id=${chenLockId}&_t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.knocks) {
        setKnockHistory(data.knocks)
        setKnockCount(data.knocks.length)
      }
    }).catch(() => {})
  }, [isLockedByChen, chenLockId, token])

  const handleKnock = async () => {
    if (!token || knockSending || knockCount >= maxKnocks) return
    const msg = knockMsg.trim() || '开门嘛~'
    setKnockSending(true)
    try {
      const base = import.meta.env.VITE_API_BASE_URL ?? '/api'
      const res = await fetch(`${base}/admin/lock/knock?_t=${Date.now()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      if (data.success) {
        setKnockHistory(prev => [...prev, { message: msg, created_at: new Date().toISOString() }])
        setKnockCount(data.knock_count)
        setKnockMsg('')
      }
    } catch { /* ignore */ }
    setKnockSending(false)
  }

  const handleToggleDreamLock = async () => {
    if (!token) return
    const base = import.meta.env.VITE_API_BASE_URL ?? '/api'
    try {
      if (dreamLockedChen) {
        // 开门
        await fetch(`${base}/admin/lock/dream?_t=${Date.now()}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      } else {
        // 关门（默认2小时）
        await fetch(`${base}/admin/lock/dream?_t=${Date.now()}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration_minutes: 120, reason: 'Dream 关上了门' }),
        })
      }
      // 刷新状态
      const res = await fetch(`${base}/admin/lock/status?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setLockInfo(await res.json())
    } catch { /* ignore */ }
  }

  function handleShareLocation() {
    if (!navigator.geolocation) {
      setToast('浏览器不支持定位')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords
        // 高德用 经度,纬度 格式
        const locText = `[📍 我的位置: ${longitude.toFixed(6)},${latitude.toFixed(6)}]`
        setInput(prev => prev ? `${prev} ${locText}` : locText)
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        const msgs: Record<number, string> = { 1: '定位权限被拒绝', 2: '无法获取位置', 3: '定位超时' }
        setToast(msgs[err.code] || '定位失败')
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 2500)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ─── Sidebar hover (PC) ───
  const sidebarVisible = sidebarOpen || pcHover
  const handleSidebarMouseEnter = useCallback(() => {
    if (window.innerWidth < 768) return
    clearTimeout(pcHoverTimer.current)
    setPcHover(true)
  }, [])
  const handleSidebarMouseLeave = useCallback(() => {
    if (window.innerWidth < 768) return
    pcHoverTimer.current = setTimeout(() => setPcHover(false), 300)
  }, [])

  // ─── Right-bottom floating tools (PC) ───
  const [toolsHover, setToolsHover] = useState(false)
  const toolsHoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const handleToolsEnter = useCallback(() => {
    if (window.innerWidth < 768) return
    clearTimeout(toolsHoverTimer.current)
    setToolsHover(true)
  }, [])
  const handleToolsLeave = useCallback(() => {
    if (window.innerWidth < 768) return
    toolsHoverTimer.current = setTimeout(() => setToolsHover(false), 300)
  }, [])

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
    // TODO: implement retry
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

  // iOS keyboard — resize #root to visual viewport so flex layout handles everything
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.getElementById('root')
    if (!root) return
    function onResize() {
      root!.style.height = vv!.height + 'px'
      // Pin to visible area (iOS may scroll the layout viewport)
      root!.style.top = vv!.offsetTop + 'px'
      setKeyboardOffset(0) // no longer needed, flex handles it
    }
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
      // Restore on unmount
      root!.style.height = ''
      root!.style.top = ''
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

  // Load sessions on mount + ensure today's daily session exists + subscribe to push
  useEffect(() => {
    if (token) {
      fetchSessions().then(() => {
        if (!urlSessionId) ensureTodaySession()
      })
      // Subscribe to push notifications (async, non-blocking)
      import('../api/pushSubscription').then(m => m.subscribeToPush()).catch(() => {})
    }
  }, [token, fetchSessions, ensureTodaySession, urlSessionId])

  // Auto-select session from URL param (e.g. from project chapters)
  useEffect(() => {
    if (urlSessionId && sessions.length > 0 && currentSession?.id !== urlSessionId) {
      selectSession(urlSessionId)
    }
  }, [urlSessionId, sessions, currentSession?.id, selectSession])

  // Poll Dream events every 30s
  useEffect(() => {
    if (!token) return
    let active = true
    const poll = () => {
      fetchDreamEvents(8).then(evts => { if (active) _setDreamEvents(evts) }).catch(() => {})
    }
    poll()
    const timer = setInterval(poll, 30000)
    return () => { active = false; clearInterval(timer) }
  }, [token])

  // Clean up swipe/rename state
  useEffect(() => {
    if (!sidebarOpen && !pcHover) { setSwipedId(null); setRenameModal(null) }
  }, [sidebarOpen, pcHover])

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

  // Click outside to close plus menu
  useEffect(() => {
    if (!showPlusMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPlusMenu])

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
  // Use RAF + smooth for mobile to avoid 'instant' jump that causes visual jank on iOS
  const prevMsgCountRef = useRef(0)
  useEffect(() => {
    userScrolledUpRef.current = false
    prevMsgCountRef.current = messages.length
    // Defer to next frame so layout (padding-bottom, streaming cleanup) settles first
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }, [messages.length, isStreaming])

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
      if (attachments.length + newAttachments.length >= 10) {
        setToast('最多 10 个附件')
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
    if ((!text && attachments.length === 0) || isStreaming || !currentSession || sessionEnded) return

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

  // Night-aware surface colors
  const nGlass = isNight ? 'rgba(23,20,17,0.92)' : 'rgba(248,244,238,0.92)'
  const nGlassLight = isNight ? 'rgba(23,20,17,0.6)' : 'rgba(248,244,238,0.6)'
  const nGlassHover = isNight ? 'rgba(40,35,28,0.8)' : 'rgba(248,244,238,0.8)'
  const nText = isNight ? '#E0D5C8' : C.text
  const nTextMuted = isNight ? '#9A8A78' : C.textMuted
  const nBorder = isNight ? 'rgba(180,150,120,0.06)' : C.border
  const nAccent = isNight ? '#D4AE8A' : C.accent

  return (
    <div className="overflow-hidden" style={{ height: '100%', overscrollBehavior: 'none', position: 'relative' }}>

      {/* ── Room atmosphere ── */}
      <div className="room-bg" />
      <div className="room-light" />
      <div className="room-texture" />

      {/* ── Push notification banner ── */}
      <PushNotification onTap={() => {
        const todaySession = sessions.find(s => s.scene_type === 'daily')
        if (todaySession) selectSession(todaySession.id)
      }} />

      {/* ── PC edge trigger — hover to reveal sidebar ── */}
      <div
        className="hidden md:block fixed inset-y-0 left-0"
        style={{ width: 16, zIndex: 200 }}
        onMouseEnter={handleSidebarMouseEnter}
      />

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(50,42,34,0.25)',
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          }}
        />
      )}

      {/* ── Sidebar (mobile: drawer, PC: hover) ── */}
      <aside
        className="fixed inset-y-0 left-0 flex flex-col flex-shrink-0"
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        style={{
          width: '100%',
          maxWidth: 'min(300px, 85vw)',
          height: '100%',
          background: isNight ? 'rgba(23,20,17,0.95)' : 'rgba(248,244,238,0.95)',
          backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          color: isNight ? '#E0D5C8' : C.text,
          transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)',
          opacity: sidebarVisible ? 1 : 0,
          boxShadow: sidebarVisible ? '12px 0 60px rgba(0,0,0,0.04)' : 'none',
          transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s cubic-bezier(0.4,0,0.2,1), box-shadow 0.4s',
          zIndex: 210,
          borderRight: `1px solid ${C.border}`,
        }}
      >
        {/* Sidebar top */}
        <div className="px-5 py-4" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setSidebarOpen(false); setPcHover(false) }}
              className="flex items-center justify-center rounded-md cursor-pointer md:hidden"
              style={{ width: 32, height: 32, color: C.textSecondary }}
            >
              <X size={18} strokeWidth={2} />
            </button>

            <span style={{ fontFamily: "'EB Garamond', 'Noto Serif SC', serif", fontSize: 22, fontWeight: 400, color: C.accent, letterSpacing: '0.06em' }}>
              Reverie
            </span>

            <button
              onClick={() => { if (!isLockedByChen) { handleCreateWithScene('daily'); setSidebarOpen(false) } }}
              className="flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer"
              style={{ width: 32, height: 32, color: C.textSecondary, opacity: isLockedByChen ? 0.3 : 1, cursor: isLockedByChen ? 'not-allowed' : 'pointer' }}
              title={isLockedByChen ? "Locked" : "新对话"}
            >
              <Plus size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 14px 6px' }}>
          <div className="flex items-center gap-2" style={{ padding: '9px 14px', borderRadius: 12, background: 'transparent', border: `1px solid ${C.border}` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input placeholder="搜索..." className="flex-1 border-none outline-none bg-transparent" style={{ color: C.text, fontSize: 12.5, fontFamily: "'EB Garamond', 'Noto Serif SC', serif" }} />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-2" style={{ scrollbarWidth: 'none' }}>
          {loading && !sessions.length && (
            <p className="px-3 py-4 text-sm" style={{ color: C.textMuted }}>Loading…</p>
          )}
          {GROUPS.map(({ key, label }) => {
            const items = sessions.filter(s => getGroup(s.created_at) === key && s.scene_type !== 'reading')
            if (!items.length) return null
            return (
              <div key={key} className="mb-2">
                <div className="flex items-center gap-2 px-3 pt-3 pb-1.5 select-none" style={{ color: C.textMuted }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
                </div>
                {items.map(session => {
                  const isActive = session.id === currentSession?.id
                  const isHovered = session.id === hoveredId
                  const isSwiped = session.id === swipedId
                  return (
                    <div key={session.id} className="relative mb-1 rounded-xl select-none" style={{ overflow: 'hidden' }}>
                      {isSwiped && (
                        <div className="absolute right-0 top-0 bottom-0 flex" style={{ width: 130 }}
                          onTouchStart={e => e.nativeEvent.stopImmediatePropagation()}
                          onTouchMove={e => e.nativeEvent.stopImmediatePropagation()}
                          onTouchEnd={e => e.nativeEvent.stopImmediatePropagation()}>
                          <button className="flex-1 flex items-center justify-center text-xs cursor-pointer"
                            style={{ background: C.surfaceSolid, color: C.textSecondary }}
                            onClick={e => { e.stopPropagation(); setSwipedId(null); setRenameModal({ id: session.id, title: session.title || '' }) }}
                            onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setSwipedId(null); setRenameModal({ id: session.id, title: session.title || '' }) }}>
                            重命名
                          </button>
                          <button className="flex-1 flex items-center justify-center text-xs cursor-pointer"
                            style={{ background: C.errorBg, color: C.errorText }}
                            onClick={e => { e.stopPropagation(); setSwipedId(null); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}
                            onTouchEnd={e => { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setSwipedId(null); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}>
                            删除
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          if (isSwiped) { setSwipedId(null); return }
                          if (session.scene_type === 'reading') { navigate(`/read/${session.id}`); setSidebarOpen(false); return }
                          selectSession(session.id); setSidebarOpen(false)
                        }}
                        onMouseEnter={() => setHoveredId(session.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onTouchStart={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchStart(e, session.id) }}
                        onTouchMove={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchMove(e) }}
                        onTouchEnd={e => { e.nativeEvent.stopImmediatePropagation(); handleItemTouchEnd(e) }}
                        className="relative w-full text-left rounded-xl px-4 py-3 transition-colors duration-150 cursor-pointer"
                        style={{
                          background: isActive ? 'rgba(160,120,90,0.06)' : isHovered ? 'rgba(160,120,90,0.03)' : 'transparent',
                          border: `1px solid ${isActive ? 'rgba(196,154,120,0.18)' : 'transparent'}`,
                          color: C.text,
                          transform: isSwiped ? 'translateX(-130px)' : 'translateX(0)',
                          transition: 'transform 0.25s ease',
                        }}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm leading-snug"
                            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400, color: C.text }}
                            onDoubleClick={e => { e.stopPropagation(); setRenameModal({ id: session.id, title: session.title || '' }) }}>
                            {session.title || 'New Chat'}
                          </p>
                          <span className="flex-shrink-0" style={{ color: C.metaText, fontSize: 11 }}>
                            {formatSessionTime(session.updated_at)}
                          </span>
                        </div>
                        {isHovered && (
                          <span role="button"
                            onClick={e => { e.stopPropagation(); if (window.confirm('确定要删除这个对话吗？')) deleteSession(session.id) }}
                            className="absolute right-2 top-1/2 flex items-center justify-center rounded cursor-pointer"
                            style={{ width: 18, height: 18, transform: 'translateY(-50%)', color: C.textMuted }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.errorText)}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}>
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
            <div className="fixed z-50 rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}
              onTouchStart={e => e.nativeEvent.stopImmediatePropagation()} onTouchMove={e => e.nativeEvent.stopImmediatePropagation()} onTouchEnd={e => e.nativeEvent.stopImmediatePropagation()}
              style={{ left: '50%', top: '40%', transform: 'translate(-50%, -50%)', width: 280, background: C.bg, border: `1px solid ${C.borderStrong}`, padding: '20px' }}>
              <p className="text-sm mb-3 font-medium" style={{ color: C.text }}>重命名对话</p>
              <input autoFocus value={renameModal.title} onChange={e => setRenameModal({ ...renameModal, title: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') { setRenameModal(null); setSwipedId(null) } }}
                placeholder="输入新名称…" className="w-full text-sm outline-none rounded-xl px-3 py-2"
                style={{ background: C.surface, color: C.text, border: `1px solid ${C.borderStrong}` }} />
              <div className="flex gap-2 mt-4 justify-end">
                <button className="px-4 py-1.5 rounded-lg text-sm cursor-pointer" style={{ color: C.textSecondary, background: 'transparent' }}
                  onClick={() => { setRenameModal(null); setSwipedId(null) }}>取消</button>
                <button className="px-4 py-1.5 rounded-lg text-sm cursor-pointer" style={{ background: C.accent, color: '#fff' }}
                  onClick={doRename}>确认</button>
              </div>
            </div>
          </>
        )}

        {/* Sidebar bottom — nav shortcuts (mobile) + settings */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center gap-4 px-5 pt-2.5 pb-1 md:hidden">
            {[
              { label: '剧本', action: () => { setSidebarOpen(false); navigate('/projects') } },
              { label: '日历', action: () => { setSidebarOpen(false); navigate('/calendar') } },
              { label: '共读', action: () => { setSidebarOpen(false); navigate('/bookshelf') } },
              { label: isNight ? '☀️ 日间' : '🌙 夜间', action: toggleNight },
            ].map(n => (
              <button key={n.label} onClick={n.action}
                className="text-xs cursor-pointer transition-colors"
                style={{ color: C.textMuted, fontFamily: "'EB Garamond', 'Noto Serif SC', serif", letterSpacing: '0.04em' }}
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-2.5 text-sm transition-colors duration-150 cursor-pointer"
              style={{ color: C.textSecondary }}>
              <Settings size={15} strokeWidth={1.6} />
              <span>设置</span>
            </button>
            <span className="text-xs" style={{ color: C.metaText }}>v4.0</span>
          </div>
        </div>

        {showSettings && (
          <SettingsPanel page={settingsPage} onPageChange={setSettingsPage} onClose={() => { setShowSettings(false); setSettingsPage('menu') }} />
        )}
      </aside>

      {/* ── Main chat area (full-screen room) ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full" style={{ position: 'relative', zIndex: 10 }}>

        {/* Floating header — minimal */}
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30, pointerEvents: 'none', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ pointerEvents: 'auto' }}>
            {/* Left: menu button (mobile) / sidebar trigger (pc) */}
            <button
              className="flex items-center justify-center rounded-xl cursor-pointer transition-all md:opacity-0 md:pointer-events-none"
              style={{ width: 36, height: 36, color: nTextMuted, background: 'transparent', border: 'none' }}
              onClick={() => setSidebarOpen(true)}
              onMouseEnter={e => { e.currentTarget.style.background = nGlassHover; e.currentTarget.style.color = nAccent }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = nTextMuted }}
            >
              <Menu size={18} strokeWidth={1.5} />
            </button>

            {/* Center: model tag — barely visible */}
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setShowModelDropdown(o => !o)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full cursor-pointer transition-all"
                style={{
                  border: `1px solid ${nBorder}`,
                  background: showModelDropdown ? nGlass : nGlassLight,
                  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  fontSize: 11.5, color: nTextMuted,
                  opacity: showModelDropdown ? 1 : 0.7,
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'rgba(180,150,120,0.2)' }}
                onMouseLeave={e => { if (!showModelDropdown) { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.borderColor = C.border } }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: nAccent }} />
                {models.find(m => m.name === model || m.value === model)?.label ?? model}
                <ChevronDown size={10} strokeWidth={2.5} style={{ transform: showModelDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }} />
              </button>

              {showModelDropdown && (
                <div className="absolute top-10 left-1/2 rounded-2xl overflow-hidden"
                  style={{
                    transform: 'translateX(-50%)', minWidth: 260,
                    background: isNight ? 'rgba(23,20,17,0.95)' : 'rgba(248,244,238,0.95)',
                    backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
                    border: `1px solid ${nBorder}`,
                    boxShadow: '0 12px 48px rgba(100,80,50,0.1)', zIndex: 51,
                  }}>
                  {models.map(m => {
                    const isActive = m.name === model || m.value === model
                    return (
                      <div key={m.name}
                        onClick={() => { handleModelChange(m.name); setShowModelDropdown(false) }}
                        className="flex items-center gap-3 cursor-pointer transition-colors"
                        style={{ padding: '12px 14px', background: isActive ? 'rgba(160,120,90,0.06)' : 'transparent' }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(160,120,90,0.04)' }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: getModelColor(m.value) }} />
                        <span className="text-sm" style={{ fontWeight: isActive ? 600 : 400, color: isActive ? C.text : C.textSecondary }}>{m.label}</span>
                        {isActive && <span style={{ marginLeft: 'auto', color: C.accent }}>
                          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        </span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right: new chat */}
            <button
              onClick={() => { if (!isLockedByChen) handleCreateWithScene(currentSession?.scene_type || 'daily') }}
              className="flex items-center justify-center rounded-xl cursor-pointer transition-all"
              style={{ width: 36, height: 36, color: nTextMuted, background: 'transparent', border: 'none', opacity: isLockedByChen ? 0.3 : 1 }}
              onMouseEnter={e => { e.currentTarget.style.background = nGlassHover; e.currentTarget.style.color = nAccent }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = nTextMuted }}
            >
              <Plus size={17} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Messages — full room scroll */}
        <main ref={mainRef} className="flex-1 overflow-y-auto flex flex-col" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <style>{`.main-scroll::-webkit-scrollbar { width: 0; }`}</style>
          {showWelcome ? (
          <WelcomeScreen />
          ) : (
            <div className="mx-auto w-full relative conv-spine" style={{ maxWidth: 760, padding: 'clamp(56px, 9vw, 80px) clamp(16px, 4.5vw, 60px) clamp(140px, 28vw, 220px) clamp(16px, 4.5vw, 60px)' }}>

              {/* Completed messages + inline event bubbles */}
              {Array.isArray(messages) && messages.map((msg, idx) => {
                if (msg.role === 'event') {
                  return <EventBubble key={msg.id} content={msg.content} createdAt={msg.created_at} />
                }
                // Mark user messages as "seen" if there's an assistant reply after them
                const hasReply = msg.role === 'user' && messages.slice(idx + 1).some(m => m.role === 'assistant')
                const msgWithSeen = (msg.role === 'user' && (hasReply || msg.silentRead))
                  ? { ...msg, silentRead: true }
                  : msg
                return (
                  <MessageItem
                    key={msg.id}
                    msg={msgWithSeen}
                    modelLabel={msg.role === 'assistant' ? (models.find(m => m.name === model || m.value === model)?.label ?? model) : undefined}
                    isDebugOpen={_debugOpenMsgId === msg.id}
                    isCopied={copiedMsgId === msg.id}
                    onToggleDebug={() => {
                      if (msg.debugInfo) setSheetDebugInfo(msg.debugInfo)
                    }}
                    onCopy={handleCopyMsg}
                    onDelete={handleDeleteConv}
                    onRetry={handleRetry}
                  />
                )
              })}

              {/* Session ended by Claude */}
              {sessionEnded && (
                <div className="flex justify-center my-8 msg-fade-in">
                  <div className="text-center" style={{ maxWidth: 320 }}>
                    {/* Decorative line break */}
                    <div className="flex items-center justify-center gap-3 mb-5">
                      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${C.borderStrong}, transparent)` }} />
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, opacity: 0.4 }} />
                      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${C.borderStrong}, transparent)` }} />
                    </div>
                    <div style={{
                      fontSize: 11, color: C.textMuted,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      Session Closed
                    </div>
                  </div>
                </div>
              )}

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

        {/* Input fade overlay */}
        <div className="input-fade-overlay" />

        {/* Input area — floating paper */}
        <div style={{
            position: 'fixed', bottom: 'calc(24px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
            width: 580, maxWidth: 'calc(100% - 32px)',
            zIndex: 50,
          }}>
            <div className="relative">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                multiple
                className="hidden"
                onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }}
              />

              {/* 敲门弹窗已移至最外层 */}

              {/* Dream lock toggle — minimal, room-style */}
              <div className="flex items-center justify-end mb-1.5">
                <button
                  onClick={handleToggleDreamLock}
                  className="flex items-center gap-1.5 transition-all cursor-pointer"
                  style={{
                    padding: '4px 12px',
                    borderRadius: 16,
                    border: `1px solid ${dreamLockedChen ? 'rgba(229,57,53,0.15)' : 'rgba(180,150,120,0.1)'}`,
                    background: 'transparent',
                    fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: dreamLockedChen ? 'rgba(229,57,53,0.7)' : C.textMuted,
                    opacity: 0.6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
                  title={dreamLockedChen ? '打开门（解除封锁）' : '关上门（封锁 Claude 2小时）'}
                >
                  <span>{dreamLockedChen ? '开门' : '关门'}</span>
                </button>
              </div>

              {/* Streaming hint */}
              {isStreaming && (
                <p className="text-center mb-1" style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.02em' }}>
                  回复生成中，可以随时离开
                </p>
              )}

              {/* Attachment preview — hidden when locked */}
              {!isLockedByChen && attachments.length > 0 && (
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

              <div ref={plusMenuRef}>
              <div
                className="flex items-end gap-3 px-4 py-3 transition-all duration-400"
                style={{
                  borderRadius: showPlusMenu ? '24px 24px 0 0' : 24,
                  background: nGlass,
                  backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                  border: `1px solid ${isFocused ? (isNight ? 'rgba(196,154,120,0.15)' : 'rgba(196,154,120,0.25)') : (isNight ? 'rgba(180,150,120,0.06)' : 'rgba(180,150,120,0.1)')}`,
                  borderBottom: showPlusMenu ? 'none' : undefined,
                  boxShadow: isFocused
                    ? (isNight ? '0 8px 48px rgba(0,0,0,0.3), 0 0 0 4px rgba(196,154,120,0.04)' : '0 8px 48px rgba(160,120,90,0.1), 0 0 0 4px rgba(196,154,120,0.06)')
                    : (isNight ? '0 4px 32px rgba(0,0,0,0.2)' : '0 4px 32px rgba(160,120,90,0.06)'),
                  transform: isFocused ? 'translateY(-2px)' : 'none',
                  opacity: isLockedByChen ? 0.35 : undefined,
                  pointerEvents: isLockedByChen ? 'none' : undefined,
                }}
              >
                {/* Plus toggle */}
                <button
                  onClick={() => setShowPlusMenu(v => !v)}
                  disabled={isStreaming || !currentSession}
                  className="flex-shrink-0 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    width: 30, height: 30,
                    color: showPlusMenu ? C.accent : C.textMuted,
                    transform: showPlusMenu ? 'rotate(45deg)' : 'none',
                    transition: 'transform 0.2s ease, color 0.15s',
                  }}
                >
                  <Plus size={18} strokeWidth={2} />
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => { setIsFocused(true); setShowPlusMenu(false) }}
                  onBlur={() => setIsFocused(false)}
                  disabled={isStreaming || !currentSession || sessionEnded || isLockedByChen}
                  placeholder={isLockedByChen ? "Session locked by Claude" : sessionEnded ? "Session closed" : "说点什么..."}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed disabled:opacity-40"
                  style={{ color: nText, minHeight: 24, maxHeight: 120, overflowY: 'auto', scrollbarWidth: 'none' }}
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

              {/* Tool tray — expands below input */}
              <div
                style={{
                  maxHeight: showPlusMenu ? 120 : 0,
                  opacity: showPlusMenu ? 1 : 0,
                  overflow: 'hidden',
                  transition: 'max-height 0.25s ease, opacity 0.2s ease',
                  background: C.inputBg,
                  borderRadius: '0 0 22px 22px',
                  border: showPlusMenu ? `1px solid ${C.borderStrong}` : `1px solid transparent`,
                  borderTop: 'none',
                }}
              >
                <div
                  className="flex items-center gap-1 px-3"
                  style={{ padding: '10px 12px 14px', borderTop: `1px dashed ${C.border}` }}
                >
                  {[
                    { icon: Image, title: '图片', action: () => {
                      const inp = document.createElement('input')
                      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true
                      inp.onchange = () => { handleFileSelect(inp.files); setShowPlusMenu(false) }
                      inp.click()
                    }},
                    { icon: FileText, title: '文件', action: () => { fileInputRef.current?.click(); setShowPlusMenu(false) }},
                    { icon: MapPin, title: '位置', action: () => { handleShareLocation(); setShowPlusMenu(false) }},
                  ].map(item => (
                    <button
                      key={item.title}
                      onClick={item.action}
                      disabled={isUploading}
                      title={item.title}
                      className="flex items-center justify-center rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                      style={{ width: 44, height: 44, color: C.textSecondary }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,120,90,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <item.icon size={20} strokeWidth={1.5} />
                    </button>
                  ))}
                </div>
              </div>
              </div>
            </div>
          </div>

        {/* ── PC floating tools — right bottom corner ── */}
        <div
          className="hidden md:block fixed"
          style={{ bottom: 0, right: 0, width: 60, height: 120, zIndex: 70 }}
          onMouseEnter={handleToolsEnter}
        />
        <div
          className="hidden md:flex fixed flex-col gap-1.5"
          onMouseEnter={handleToolsEnter}
          onMouseLeave={handleToolsLeave}
          style={{
            bottom: 24, right: 24, zIndex: 70,
            opacity: toolsHover ? 1 : 0,
            transform: toolsHover ? 'translateY(0)' : 'translateY(8px)',
            transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
            pointerEvents: toolsHover ? 'auto' : 'none',
          }}
        >
          {[
            {
              key: 'scripts', label: '剧本世界',
              icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M7 13l3 2-3 2"/><path d="M13 17h4"/></svg>,
              action: () => navigate('/projects'),
            },
            {
              key: 'graph', label: '记忆图谱',
              icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4"/><path d="M7.5 17.5L11 13"/><path d="M16.5 17.5L13 13"/><circle cx="12" cy="12" r="1.5"/></svg>,
              action: () => {},
            },
            {
              key: 'calendar', label: '回忆日历',
              icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>,
              action: () => navigate('/calendar'),
            },
            {
              key: 'night', label: isNight ? '切换日间' : '切换夜间',
              icon: isNight
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
              action: toggleNight,
            },
            {
              key: 'settings', label: '设置',
              icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
              action: () => { setSidebarOpen(true); setShowSettings(true) },
            },
          ].map(btn => (
            <button
              key={btn.key}
              onClick={btn.action}
              className="tool-float-btn group"
              style={{
                width: 40, height: 40, borderRadius: '50%',
                border: `1px solid ${isNight ? 'rgba(180,150,120,0.08)' : C.border}`,
                background: isNight ? 'rgba(23,20,17,0.92)' : 'rgba(248,244,238,0.92)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: isNight ? '#9A8A78' : C.textMuted, position: 'relative',
                boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget
                el.style.borderColor = isNight ? '#D4AE8A' : C.accent
                el.style.color = isNight ? '#D4AE8A' : C.accent
                el.style.background = isNight ? 'rgba(40,35,28,0.95)' : 'rgba(255,255,255,0.9)'
                el.style.boxShadow = '0 4px 20px rgba(160,120,90,0.1)'
                el.style.transform = 'scale(1.08)'
                const tip = el.querySelector('.tool-tip') as HTMLElement
                if (tip) { tip.style.opacity = '1'; tip.style.transform = 'translateY(-50%) translateX(0)' }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget
                el.style.borderColor = isNight ? 'rgba(180,150,120,0.08)' : C.border
                el.style.color = isNight ? '#9A8A78' : C.textMuted
                el.style.background = isNight ? 'rgba(23,20,17,0.92)' : 'rgba(248,244,238,0.92)'
                el.style.boxShadow = '0 2px 12px rgba(0,0,0,0.03)'
                el.style.transform = 'scale(1)'
                const tip = el.querySelector('.tool-tip') as HTMLElement
                if (tip) { tip.style.opacity = '0'; tip.style.transform = 'translateY(-50%) translateX(4px)' }
              }}
            >
              {btn.icon}
              <span
                className="tool-tip"
                style={{
                  position: 'absolute',
                  right: 'calc(100% + 10px)', top: '50%',
                  transform: 'translateY(-50%) translateX(4px)',
                  padding: '4px 10px', borderRadius: 8,
                  background: isNight ? 'rgba(23,20,17,0.92)' : 'rgba(248,244,238,0.92)',
                  border: `1px solid ${isNight ? 'rgba(180,150,120,0.08)' : C.border}`,
                  fontSize: 11, color: isNight ? '#9A8A78' : C.textMuted,
                  whiteSpace: 'nowrap',
                  opacity: 0, pointerEvents: 'none',
                  transition: 'all 0.2s',
                  backdropFilter: 'blur(20px)',
                  fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
                }}
              >
                {btn.label}
              </span>
            </button>
          ))}
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

        {/* 敲门弹窗 — 被 Claude 锁住时（放最外层避免 CSS 定位问题） */}
        {isLockedByChen && !lockDismissed && (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backdropFilter: 'blur(10px)', background: 'rgba(245,240,235,0.65)' }}
            onClick={() => setLockDismissed(true)}>
            <div className="flex flex-col items-center mx-4" style={{ maxWidth: 300, width: '100%' }} onClick={e => e.stopPropagation()}>

              {/* 呼吸光点 */}
              <div style={{
                width: 5, height: 5, borderRadius: '50%', background: C.accent,
                boxShadow: `0 0 8px 3px rgba(160,120,90,0.2)`,
                animation: 'breathe 3s ease-in-out infinite', marginBottom: 20,
              }} />

              {/* 标题 */}
              <div style={{
                fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6,
              }}>
                Session Locked
              </div>
              {lockInfo?.chen_locked_dream?.locked_until && (
                <div style={{ fontSize: 20, color: C.textSecondary, fontWeight: 300, letterSpacing: '0.05em', marginBottom: 24 }}>
                  {new Date(lockInfo.chen_locked_dream.locked_until).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}

              {/* 敲门卡片 — 半透明玻璃 */}
              <div className="rounded-2xl px-5 py-4 w-full" style={{
                background: 'rgba(160,120,90,0.04)',
                border: `1px solid rgba(160,120,90,0.08)`,
              }}>
                {/* 已发的纸条 */}
                {knockHistory.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3">
                    {knockHistory.map((k, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs" style={{ color: C.textSecondary }}>
                        <span style={{ color: C.textMuted, fontSize: 10, flexShrink: 0 }}>
                          {new Date(k.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ borderBottom: `1px dashed ${C.border}`, paddingBottom: 1 }}>{k.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 敲门输入 */}
                {knockCount < maxKnocks ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={knockMsg}
                        onChange={e => setKnockMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleKnock()}
                        placeholder="Leave a note..."
                        className="flex-1 text-xs outline-none bg-transparent py-2"
                        style={{ borderBottom: `1px solid ${C.border}`, color: C.text }}
                        disabled={knockSending}
                      />
                      <button
                        onClick={handleKnock}
                        disabled={knockSending}
                        className="flex-shrink-0 text-xs transition-all cursor-pointer disabled:opacity-40"
                        style={{ color: C.accent, background: 'transparent', padding: '6px 0' }}
                      >
                        {knockSending ? '...' : 'Knock'}
                      </button>
                    </div>
                    {/* 计数器 — 小圆点 */}
                    <div className="flex items-center gap-1.5 mt-3 justify-end" style={{ fontSize: 10 }}>
                      {Array.from({ length: maxKnocks }).map((_, i) => (
                        <span key={i} style={{ color: i < knockCount ? C.accent : C.border, fontSize: 6 }}>●</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs py-1" style={{ color: C.textMuted, fontStyle: 'italic' }}>
                    All notes sent.
                  </div>
                )}
              </div>
            </div>
          </div>
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
