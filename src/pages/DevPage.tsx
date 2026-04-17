import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import {
  ArrowUp, Terminal, RotateCcw, Square, ChevronDown, ChevronRight, Clock, Plus,
  FileText, FilePenLine, Folder, GitBranch, GitCommit, CloudUpload,
  Hammer, RefreshCw, FileSearch, Search, Brain, Play, Bot, Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { createSessionAPI, fetchSessionsAPI, type Session } from '../api/sessions'
import { streamChat, fetchMessagesAPI } from '../api/chat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DelegateStep {
  round: number
  tool: string
  status: 'running' | 'done'
  preview?: string
}

interface ToolCall {
  id: string
  name: string
  args: string
  result: string
  status: 'running' | 'done' | 'error'
  ts: number
  subSteps?: DelegateStep[]
}

interface DevMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCall[]
  thinking?: string
  ts: number
  tokens?: { input: number; output: number; cached?: number }
}

// ─── Dev color overrides (terminal feel, still warm) ─────────────────────────

const D = {
  bg: '#1E1A16',
  surface: '#262220',
  surfaceHover: '#302C28',
  border: 'rgba(180,150,120,0.15)',
  text: '#E8E0D8',
  textMuted: '#8A7A6A',
  accent: '#C49A78',
  accentDim: 'rgba(196,154,120,0.15)',
  green: '#6EBF8B',
  red: '#D4735A',
  inputBg: '#1A1614',
}

// ─── Tool icon & label mapping (Claude Code style) ───────────────────────────

const TOOL_ICONS: Record<string, LucideIcon> = {
  read_file: FileText,
  write_file: FilePenLine,
  list_dir: Folder,
  git_diff: GitBranch,
  git_commit: GitCommit,
  git_push: CloudUpload,
  git_rollback: RotateCcw,
  build_frontend: Hammer,
  restart_gateway: RefreshCw,
  run_shell: Terminal,
  read_system_log: FileSearch,
  search_memory: Search,
  save_memory: Brain,
  run_code: Play,
  delegate_to_sonnet: Bot,
}

const TOOL_LABELS: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  list_dir: 'LS',
  git_diff: 'GitDiff',
  git_commit: 'GitCommit',
  git_push: 'GitPush',
  git_rollback: 'GitRollback',
  build_frontend: 'Build',
  restart_gateway: 'Restart',
  run_shell: 'Bash',
  read_system_log: 'Log',
  search_memory: 'SearchMemory',
  save_memory: 'SaveMemory',
  run_code: 'Run',
  delegate_to_sonnet: 'Delegate',
}

function ToolIcon({ name, size = 12, color }: { name: string; size?: number; color?: string }) {
  const Icon = TOOL_ICONS[name] || Wrench
  return <Icon size={size} strokeWidth={1.6} style={{ color: color || D.textMuted, flexShrink: 0 }} />
}

// ─── Tool call display ───────────────────────────────────────────────────────

function ToolCallBlock({ tc, isMobile }: { tc: ToolCall; isMobile: boolean }) {
  const [open, setOpen] = useState(tc.status === 'running')
  const statusColor = tc.status === 'running' ? D.accent : tc.status === 'error' ? D.red : D.green
  const hasSubSteps = tc.subSteps && tc.subSteps.length > 0
  const label = TOOL_LABELS[tc.name] || tc.name

  return (
    <div style={{ margin: '4px 0', borderLeft: `2px solid ${statusColor}`, paddingLeft: isMobile ? 8 : 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', color: D.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: isMobile ? 12 : 13, fontFamily: 'monospace', width: '100%', minWidth: 0 }}
      >
        {open ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : <ChevronRight size={12} style={{ flexShrink: 0 }} />}
        <ToolIcon name={tc.name} size={isMobile ? 11 : 12} color={statusColor} />
        <span style={{ fontWeight: 600, letterSpacing: '0.02em' }}>{label}</span>
        {tc.args && !hasSubSteps && (
          <span style={{ color: D.textMuted, fontSize: isMobile ? 10 : 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
            ({tc.args})
          </span>
        )}
        {hasSubSteps && <span style={{ color: D.textMuted, fontSize: 11 }}>· {tc.subSteps!.length} steps</span>}
        {tc.status === 'running' && <span style={{ color: D.accent, fontSize: 10, marginLeft: 'auto', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>running</span>}
      </button>
      {open && (
        <div style={{ fontSize: isMobile ? 11 : 12, fontFamily: 'monospace', padding: isMobile ? '4px 0 4px 12px' : '4px 0 4px 18px' }}>
          {/* Delegate 子步骤可视化 */}
          {hasSubSteps && (
            <div style={{ marginBottom: 6 }}>
              {tc.subSteps!.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0', fontSize: 11 }}>
                  <span style={{ color: s.status === 'done' ? D.green : D.accent, width: 12, textAlign: 'center' }}>
                    {s.status === 'done' ? '✓' : '›'}
                  </span>
                  <span style={{ color: D.textMuted }}>R{s.round}</span>
                  <ToolIcon name={s.tool} size={11} color={D.textMuted} />
                  <span style={{ color: D.text }}>{TOOL_LABELS[s.tool] || s.tool}</span>
                  {s.preview && <span style={{ color: D.textMuted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.preview}</span>}
                </div>
              ))}
            </div>
          )}
          {tc.args && (
            <div style={{ color: D.textMuted, marginBottom: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <span style={{ color: D.accent }}>args </span>{tc.args}
            </div>
          )}
          {tc.result && (
            <div style={{ color: D.text, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: isMobile ? 220 : 300, overflowY: 'auto' }}>
              <span style={{ color: D.green }}>result </span>{tc.result}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Thinking block ──────────────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ margin: '4px 0' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', color: D.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', fontSize: 12, fontFamily: 'monospace' }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>thinking...</span>
      </button>
      {open && (
        <pre style={{ fontSize: 11, color: D.textMuted, padding: '4px 0 4px 16px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto' }}>
          {text}
        </pre>
      )}
    </div>
  )
}

// ─── Markdown in dark mode ───────────────────────────────────────────────────

const mdComponents = {
  code({ className, children, ...props }: any) {
    const isInline = !className
    if (isInline) {
      return <code style={{ background: D.surface, padding: '1px 5px', borderRadius: 3, fontSize: '0.85em', color: D.accent }} {...props}>{children}</code>
    }
    return (
      <div style={{ margin: '8px 0', borderRadius: 8, overflow: 'hidden', background: '#141210', border: `1px solid ${D.border}` }}>
        <pre style={{ padding: 12, overflowX: 'auto', fontSize: 13, lineHeight: 1.5 }}><code className={className} {...props}>{children}</code></pre>
      </div>
    )
  },
  p({ children, ...props }: any) {
    return <p style={{ margin: '6px 0' }} {...props}>{children}</p>
  },
  a({ children, href, ...props }: any) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: D.accent, textDecoration: 'underline' }} {...props}>{children}</a>
  },
}

// ─── Token usage bar ─────────────────────────────────────────────────────────

function TokenBar({ tokens }: { tokens: { input: number; output: number; cached?: number } }) {
  const total = tokens.input + tokens.output
  const cached = tokens.cached || 0
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 10, color: D.textMuted, marginTop: 4 }}>
      <span>in: {tokens.input.toLocaleString()}</span>
      <span>out: {tokens.output.toLocaleString()}</span>
      {cached > 0 && <span style={{ color: D.accent }}>cached: {cached.toLocaleString()}</span>}
      <span>total: {total.toLocaleString()}</span>
    </div>
  )
}

// ─── Session sidebar item ────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ─── Main DevPage ────────────────────────────────────────────────────────────

const DEV_MODELS: { value: string; label: string }[] = [
  { value: 'guagua-gcp/claude-sonnet-4-6', label: 'Sonnet 4.6 (呱呱GCP)' },
  { value: 'guagua/claude-opus-4-7', label: 'Opus 4.7 (呱呱)' },
  { value: 'guagua-gcp/claude-opus-4-6', label: 'Opus 4.6 (呱呱GCP)' },
  { value: '[按量]claude-sonnet-4-6', label: 'Sonnet 4.6 (按量)' },
  { value: '[按量]claude-opus-4-6-thinking', label: 'Opus 4.6 (按量)' },
  { value: 'claude-opus-4.6-guagua', label: 'Opus 4.6 (呱呱thinking)' },
  { value: 'claude-opus-4.6-zenmux', label: 'Opus 4.6 (ZM)' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek R1' },
]

// In-memory cache: session messages survive tab switches
const messageCache = new Map<string, DevMessage[]>()
const tokenCache = new Map<string, { input: number; output: number; cached: number }>()

// ─── Responsive breakpoint ──────────────────────────────────────────────────

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

export default function DevPage() {
  const token = useAuthStore(s => s.token)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DevMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [model, setModel] = useState(DEV_MODELS[0].value)
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null)
  const [devSessions, setDevSessions] = useState<Session[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0, cached: 0 })
  const [gwStatus, setGwStatus] = useState<'ok' | 'disconnected' | 'reconnecting'>('ok')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useIsMobile()

  // PC 默认展开侧边栏
  useEffect(() => { if (!isMobile) setSidebarOpen(true) }, [isMobile])

  // Save messages to cache whenever they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      messageCache.set(sessionId, messages)
      tokenCache.set(sessionId, totalTokens)
    }
  }, [messages, sessionId, totalTokens])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load dev sessions
  const loadDevSessions = useCallback(async () => {
    if (!token) return
    try {
      const all = await fetchSessionsAPI()
      const devOnly = all.filter(s => s.scene_type === 'dev').sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      setDevSessions(devOnly)
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => { loadDevSessions() }, [loadDevSessions])

  // On mount: restore last dev session or create new
  useEffect(() => {
    if (!token) return
    const saved = localStorage.getItem('reverie_dev_session')
    if (saved) {
      loadSession(saved)
    } else {
      createNewSession()
    }
  }, [token])  // eslint-disable-line

  // Convert raw DB records (user_msg/assistant_msg pairs) to DevMessages
  function dbToDevMessages(raw: unknown): DevMessage[] {
    // API returns { messages: [...] } or array
    const records: unknown[] =
      Array.isArray(raw) ? raw
        : Array.isArray((raw as { messages?: unknown }).messages)
          ? (raw as { messages: unknown[] }).messages
          : []

    // DB returns newest first, reverse to chronological
    records.reverse()

    const result: DevMessage[] = []
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
        created_at: string
      }
      if (r.user_msg) {
        result.push({
          id: `${r.id}-user`,
          role: 'user',
          content: r.user_msg,
          ts: new Date(r.created_at).getTime(),
        })
      }
      if (r.assistant_msg) {
        result.push({
          id: `${r.id}-assistant`,
          role: 'assistant',
          content: r.assistant_msg,
          thinking: r.thinking_summary || undefined,
          tokens: (r.input_tokens || r.output_tokens) ? {
            input: r.input_tokens ?? 0,
            output: r.output_tokens ?? 0,
            cached: r.cached_tokens ?? 0,
          } : undefined,
          ts: new Date(r.created_at).getTime(),
        })
      }
    }
    return result
  }

  // Load existing session (cache first, then DB fallback)
  const loadSession = useCallback(async (sid: string) => {
    if (!token || sid === sessionId) return
    setSessionId(sid)
    localStorage.setItem('reverie_dev_session', sid)
    if (window.innerWidth < 640) setSidebarOpen(false)

    // Check in-memory cache first
    const cached = messageCache.get(sid)
    if (cached && cached.length > 0) {
      setMessages(cached)
      setTotalTokens(tokenCache.get(sid) || { input: 0, output: 0, cached: 0 })
      return
    }

    // Fallback: load from DB
    try {
      const raw = await fetchMessagesAPI(sid)
      const devMsgs = dbToDevMessages(raw)
      if (devMsgs.length > 0) {
        setMessages([
          { id: 'sys-restore', role: 'system' as const, content: `Session restored: ${sid.slice(0, 8)} (${devMsgs.length} messages)`, ts: Date.now() },
          ...devMsgs,
        ])
      } else {
        setMessages([
          { id: 'sys-0', role: 'system', content: `Dev session: ${sid.slice(0, 8)} (empty)`, ts: Date.now() },
        ])
      }
    } catch {
      setMessages([
        { id: 'sys-0', role: 'system', content: `Dev session: ${sid.slice(0, 8)} (couldn't load history)`, ts: Date.now() },
      ])
    }
    setTotalTokens({ input: 0, output: 0, cached: 0 })
  }, [token, sessionId])

  // Create new session
  const createNewSession = useCallback(async () => {
    if (!token) return
    try {
      const s = await createSessionAPI('dev', model)
      setSessionId(s.id)
      localStorage.setItem('reverie_dev_session', s.id)
      setMessages([{
        id: 'sys-0',
        role: 'system',
        content: `New dev session: ${s.id.slice(0, 8)}\nModel: ${model}`,
        ts: Date.now(),
      }])
      setTotalTokens({ input: 0, output: 0, cached: 0 })
      loadDevSessions()
    } catch (e: any) {
      setMessages([{ id: 'err-0', role: 'system', content: `Failed: ${e.message}`, ts: Date.now() }])
    }
  }, [token, model, loadDevSessions])

  // Gateway health polling (after disconnect)
  const pollGatewayHealth = useCallback(() => {
    setGwStatus('disconnected')
    setMessages(prev => [...prev, {
      id: `sys-gw-${Date.now()}`, role: 'system',
      content: 'Gateway disconnected — waiting for restart...', ts: Date.now(),
    }])
    let attempts = 0
    const maxAttempts = 30
    const iv = setInterval(async () => {
      attempts++
      setGwStatus('reconnecting')
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
          clearInterval(iv)
          setGwStatus('ok')
          setMessages(prev => [...prev, {
            id: `sys-gw-ok-${Date.now()}`, role: 'system',
            content: `Gateway reconnected (${attempts * 3}s)`, ts: Date.now(),
          }])
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(iv)
          setGwStatus('disconnected')
          setMessages(prev => [...prev, {
            id: `sys-gw-fail-${Date.now()}`, role: 'system',
            content: 'Gateway did not come back after 90s. Check server manually.', ts: Date.now(),
          }])
        }
      }
    }, 3000)
  }, [])

  // Send message
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !sessionId || !token || isStreaming) return

    const userMsg: DevMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      ts: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)

    const ctrl = new AbortController()
    setAbortCtrl(ctrl)

    const assistantId = `a-${Date.now()}`
    setMessages(prev => [...prev, {
      id: assistantId, role: 'assistant', content: '', toolCalls: [], ts: Date.now(),
    }])

    try {
      const resp = await streamChat(sessionId, model, userMsg.content, token, undefined, ctrl.signal)
      if (!resp.body) throw new Error('No stream body')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentToolId: string | null = null
      let currentToolArgs = ''
      let thinkingBuf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue

          try {
            const evt = JSON.parse(raw)

            switch (evt.type) {
              case 'tool_searching': {
                const queryParts = (evt.query || '').split(' ')
                const toolName = queryParts.length > 1 ? queryParts.slice(1).join(' ') : queryParts[0]
                const tc: ToolCall = {
                  id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: toolName || 'tool',
                  args: '',
                  result: '',
                  status: 'running',
                  ts: Date.now(),
                }
                currentToolId = tc.id
                currentToolArgs = ''
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, toolCalls: [...(m.toolCalls || []), tc] } : m
                ))
                continue
              }
              case 'tool_result': {
                if (currentToolId) {
                  const resultContent = evt.content || ''
                  setMessages(prev => prev.map(m => {
                    if (m.id !== assistantId) return m
                    return {
                      ...m,
                      toolCalls: (m.toolCalls || []).map(tc =>
                        tc.id === currentToolId ? { ...tc, result: resultContent, status: 'done' as const } : tc
                      ),
                    }
                  }))
                  currentToolId = null
                }
                continue
              }
              case 'tool_args': {
                // If gateway sends tool args separately
                if (currentToolId && evt.content) {
                  currentToolArgs += evt.content
                  setMessages(prev => prev.map(m => {
                    if (m.id !== assistantId) return m
                    return {
                      ...m,
                      toolCalls: (m.toolCalls || []).map(tc =>
                        tc.id === currentToolId ? { ...tc, args: currentToolArgs } : tc
                      ),
                    }
                  }))
                }
                continue
              }
              case 'thinking_start':
                continue
              case 'thinking_delta': {
                thinkingBuf += evt.content || ''
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, thinking: thinkingBuf } : m
                ))
                continue
              }
              case 'thinking_end':
                continue
              case 'text_delta': {
                const text = evt.content || ''
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: m.content + text } : m
                ))
                continue
              }
              case 'usage': {
                const u = evt.usage || evt
                const input_t = u.input_tokens || u.prompt_tokens || 0
                const output_t = u.output_tokens || u.completion_tokens || 0
                const cached_t = u.cache_read_input_tokens || u.cached_tokens || 0
                setTotalTokens(prev => ({
                  input: prev.input + input_t,
                  output: prev.output + output_t,
                  cached: prev.cached + cached_t,
                }))
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, tokens: { input: input_t, output: output_t, cached: cached_t } } : m
                ))
                continue
              }
              case 'error': {
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: m.content + `\n\n[Error: ${evt.message || 'unknown'}]` } : m
                ))
                continue
              }
              case 'delegate_progress': {
                const step: DelegateStep = {
                  round: evt.round || 0,
                  tool: evt.tool || '?',
                  status: evt.status === 'done' ? 'done' : 'running',
                  preview: evt.preview || undefined,
                }
                setMessages(prev => prev.map(m => {
                  if (m.id !== assistantId) return m
                  // 找到最后一个 delegate_to_sonnet 工具调用，追加子步骤
                  const tcs = [...(m.toolCalls || [])]
                  for (let i = tcs.length - 1; i >= 0; i--) {
                    if (tcs[i].name === 'delegate_to_sonnet') {
                      const existing = tcs[i].subSteps || []
                      if (step.status === 'done') {
                        // 更新已有的 running 步骤为 done
                        const updated = existing.map(s =>
                          s.round === step.round && s.tool === step.tool && s.status === 'running'
                            ? { ...s, status: 'done' as const, preview: step.preview }
                            : s
                        )
                        tcs[i] = { ...tcs[i], subSteps: updated }
                      } else {
                        tcs[i] = { ...tcs[i], subSteps: [...existing, step] }
                      }
                      break
                    }
                  }
                  return { ...m, toolCalls: tcs }
                }))
                continue
              }
              case 'session_ended':
              case 'silent_read':
              case 'clear_thinking':
              case 'memory_saved':
              case 'memory_updated':
              case 'memory_deleted':
                continue
            }

            // Fallback: OpenAI format
            const choices = evt.choices
            if (choices?.[0]?.delta) {
              const delta = choices[0].delta
              if (delta.reasoning_content) {
                thinkingBuf += delta.reasoning_content
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, thinking: thinkingBuf } : m
                ))
              }
              if (typeof delta.content === 'string') {
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: m.content + delta.content } : m
                ))
              }
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        // Check if this looks like a gateway disconnect (network error during stream)
        const isDisconnect = e.message?.includes('network') || e.message?.includes('Failed to fetch') || e.name === 'TypeError'
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + `\n\n[Error: ${e.message}]` } : m
        ))
        if (isDisconnect) {
          pollGatewayHealth()
        }
      }
    } finally {
      setIsStreaming(false)
      setAbortCtrl(null)
    }
  }, [input, sessionId, token, isStreaming, model])

  const stopStream = useCallback(() => {
    // 通知后端中断工具循环
    if (sessionId) {
      fetch('/api/dev/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      }).catch(() => {})
    }
    // 同时断 SSE 流（兜底：如果晨在 thinking/text 阶段，abort 标志检查不到）
    abortCtrl?.abort()
  }, [sessionId, abortCtrl])

  // 流式进行中：注入指令
  const injectInstruction = useCallback(async () => {
    if (!input.trim() || !sessionId) return
    const text = input.trim()
    setInput('')
    // 前端显示注入的指令
    setMessages(prev => [...prev, {
      id: `inject-${Date.now()}`,
      role: 'user',
      content: `→ ${text}`,
      ts: Date.now(),
    }])
    try {
      await fetch('/api/dev/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, content: text }),
      })
    } catch {
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`, role: 'system',
        content: 'Failed to inject instruction', ts: Date.now(),
      }])
    }
  }, [input, sessionId])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isStreaming) {
        injectInstruction()
      } else {
        sendMessage()
      }
    }
  }, [sendMessage, injectInstruction, isStreaming])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100dvh', background: D.bg, color: D.text, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace" }}>

      {/* Sidebar — overlay on mobile, inline on desktop */}
      {sidebarOpen && isMobile && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90,
        }} />
      )}
      {sidebarOpen && (
        <div style={{
          width: isMobile ? 'min(82vw, 260px)' : 220,
          flexShrink: 0, borderRight: `1px solid ${D.border}`,
          background: D.surface, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          ...(isMobile ? {
            position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100,
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          } : {}),
        }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: D.textMuted, fontWeight: 600 }}>Sessions</span>
            <button
              onClick={createNewSession}
              style={{ background: D.accentDim, border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: D.accent }}
              title="New session"
            >
              <Plus size={12} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {devSessions.map(s => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', border: 'none', cursor: 'pointer',
                  background: s.id === sessionId ? D.accentDim : 'transparent',
                  color: s.id === sessionId ? D.accent : D.textMuted,
                  fontSize: 11, lineHeight: 1.4,
                  borderLeft: s.id === sessionId ? `2px solid ${D.accent}` : '2px solid transparent',
                }}
                onMouseEnter={e => { if (s.id !== sessionId) e.currentTarget.style.background = D.surfaceHover }}
                onMouseLeave={e => { if (s.id !== sessionId) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || s.id.slice(0, 8)}
                </div>
                <div style={{ fontSize: 10, color: D.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={9} />
                  {formatTime(s.updated_at)}
                </div>
              </button>
            ))}
            {devSessions.length === 0 && (
              <div style={{ padding: '20px 14px', color: D.textMuted, fontSize: 11, textAlign: 'center' }}>
                No dev sessions yet
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '6px 10px' : '8px 16px',
          paddingTop: isMobile ? 'calc(6px + env(safe-area-inset-top))' : '8px',
          borderBottom: `1px solid ${D.border}`,
          background: D.surface, flexShrink: 0, gap: 6, flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, minWidth: 0 }}>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{ background: 'none', border: 'none', color: D.textMuted, cursor: 'pointer', padding: 2, flexShrink: 0 }}
            >
              <Terminal size={16} />
            </button>
            {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: D.accent }}>Reverie Dev</span>}
            {gwStatus !== 'ok' && (
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: gwStatus === 'disconnected' ? 'rgba(212,115,90,0.15)' : 'rgba(196,154,120,0.15)',
                color: gwStatus === 'disconnected' ? D.red : D.accent,
                animation: gwStatus === 'reconnecting' ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }}>
                {gwStatus === 'disconnected' ? 'disconnected' : 'reconnecting...'}
              </span>
            )}
            {totalTokens.input > 0 && (
              <span style={{ fontSize: 10, color: D.textMuted, padding: '2px 6px', background: D.accentDim, borderRadius: 4, whiteSpace: 'nowrap' }}>
                {((totalTokens.input + totalTokens.output) / 1000).toFixed(0)}k
                {totalTokens.cached > 0 && !isMobile && <span style={{ color: D.accent }}> ({((totalTokens.cached / totalTokens.input) * 100).toFixed(0)}% cached)</span>}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={isStreaming}
              style={{
                background: D.inputBg, border: `1px solid ${D.border}`, borderRadius: 6,
                padding: '4px 8px', color: D.accent, fontSize: 11, fontFamily: 'inherit',
                cursor: 'pointer', outline: 'none', maxWidth: isMobile ? 130 : 'none',
              }}
            >
              {DEV_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <a
              href="/chat/"
              style={{ border: `1px solid ${D.border}`, borderRadius: 6, padding: '4px 10px', color: D.textMuted, fontSize: 11, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              Chat
            </a>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '8px 10px' : '12px 20px' }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ marginBottom: 14 }}>
              {msg.role === 'system' && (
                <div style={{ color: D.textMuted, fontSize: 11, padding: '4px 8px', background: D.accentDim, borderRadius: 4, display: 'inline-block', whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </div>
              )}

              {msg.role === 'user' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: D.green, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>dream $</span>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                    {msg.content}
                  </div>
                </div>
              )}

              {msg.role === 'assistant' && (
                <div style={{ marginLeft: 0, borderLeft: `2px solid ${D.accent}30`, paddingLeft: 12 }}>
                  <span style={{ color: D.accent, fontSize: 11, fontWeight: 600 }}>claude</span>
                  {msg.thinking && <ThinkingBlock text={msg.thinking} />}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div style={{ margin: '4px 0' }}>
                      {msg.toolCalls.map(tc => <ToolCallBlock key={tc.id} tc={tc} isMobile={isMobile} />)}
                    </div>
                  )}
                  {msg.content && (
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: D.text }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                  {msg.tokens && <TokenBar tokens={msg.tokens} />}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: isMobile ? '8px 10px' : '10px 16px',
          paddingBottom: isMobile ? 'calc(8px + env(safe-area-inset-bottom))' : '10px',
          borderTop: `1px solid ${D.border}`, background: D.surface, flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: D.inputBg, borderRadius: 10, border: `1px solid ${D.border}`,
            padding: '8px 12px',
          }}>
            <span style={{ color: D.green, fontSize: 13, fontWeight: 600, paddingBottom: 2 }}>$</span>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'Insert instruction...' : 'Describe what to change...'}
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: isStreaming ? D.accent : D.text, fontSize: 13, fontFamily: 'inherit', resize: 'none',
                lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
              }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 120) + 'px'
              }}
            />
            {isStreaming ? (
              <div style={{ display: 'flex', gap: 4 }}>
                {input.trim() && (
                  <button
                    onClick={injectInstruction}
                    title="Inject instruction"
                    style={{ background: D.accent, border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex' }}
                  >
                    <ArrowUp size={14} color={D.bg} />
                  </button>
                )}
                <button onClick={stopStream} title="Stop" style={{ background: D.red, border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex' }}>
                  <Square size={14} fill="white" color="white" />
                </button>
              </div>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                style={{
                  background: input.trim() ? D.accent : D.accentDim,
                  border: 'none', borderRadius: 6, padding: '6px 8px', cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex', opacity: input.trim() ? 1 : 0.5,
                }}
              >
                <ArrowUp size={14} color={D.bg} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 10, color: D.textMuted, marginTop: 4, textAlign: 'center' }}>
            {isStreaming
              ? 'Enter to inject instruction · Stop to abort'
              : 'Shift+Enter for new line · read/write · git · build · restart · rollback'}
          </div>
        </div>
      </div>
    </div>
  )
}
