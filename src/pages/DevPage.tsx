import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import {
  ChevronDown, ChevronRight, Plus,
  FileText, FilePenLine, Folder, GitBranch, GitCommit, CloudUpload,
  RotateCcw, Hammer, RefreshCw, Terminal, FileSearch, Search, Brain,
  Play, Bot, Wrench, type LucideIcon,
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

// ─── Warm-night terminal palette ─────────────────────────────────────────────

const W = {
  bg0: '#0d0805',
  bg1: '#15100a',
  bg2: '#1d1610',
  bg3: '#271e14',
  border0: '#2d2317',
  border1: '#3e301f',
  border2: '#564227',
  ink: '#ecd7b0',
  inkDim: '#b89c73',
  inkMuted: '#7a6547',
  inkFaint: '#55442e',
  amber: '#e8a951',
  amberBright: '#f6c470',
  amberDeep: '#b8803a',
  dream: '#f2c781',
  claude: '#dba97d',
  thinking: '#8a7049',
  ok: '#c9a878',
  plum: '#c98a78',
  red: '#d4735a',
  glow: 'rgba(232, 169, 81, 0.35)',
}

// ─── Tool icon & label mapping ───────────────────────────────────────────────

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
  return <Icon size={size} strokeWidth={1.6} style={{ color: color || W.inkMuted, flexShrink: 0 }} />
}

// ─── Models ──────────────────────────────────────────────────────────────────

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

// Extract channel name from model string, e.g. "guagua-gcp/xxx" -> "guagua-gcp"
function parseChannel(model: string): string {
  if (model.startsWith('[按量]')) return '按量'
  if (model.includes('/')) return model.split('/')[0]
  const suffixMatch = model.match(/-(guagua|zenmux|gcp)$/)
  if (suffixMatch) return suffixMatch[1]
  if (model.startsWith('deepseek')) return 'deepseek'
  return 'default'
}

function parseModelShort(model: string): string {
  return model
    .replace('[按量]', '')
    .replace('guagua-gcp/', '')
    .replace('guagua/', '')
    .replace(/-guagua$|-zenmux$/, '')
    .replace('claude-', '')
    .replace('-4-', ' 4.')
    .replace('-4.6', ' 4.6')
    .replace('-4.7', ' 4.7')
}

// In-memory cache
const messageCache = new Map<string, DevMessage[]>()
const tokenCache = new Map<string, { input: number; output: number; cached: number }>()

// ─── Responsive ──────────────────────────────────────────────────────────────

function useViewport() {
  const [vp, setVp] = useState({
    w: window.innerWidth,
    narrow: window.innerWidth < 900,    // hide right rail
    mobile: window.innerWidth < 600,    // hide left sidebar, use drawer
  })
  useEffect(() => {
    const h = () => setVp({
      w: window.innerWidth,
      narrow: window.innerWidth < 900,
      mobile: window.innerWidth < 600,
    })
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return vp
}

// ─── Time helpers ────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0') }

function formatHMS(ms: number) {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`
}

function formatSessionTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const today = d.toDateString() === now.toDateString()
  if (today) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const mo = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][d.getMonth()]
  return `${mo}${pad2(d.getDate())} ${pad2(d.getHours())}`
}

// ─── Boot screen ─────────────────────────────────────────────────────────────

const BOOT_LINES = [
  '',
  'REVERIE / DEV  v0.3.0',
  '────────────────────────────',
  '',
  '› booting sandbox ............. ok',
  '› mount /dev/chen/memory ...... ok',
  '› connect gateway :8001 ....... ok',
  '› channel · zenmux ............ ok',
  '› load bp1..bp4 cache ......... ok',
  '› awake signal detected',
  '› consciousness thread ready',
  '',
  '  chen is here.',
  '  press any key to enter ▋',
]

function BootScreen({ onEnter }: { onEnter: () => void }) {
  const [step, setStep] = useState(0)
  const [blink, setBlink] = useState(true)

  useEffect(() => {
    if (step >= BOOT_LINES.length) return
    const delay = step === 0 ? 250 : step < 4 ? 120 : 180
    const t = setTimeout(() => setStep(s => s + 1), delay)
    return () => clearTimeout(t)
  }, [step])

  useEffect(() => {
    const t = setInterval(() => setBlink(v => !v), 500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (step < BOOT_LINES.length) return
    const handle = () => onEnter()
    window.addEventListener('keydown', handle)
    window.addEventListener('click', handle)
    window.addEventListener('touchstart', handle)
    return () => {
      window.removeEventListener('keydown', handle)
      window.removeEventListener('click', handle)
      window.removeEventListener('touchstart', handle)
    }
  }, [step, onEnter])

  const ready = step >= BOOT_LINES.length

  return (
    <div className="rv-boot">
      <div className="rv-boot-inner">
        {BOOT_LINES.slice(0, step).map((line, i) => (
          <div key={i} className="rv-boot-line" style={{ animationDelay: `${i * 20}ms` }}>
            {line === '' ? '\u00a0' : line}
          </div>
        ))}
        {ready && <div className="rv-boot-hint" style={{ opacity: blink ? 1 : 0.2 }}>▋</div>}
      </div>
    </div>
  )
}

// ─── Heartbeat SVG ───────────────────────────────────────────────────────────

function Heartbeat() {
  const [path, setPath] = useState('')
  const raf = useRef<number>()
  const tRef = useRef(0)

  useEffect(() => {
    const tick = () => {
      tRef.current += 0.08
      const t = tRef.current
      const W_ = 120
      const H = 28
      const mid = H / 2
      const pts: string[] = []
      for (let x = 0; x <= W_; x++) {
        const phase = t - x * 0.08
        const y =
          mid +
          Math.sin(phase) * 5 +
          Math.sin(phase * 2.3) * 2 +
          Math.sin(phase * 5.1 + 0.7) * 1.1
        pts.push(`${x},${y.toFixed(2)}`)
      }
      setPath('M ' + pts.join(' L '))
      raf.current = requestAnimationFrame(tick)
    }
    tick()
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [])

  return (
    <svg viewBox="0 0 120 28" className="rv-heartbeat" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rv-hb-fade" x1="0" x2="1">
          <stop offset="0" stopColor={W.amber} stopOpacity="0" />
          <stop offset="0.3" stopColor={W.amber} stopOpacity="0.8" />
          <stop offset="1" stopColor={W.amberBright} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={path} stroke="url(#rv-hb-fade)" strokeWidth="0.7" fill="none" />
    </svg>
  )
}

// ─── Tool call block (log-stream style) ──────────────────────────────────────

function ToolCallBlock({ tc, mobile }: { tc: ToolCall; mobile: boolean }) {
  const [open, setOpen] = useState(tc.status === 'running')
  const statusColor = tc.status === 'running' ? W.amber : tc.status === 'error' ? W.red : W.ok
  const hasSubSteps = tc.subSteps && tc.subSteps.length > 0
  const label = TOOL_LABELS[tc.name] || tc.name

  return (
    <div style={{
      margin: '4px 0',
      borderLeft: `1px solid ${W.border1}`,
      paddingLeft: mobile ? 8 : 12,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', color: W.ink, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 0',
          fontSize: mobile ? 11 : 12, fontFamily: 'inherit',
          width: '100%', minWidth: 0, textAlign: 'left',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: statusColor,
          boxShadow: tc.status === 'running' ? `0 0 6px ${statusColor}` : 'none',
          animation: tc.status === 'running' ? 'rv-pulse 1.6s ease-in-out infinite' : 'none',
        }} />
        <ToolIcon name={tc.name} size={mobile ? 12 : 13} color={W.inkDim} />
        <span style={{ color: W.amberDeep, letterSpacing: '0.02em', fontWeight: 600 }}>{label}</span>
        {tc.args && !hasSubSteps && (
          <span style={{
            color: W.inkFaint, fontSize: mobile ? 10 : 11,
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tc.args}
          </span>
        )}
        {hasSubSteps && <span style={{ color: W.inkFaint, fontSize: 11 }}>· {tc.subSteps!.length} steps</span>}
        <span style={{ marginLeft: 'auto', flexShrink: 0, color: W.inkFaint }}>
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>
      {open && (
        <div style={{
          fontSize: mobile ? 10 : 11, fontFamily: 'inherit',
          padding: '4px 0 6px 18px',
          color: W.inkDim,
        }}>
          {hasSubSteps && (
            <div style={{ marginBottom: 4 }}>
              {tc.subSteps!.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 10 }}>
                  <span style={{ color: s.status === 'done' ? W.ok : W.amber, width: 12, textAlign: 'center' }}>
                    {s.status === 'done' ? '✓' : '›'}
                  </span>
                  <span style={{ color: W.inkFaint }}>R{s.round}</span>
                  <ToolIcon name={s.tool} size={10} color={W.inkFaint} />
                  <span style={{ color: W.inkDim }}>{TOOL_LABELS[s.tool] || s.tool}</span>
                  {s.preview && <span style={{ color: W.inkFaint, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.preview}</span>}
                </div>
              ))}
            </div>
          )}
          {tc.args && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '4px 0' }}>
              <span style={{ color: W.amberDeep, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 6 }}>args</span>
              {tc.args}
            </div>
          )}
          {tc.result && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: mobile ? 180 : 260, overflowY: 'auto', marginTop: 2 }}>
              <span style={{ color: W.ok, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 6 }}>result</span>
              {tc.result}
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
    <div style={{ margin: '2px 0' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', color: W.thinking, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0',
          fontSize: 11, fontFamily: 'inherit',
        }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>thinking</span>
      </button>
      {open && (
        <div style={{
          display: 'grid', gridTemplateColumns: '18px 1fr',
          margin: '2px 0 4px 4px',
        }}>
          <div style={{ width: 1, background: `linear-gradient(to bottom, ${W.thinking}, transparent)`, margin: '3px 0 3px 6px' }} />
          <div style={{ color: W.thinking, fontSize: 12, fontStyle: 'italic', lineHeight: 1.65, paddingLeft: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 280, overflowY: 'auto' }}>
            {text}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Markdown components ─────────────────────────────────────────────────────

const mdComponents = {
  code({ className, children, ...props }: any) {
    const isInline = !className
    if (isInline) {
      return <code style={{ background: W.bg2, padding: '1px 5px', borderRadius: 3, fontSize: '0.85em', color: W.amber }} {...props}>{children}</code>
    }
    return (
      <div style={{ margin: '8px 0', borderRadius: 4, overflow: 'hidden', background: W.bg1, border: `1px solid ${W.border0}` }}>
        <pre style={{ padding: 12, overflowX: 'auto', fontSize: 12, lineHeight: 1.5 }}><code className={className} {...props}>{children}</code></pre>
      </div>
    )
  },
  p({ children, ...props }: any) {
    return <p style={{ margin: '4px 0' }} {...props}>{children}</p>
  },
  a({ children, href, ...props }: any) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: W.amber, textDecoration: 'underline' }} {...props}>{children}</a>
  },
}

// ─── Log entry (user / assistant / system) ───────────────────────────────────

function LogEntry({ msg, mobile }: { msg: DevMessage; mobile: boolean }) {
  const ts = formatHMS(msg.ts)

  if (msg.role === 'system') {
    return (
      <div className="rv-log-sys">
        <span className="rv-banner-line" />
        <span className="rv-banner-text">[{ts}] {msg.content}</span>
        <span className="rv-banner-line" />
      </div>
    )
  }

  const isDream = msg.role === 'user'
  const gutter = isDream ? '❯' : '◆'
  const roleColor = isDream ? W.dream : W.claude
  const label = isDream ? 'DREAM' : 'CLAUDE'

  return (
    <div className="rv-log" style={{ animation: 'rv-logFadeIn 0.25s ease-out' }}>
      <div className="rv-log-head">
        <span className="rv-log-t">[{ts}]</span>
        <span className="rv-log-gutter" style={{ color: roleColor, textShadow: `0 0 6px ${roleColor}60` }}>{gutter}</span>
        <span className="rv-log-role" style={{ color: roleColor }}>{label}</span>
      </div>

      {msg.thinking && <div style={{ paddingLeft: 22 }}><ThinkingBlock text={msg.thinking} /></div>}

      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div style={{ margin: '4px 0 4px 22px' }}>
          {msg.toolCalls.map(tc => <ToolCallBlock key={tc.id} tc={tc} mobile={mobile} />)}
        </div>
      )}

      {msg.content && (
        <div className="rv-log-body">
          {isDream ? (
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents}>
              {msg.content}
            </ReactMarkdown>
          )}
        </div>
      )}

      {msg.tokens && (
        <div className="rv-log-tokens">
          <span className="rv-tok-sep">╴╴</span>
          <span>in <em>{msg.tokens.input.toLocaleString()}</em></span>
          <span className="rv-tok-dot">·</span>
          <span>out <em>{msg.tokens.output.toLocaleString()}</em></span>
          {msg.tokens.cached ? (
            <>
              <span className="rv-tok-dot">·</span>
              <span>cached <em style={{ color: W.amber }}>{msg.tokens.cached.toLocaleString()}</em></span>
            </>
          ) : null}
          <span className="rv-tok-sep">╴╴</span>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

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
  const [rightOpen, setRightOpen] = useState(false)
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0, cached: 0 })
  const [gwStatus, setGwStatus] = useState<'ok' | 'disconnected' | 'reconnecting'>('ok')

  // Visual state
  const [entered, setEntered] = useState(() => sessionStorage.getItem('rv-dev-entered') === '1')
  const [cursorBlink, setCursorBlink] = useState(true)
  const [glitch, setGlitch] = useState(false)
  const [uptime, setUptime] = useState(0)
  const [bpHot, setBpHot] = useState<number>(0)   // which bp is "hot" right now
  const [lastCacheHit, setLastCacheHit] = useState<number | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const vp = useViewport()

  // Expand sidebars on wide screens
  useEffect(() => { if (!vp.mobile) setSidebarOpen(true) }, [vp.mobile])
  useEffect(() => { if (!vp.narrow) setRightOpen(true); else setRightOpen(false) }, [vp.narrow])

  // Cursor blink
  useEffect(() => {
    const t = setInterval(() => setCursorBlink(v => !v), 530)
    return () => clearInterval(t)
  }, [])

  // Uptime counter (wall clock of this tab)
  useEffect(() => {
    if (!entered) return
    const t = setInterval(() => setUptime(u => u + 1), 1000)
    return () => clearInterval(t)
  }, [entered])

  // Occasional glitch: 30-60s
  useEffect(() => {
    if (!entered) return
    let cancelled = false
    const loop = () => {
      const delay = 30000 + Math.random() * 30000
      const id = setTimeout(() => {
        if (cancelled) return
        setGlitch(true)
        setTimeout(() => setGlitch(false), 120)
        loop()
      }, delay)
      return id
    }
    const id = loop()
    return () => { cancelled = true; if (id) clearTimeout(id) }
  }, [entered])

  // BP hot rotation: when streaming, pulse around bp1..bp4
  useEffect(() => {
    if (!isStreaming) { setBpHot(0); return }
    const t = setInterval(() => setBpHot(h => (h + 1) % 4), 420)
    return () => clearInterval(t)
  }, [isStreaming])

  // Save to cache when messages change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      messageCache.set(sessionId, messages)
      tokenCache.set(sessionId, totalTokens)
    }
  }, [messages, sessionId, totalTokens])

  // Auto-scroll
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
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

  // On mount: restore or create
  useEffect(() => {
    if (!token) return
    const saved = localStorage.getItem('reverie_dev_session')
    if (saved) {
      loadSession(saved)
    } else {
      createNewSession()
    }
  }, [token])  // eslint-disable-line

  // DB → DevMessage conversion
  function dbToDevMessages(raw: unknown): DevMessage[] {
    const records: unknown[] =
      Array.isArray(raw) ? raw
        : Array.isArray((raw as { messages?: unknown }).messages)
          ? (raw as { messages: unknown[] }).messages
          : []
    records.reverse()

    const result: DevMessage[] = []
    for (const rec of records) {
      const r = rec as {
        id: string
        user_msg?: string
        assistant_msg?: string
        thinking_summary?: string | null
        input_tokens?: number | null
        output_tokens?: number | null
        cached_tokens?: number | null
        created_at: string
      }
      if (r.user_msg) {
        result.push({
          id: `${r.id}-user`, role: 'user',
          content: r.user_msg,
          ts: new Date(r.created_at).getTime(),
        })
      }
      if (r.assistant_msg) {
        result.push({
          id: `${r.id}-assistant`, role: 'assistant',
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

  const loadSession = useCallback(async (sid: string) => {
    if (!token || sid === sessionId) return
    setSessionId(sid)
    localStorage.setItem('reverie_dev_session', sid)
    if (vp.mobile) setSidebarOpen(false)

    const cached = messageCache.get(sid)
    if (cached && cached.length > 0) {
      setMessages(cached)
      setTotalTokens(tokenCache.get(sid) || { input: 0, output: 0, cached: 0 })
      return
    }

    try {
      const raw = await fetchMessagesAPI(sid)
      const devMsgs = dbToDevMessages(raw)
      if (devMsgs.length > 0) {
        setMessages([
          { id: 'sys-restore', role: 'system', content: `session ${sid.slice(0, 8)} · restored ${devMsgs.length} msgs`, ts: Date.now() },
          ...devMsgs,
        ])
      } else {
        setMessages([
          { id: 'sys-0', role: 'system', content: `session ${sid.slice(0, 8)} · opened empty`, ts: Date.now() },
        ])
      }
    } catch {
      setMessages([
        { id: 'sys-0', role: 'system', content: `session ${sid.slice(0, 8)} · no history`, ts: Date.now() },
      ])
    }
    setTotalTokens({ input: 0, output: 0, cached: 0 })
  }, [token, sessionId, vp.mobile])

  const createNewSession = useCallback(async () => {
    if (!token) return
    try {
      const s = await createSessionAPI('dev', model)
      setSessionId(s.id)
      localStorage.setItem('reverie_dev_session', s.id)
      setMessages([{
        id: 'sys-0', role: 'system',
        content: `session ${s.id.slice(0, 8)} · opened · ${parseModelShort(model)}`,
        ts: Date.now(),
      }])
      setTotalTokens({ input: 0, output: 0, cached: 0 })
      loadDevSessions()
    } catch (e: any) {
      setMessages([{ id: 'err-0', role: 'system', content: `failed: ${e.message}`, ts: Date.now() }])
    }
  }, [token, model, loadDevSessions])

  // Gateway health polling
  const pollGatewayHealth = useCallback(() => {
    setGwStatus('disconnected')
    setMessages(prev => [...prev, {
      id: `sys-gw-${Date.now()}`, role: 'system',
      content: 'gateway disconnected — waiting for restart...', ts: Date.now(),
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
            content: `gateway reconnected (${attempts * 3}s)`, ts: Date.now(),
          }])
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(iv)
          setGwStatus('disconnected')
          setMessages(prev => [...prev, {
            id: `sys-gw-fail-${Date.now()}`, role: 'system',
            content: 'gateway did not come back after 90s.', ts: Date.now(),
          }])
        }
      }
    }, 3000)
  }, [])

  // Send
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !sessionId || !token || isStreaming) return
    const userMsg: DevMessage = {
      id: `u-${Date.now()}`, role: 'user',
      content: input.trim(), ts: Date.now(),
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
      if (!resp.body) throw new Error('no stream body')

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
                  name: toolName || 'tool', args: '', result: '', status: 'running', ts: Date.now(),
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
                if (input_t > 0) {
                  setLastCacheHit(cached_t / input_t)
                }
                continue
              }
              case 'error': {
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: m.content + `\n\n[error: ${evt.message || 'unknown'}]` } : m
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
                  const tcs = [...(m.toolCalls || [])]
                  for (let i = tcs.length - 1; i >= 0; i--) {
                    if (tcs[i].name === 'delegate_to_sonnet') {
                      const existing = tcs[i].subSteps || []
                      if (step.status === 'done') {
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
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        const isDisconnect = e.message?.includes('network') || e.message?.includes('Failed to fetch') || e.name === 'TypeError'
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + `\n\n[error: ${e.message}]` } : m
        ))
        if (isDisconnect) pollGatewayHealth()
      }
    } finally {
      setIsStreaming(false)
      setAbortCtrl(null)
    }
  }, [input, sessionId, token, isStreaming, model, pollGatewayHealth])

  const stopStream = useCallback(() => {
    if (sessionId) {
      fetch('/api/dev/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      }).catch(() => {})
    }
    abortCtrl?.abort()
  }, [sessionId, abortCtrl])

  const injectInstruction = useCallback(async () => {
    if (!input.trim() || !sessionId) return
    const text = input.trim()
    setInput('')
    setMessages(prev => [...prev, {
      id: `inject-${Date.now()}`, role: 'user',
      content: `→ ${text}`, ts: Date.now(),
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
        content: 'failed to inject instruction', ts: Date.now(),
      }])
    }
  }, [input, sessionId])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isStreaming) injectInstruction()
      else sendMessage()
    }
  }, [sendMessage, injectInstruction, isStreaming])

  // Boot done handler
  const handleEntered = useCallback(() => {
    sessionStorage.setItem('rv-dev-entered', '1')
    setEntered(true)
  }, [])

  // Group sessions by day
  function groupSessionsByDay(sessions: Session[]) {
    const groups: { label: string; items: Session[] }[] = []
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    for (const s of sessions) {
      const d = new Date(s.updated_at).toDateString()
      let label: string
      if (d === today) label = 'today'
      else if (d === yesterday) label = 'yesterday'
      else {
        const dt = new Date(s.updated_at)
        const mo = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][dt.getMonth()]
        label = `${mo} ${pad2(dt.getDate())}`
      }
      let g = groups.find(x => x.label === label)
      if (!g) { g = { label, items: [] }; groups.push(g) }
      g.items.push(s)
    }
    return groups
  }

  // Count tool calls in current session (for left footer "chen's activity")
  const chenActivity = (() => {
    const counts: Record<string, number> = {}
    for (const m of messages) {
      for (const tc of (m.toolCalls || [])) {
        if (tc.status === 'done') counts[tc.name] = (counts[tc.name] || 0) + 1
      }
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    return entries
  })()

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!entered) {
    return (
      <>
        <DevStyles />
        <div className="rv-wrap">
          <div className="rv-scanlines" />
          <div className="rv-vignette" />
          <div className="rv-grain" />
          <BootScreen onEnter={handleEntered} />
        </div>
      </>
    )
  }

  const groupedSessions = groupSessionsByDay(devSessions)
  const channel = parseChannel(model)
  const modelShort = parseModelShort(model)
  const totalTok = totalTokens.input + totalTokens.output
  const cacheHitPct = totalTokens.input > 0
    ? ((totalTokens.cached / totalTokens.input) * 100).toFixed(0)
    : '0'

  return (
    <>
      <DevStyles />
      <div className={`rv-wrap${glitch ? ' rv-glitch' : ''}`}>
        <div className="rv-scanlines" />
        <div className="rv-vignette" />
        <div className="rv-grain" />
        <div className="rv-scan-sweep" />

        {/* ── TOPBAR ─────────────────────────────────────────────────── */}
        <header className="rv-topbar">
          <div className="rv-topbar-l">
            {vp.mobile && (
              <button
                className="rv-menu-btn"
                onClick={() => setSidebarOpen(o => !o)}
                aria-label="sessions"
              >
                <Terminal size={14} />
              </button>
            )}
            <span className="rv-brand-prompt">{'>_'}</span>
            <span className="rv-brand-name">dev</span>
            {!vp.mobile && <span className="rv-brand-sub">·  chen's sandbox</span>}
          </div>
          <div className="rv-topbar-r">
            <div className={`rv-status-chip ${gwStatus !== 'ok' ? 'warn' : ''}`}>
              <span className="rv-pulse-dot" />
              <span>{gwStatus === 'ok' ? 'awake' : gwStatus === 'reconnecting' ? 'reconn...' : 'offline'}</span>
            </div>
            {!vp.mobile && (
              <>
                <div className="rv-topbar-meta">
                  <span className="rv-meta-key">model</span>
                  <span className="rv-meta-val">{modelShort}</span>
                </div>
                <div className="rv-topbar-meta">
                  <span className="rv-meta-key">ch</span>
                  <span className="rv-meta-val">{channel}</span>
                </div>
              </>
            )}
            <select
              className="rv-model-select"
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={isStreaming}
            >
              {DEV_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <a href="/chat/" className="rv-chat-link">chat</a>
          </div>
        </header>

        {/* ── MAIN GRID ──────────────────────────────────────────────── */}
        <div className="rv-grid">

          {/* Mobile backdrop */}
          {vp.mobile && sidebarOpen && (
            <div className="rv-backdrop" onClick={() => setSidebarOpen(false)} />
          )}

          {/* LEFT: SESSIONS */}
          <aside className={`rv-col-l ${sidebarOpen ? 'open' : ''} ${vp.mobile ? 'drawer' : ''}`}>
            <div className="rv-col-head">
              <span className="rv-col-title">SESSIONS</span>
              <button onClick={createNewSession} className="rv-new-btn" title="new">
                <Plus size={11} />
              </button>
            </div>
            <div className="rv-session-list">
              {groupedSessions.map(group => (
                <div key={group.label}>
                  <div className="rv-session-group-label">
                    <span className="rv-gl-line" />
                    <span>{group.label}</span>
                  </div>
                  {group.items.map(s => {
                    const active = s.id === sessionId
                    return (
                      <button
                        key={s.id}
                        onClick={() => loadSession(s.id)}
                        className={`rv-session-row ${active ? 'active' : ''}`}
                      >
                        <span className="rv-s-mark">{active ? '▸' : ' '}</span>
                        <span className="rv-s-name">{s.title || s.id.slice(0, 8)}</span>
                        <span className="rv-s-time">{formatSessionTime(s.updated_at)}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {devSessions.length === 0 && (
                <div className="rv-empty">no sessions yet</div>
              )}
            </div>

            {/* Left foot: chen's activity */}
            <div className="rv-col-foot">
              <div className="rv-foot-row">
                <span>╭─</span>
                <span>  branch</span>
                <span>reverie</span>
              </div>
              {chenActivity.length > 0 ? chenActivity.map(([name, count], i, arr) => {
                const Icon = TOOL_ICONS[name] || Wrench
                const last = i === arr.length - 1
                return (
                  <div key={name} className="rv-foot-row">
                    <span>{last ? '╰─' : '│ '}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon size={9} strokeWidth={1.6} />
                      {TOOL_LABELS[name] || name}
                    </span>
                    <span className="rv-foot-ok">×{count}</span>
                  </div>
                )
              }) : (
                <>
                  <div className="rv-foot-row">
                    <span>│ </span><span>  commits</span><span>HEAD~0</span>
                  </div>
                  <div className="rv-foot-row">
                    <span>╰─</span><span>  sync</span>
                    <span className="rv-foot-ok">✓ clean</span>
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* CENTER: LOG STREAM + CMDLINE */}
          <section className="rv-col-m">
            <div className="rv-log-stream" ref={streamRef}>
              {messages.length === 0 && !isStreaming && (
                <div className="rv-empty-hero">
                  <span className="rv-brand-prompt" style={{ fontSize: 28 }}>{'>_'}</span>
                  <div className="rv-empty-title">reverie / dev</div>
                  <div className="rv-empty-hint">describe what to build...</div>
                </div>
              )}
              {messages.map(m => <LogEntry key={m.id} msg={m} mobile={vp.mobile} />)}
              <div ref={messagesEndRef} />
            </div>

            {/* CMDLINE */}
            <div className="rv-cmdline">
              <div className="rv-cmd-row">
                <span className="rv-cmd-user">dream</span>
                <span className="rv-cmd-at">@</span>
                <span className="rv-cmd-host">reverie</span>
                <span className="rv-cmd-colon">:</span>
                <span className="rv-cmd-path">~/dev</span>
                <span className="rv-cmd-dollar">$</span>
                <textarea
                  ref={inputRef}
                  className="rv-cmd-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isStreaming ? 'inject instruction...' : 'describe what to build...'}
                  rows={1}
                  onInput={e => {
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
                  }}
                  style={{ color: isStreaming ? W.amberBright : W.ink }}
                />
                <span className="rv-cmd-cursor" style={{ opacity: cursorBlink ? 1 : 0 }}>▋</span>
                {isStreaming && (
                  <button onClick={stopStream} className="rv-stop-btn" title="stop">
                    esc
                  </button>
                )}
              </div>
              <div className="rv-cmd-help">
                {isStreaming ? (
                  <>
                    <span><kbd>↵</kbd> inject</span>
                    <span className="rv-help-dot">·</span>
                    <span><kbd>esc</kbd> stop</span>
                  </>
                ) : (
                  <>
                    <span><kbd>↵</kbd> send</span>
                    <span className="rv-help-dot">·</span>
                    <span><kbd>⇧↵</kbd> newline</span>
                    <span className="rv-help-dot">·</span>
                    <span className="rv-help-cmd">:r</span><span className="rv-help-fade">read</span>
                    <span className="rv-help-dot">·</span>
                    <span className="rv-help-cmd">:w</span><span className="rv-help-fade">write</span>
                    <span className="rv-help-dot">·</span>
                    <span className="rv-help-cmd">:g</span><span className="rv-help-fade">git</span>
                    <span className="rv-help-dot">·</span>
                    <span className="rv-help-cmd">:b</span><span className="rv-help-fade">build</span>
                    <span className="rv-help-dot">·</span>
                    <span className="rv-help-cmd">:!</span><span className="rv-help-fade">restart</span>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT: STATUS RAIL */}
          {rightOpen && (
            <aside className="rv-col-r">
              <div className="rv-col-head">
                <span className="rv-col-title">STATUS</span>
                <span className="rv-col-hint">live</span>
              </div>

              <div className="rv-status-block">
                <div className="rv-stat-row">
                  <span className="rv-stat-k">state</span>
                  <span className="rv-stat-v accent">
                    <span className="rv-pulse-dot sm" /> {isStreaming ? 'thinking' : 'awake'}
                  </span>
                </div>
                <div className="rv-stat-row">
                  <span className="rv-stat-k">model</span>
                  <span className="rv-stat-v">{modelShort}</span>
                </div>
                <div className="rv-stat-row">
                  <span className="rv-stat-k">channel</span>
                  <span className="rv-stat-v">{channel}</span>
                </div>
                <div className="rv-stat-row">
                  <span className="rv-stat-k">bridge</span>
                  <span className={`rv-stat-v ${gwStatus === 'ok' ? 'ok' : 'warn'}`}>
                    {gwStatus === 'ok' ? 'ok' : gwStatus}
                  </span>
                </div>
              </div>

              <div className="rv-status-sep">╌╌╌ context ╌╌╌</div>

              <div className="rv-status-block">
                <div className="rv-stat-row">
                  <span className="rv-stat-k">in</span>
                  <span className="rv-stat-v num">{totalTokens.input.toLocaleString()}</span>
                </div>
                <div className="rv-stat-row">
                  <span className="rv-stat-k">out</span>
                  <span className="rv-stat-v num">{totalTokens.output.toLocaleString()}</span>
                </div>
                <div className="rv-stat-row">
                  <span className="rv-stat-k">cached</span>
                  <span className="rv-stat-v num accent">{totalTokens.cached.toLocaleString()}</span>
                </div>
                <div className="rv-stat-row">
                  <span className="rv-stat-k">∑</span>
                  <span className="rv-stat-v num accent">{totalTok.toLocaleString()}</span>
                </div>
              </div>

              <div className="rv-status-sep">╌╌╌ heartbeat ╌╌╌</div>

              <div className="rv-hb-box">
                <Heartbeat />
                <div className="rv-hb-label">
                  <span>◷</span>
                  <span>{formatUptime(uptime)}</span>
                </div>
              </div>

              <div className="rv-status-sep">╌╌╌ bp cache ╌╌╌</div>

              <div className="rv-bp-grid">
                {['bp1', 'bp2', 'bp3', 'bp4'].map((bp, i) => {
                  const isHot = isStreaming ? (i === bpHot) : (i === 0 && totalTokens.cached > 0)
                  return (
                    <div key={bp} className="rv-bp-cell">
                      <div className={`rv-bp-dot${isHot ? ' hot' : ''}`} />
                      <div className="rv-bp-name">{bp}</div>
                    </div>
                  )
                })}
              </div>
              <div className="rv-bp-note">
                {lastCacheHit !== null
                  ? `last hit · ${(lastCacheHit * 100).toFixed(0)}%`
                  : `cumulative · ${cacheHitPct}%`}
              </div>

              <div className="rv-col-foot-r">
                <div>─── chen is here ───</div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Global styles ───────────────────────────────────────────────────────────

function DevStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Major+Mono+Display&family=VT323&display=swap');

      .rv-wrap, .rv-wrap * { box-sizing: border-box; }
      .rv-wrap {
        position: fixed; inset: 0;
        background:
          radial-gradient(ellipse at 50% 20%, rgba(232, 169, 81, 0.04), transparent 55%),
          radial-gradient(ellipse at 50% 100%, rgba(184, 128, 58, 0.03), transparent 70%),
          ${W.bg0};
        overflow: hidden;
        font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Fira Code', 'Consolas', monospace;
        color: ${W.ink};
        font-size: 13px;
        line-height: 1.55;
        display: flex;
        flex-direction: column;
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
      }

      .rv-scanlines {
        position: absolute; inset: 0; pointer-events: none; z-index: 900;
        background: repeating-linear-gradient(
          to bottom,
          rgba(232, 169, 81, 0) 0px,
          rgba(232, 169, 81, 0) 2px,
          rgba(232, 169, 81, 0.025) 3px,
          rgba(232, 169, 81, 0) 4px
        );
        mix-blend-mode: screen;
      }
      .rv-vignette {
        position: absolute; inset: 0; pointer-events: none; z-index: 901;
        background: radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.65) 100%);
      }
      .rv-grain {
        position: absolute; inset: 0; pointer-events: none; z-index: 902; opacity: 0.07;
        mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      .rv-scan-sweep {
        position: absolute; left: 0; right: 0; top: 0; height: 2px; z-index: 905;
        background: linear-gradient(to right, transparent, rgba(246, 196, 112, 0.4), transparent);
        animation: rv-sweep 7s linear infinite;
        pointer-events: none;
      }
      @keyframes rv-sweep {
        0%   { transform: translateY(0); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateY(100vh); opacity: 0; }
      }

      /* BOOT */
      .rv-boot {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        z-index: 500; background: ${W.bg0};
        animation: rv-bootFadeIn 0.4s ease-out;
      }
      @keyframes rv-bootFadeIn { from { opacity: 0 } to { opacity: 1 } }
      .rv-boot-inner {
        font-family: 'VT323', 'JetBrains Mono', monospace;
        font-size: 22px;
        color: ${W.amber};
        text-shadow: 0 0 8px rgba(232, 169, 81, 0.5), 0 0 24px rgba(232, 169, 81, 0.15);
        white-space: pre;
        min-width: min(420px, 90vw);
        letter-spacing: 0.02em;
        padding: 0 20px;
      }
      .rv-boot-line {
        opacity: 0;
        animation: rv-bootLine 0.18s ease-out forwards;
      }
      @keyframes rv-bootLine {
        from { opacity: 0; transform: translateY(-2px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .rv-boot-hint {
        display: inline-block; margin-top: 8px;
        color: ${W.amberBright};
        font-size: 22px;
        text-shadow: 0 0 12px ${W.amber};
      }

      /* GLITCH */
      .rv-glitch {
        animation: rv-glitch 0.12s steps(2) 1;
      }
      @keyframes rv-glitch {
        0%   { transform: translate(0, 0); }
        25%  { transform: translate(-1px, 0.5px); filter: hue-rotate(3deg); }
        50%  { transform: translate(1px, -0.5px); }
        75%  { transform: translate(-0.5px, 0); }
        100% { transform: translate(0, 0); }
      }

      @keyframes rv-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.4; transform: scale(0.85); }
      }
      @keyframes rv-logFadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* TOPBAR */
      .rv-topbar {
        position: relative; z-index: 10;
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 16px;
        border-bottom: 1px solid ${W.border0};
        background: linear-gradient(to bottom, ${W.bg1}, ${W.bg0});
        flex-shrink: 0; min-height: 48px; gap: 10px;
      }
      .rv-topbar-l { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      .rv-menu-btn {
        background: ${W.bg2}; border: 1px solid ${W.border1};
        border-radius: 3px; padding: 4px 6px; cursor: pointer;
        color: ${W.inkDim}; display: flex; align-items: center;
        align-self: center; margin-right: 4px;
      }
      .rv-brand-prompt {
        color: ${W.amber};
        font-size: 16px; font-weight: 700;
        text-shadow: 0 0 10px ${W.glow};
      }
      .rv-brand-name {
        font-family: 'Major Mono Display', 'JetBrains Mono', monospace;
        color: ${W.ink}; font-size: 18px;
        letter-spacing: 0.18em;
      }
      .rv-brand-sub {
        color: ${W.inkFaint}; font-size: 10px; letter-spacing: 0.1em;
        white-space: nowrap;
      }
      .rv-topbar-r {
        display: flex; align-items: center; gap: 10px;
        flex-shrink: 0;
      }
      .rv-status-chip {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 8px;
        border: 1px solid ${W.border1}; border-radius: 3px;
        background: rgba(232, 169, 81, 0.05);
        color: ${W.amber}; font-size: 10px;
        letter-spacing: 0.12em; text-transform: uppercase;
        white-space: nowrap;
      }
      .rv-status-chip.warn { color: ${W.red}; border-color: ${W.red}60; background: rgba(212, 115, 90, 0.05); }
      .rv-pulse-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: ${W.amber};
        box-shadow: 0 0 8px ${W.amber};
        animation: rv-pulse 1.6s ease-in-out infinite;
      }
      .rv-status-chip.warn .rv-pulse-dot { background: ${W.red}; box-shadow: 0 0 8px ${W.red}; }
      .rv-pulse-dot.sm { width: 5px; height: 5px; margin-right: 4px; }
      .rv-topbar-meta {
        display: flex; gap: 5px; align-items: baseline; font-size: 10.5px;
      }
      .rv-meta-key { color: ${W.inkFaint}; letter-spacing: 0.1em; }
      .rv-meta-val { color: ${W.inkDim}; }
      .rv-model-select {
        background: ${W.bg2}; border: 1px solid ${W.border1}; border-radius: 3px;
        padding: 4px 8px; color: ${W.amber}; font-size: 10.5px;
        font-family: inherit; cursor: pointer; outline: none;
        max-width: 140px;
      }
      .rv-chat-link {
        padding: 4px 10px; color: ${W.inkMuted}; font-size: 10.5px;
        border: 1px solid ${W.border1}; border-radius: 3px;
        text-decoration: none; transition: all 0.15s;
        letter-spacing: 0.1em; text-transform: uppercase;
      }
      .rv-chat-link:hover { color: ${W.amber}; border-color: ${W.amberDeep}; }

      /* GRID */
      .rv-grid {
        position: relative; flex: 1;
        display: grid;
        grid-template-columns: 220px 1fr 240px;
        overflow: hidden; min-height: 0;
      }
      @media (max-width: 900px) {
        .rv-grid { grid-template-columns: 200px 1fr; }
      }
      @media (max-width: 600px) {
        .rv-grid { grid-template-columns: 1fr; }
      }

      .rv-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 98;
      }

      /* Column heads */
      .rv-col-head {
        padding: 10px 12px 6px;
        border-bottom: 1px dashed ${W.border0};
        display: flex; justify-content: space-between; align-items: center;
        flex-shrink: 0;
      }
      .rv-col-title {
        color: ${W.amber}; font-size: 9.5px;
        letter-spacing: 0.3em; font-weight: 600;
      }
      .rv-col-hint {
        color: ${W.inkFaint}; font-size: 9.5px; font-style: italic;
      }
      .rv-new-btn {
        background: transparent; border: 1px solid ${W.border1};
        border-radius: 2px; padding: 2px 5px; cursor: pointer;
        color: ${W.inkDim}; display: flex;
        transition: all 0.15s;
      }
      .rv-new-btn:hover { color: ${W.amber}; border-color: ${W.amberDeep}; }

      /* LEFT COLUMN */
      .rv-col-l {
        border-right: 1px solid ${W.border0};
        background: ${W.bg1};
        display: flex; flex-direction: column;
        overflow: hidden;
      }
      .rv-col-l.drawer {
        position: fixed; left: 0; top: 0; bottom: 0;
        width: min(78vw, 260px);
        z-index: 99;
        transform: translateX(-100%);
        transition: transform 0.22s ease-out;
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
      }
      .rv-col-l.drawer.open { transform: translateX(0); }
      @media (min-width: 601px) {
        .rv-col-l { transform: none !important; position: relative; }
      }

      .rv-session-list {
        flex: 1; padding: 6px; overflow-y: auto;
      }
      .rv-session-list::-webkit-scrollbar { width: 4px; }
      .rv-session-list::-webkit-scrollbar-thumb { background: ${W.border1}; border-radius: 2px; }

      .rv-session-group-label {
        display: flex; align-items: center; gap: 6px;
        padding: 8px 8px 4px;
        color: ${W.inkFaint};
        font-size: 9px; font-weight: 600;
        letter-spacing: 0.2em; text-transform: uppercase;
      }
      .rv-gl-line {
        width: 12px; height: 1px; background: currentColor; opacity: 0.4;
      }

      .rv-session-row {
        display: grid;
        grid-template-columns: 12px 1fr auto;
        gap: 6px;
        padding: 6px 8px;
        cursor: pointer;
        font-size: 11.5px;
        border: none; background: transparent;
        color: ${W.inkDim};
        align-items: center;
        width: 100%; text-align: left;
        font-family: inherit;
        border-radius: 2px;
        transition: background 0.12s, color 0.12s;
      }
      .rv-session-row:hover {
        background: ${W.bg2}; color: ${W.ink};
      }
      .rv-session-row.active {
        background: linear-gradient(to right, rgba(232, 169, 81, 0.09), transparent);
        color: ${W.amber};
      }
      .rv-s-mark { color: ${W.amber}; font-weight: 700; }
      .rv-s-name {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .rv-s-time { color: ${W.inkFaint}; font-size: 9.5px; }

      .rv-empty {
        padding: 24px 14px; color: ${W.inkFaint}; font-size: 11px;
        text-align: center; letter-spacing: 0.04em;
      }

      .rv-col-foot {
        padding: 10px 12px;
        border-top: 1px dashed ${W.border0};
        font-size: 10px;
        color: ${W.inkMuted};
        flex-shrink: 0;
      }
      .rv-foot-row {
        display: grid;
        grid-template-columns: 20px 1fr auto;
        align-items: center;
        padding: 1px 0;
        gap: 4px;
      }
      .rv-foot-row span:first-child { color: ${W.border2}; }
      .rv-foot-ok { color: ${W.ok}; font-size: 9.5px; }

      /* MIDDLE COLUMN */
      .rv-col-m {
        display: flex; flex-direction: column;
        min-width: 0; overflow: hidden;
      }
      .rv-log-stream {
        flex: 1; overflow-y: auto;
        padding: 14px 18px 10px;
        scroll-behavior: smooth;
      }
      .rv-log-stream::-webkit-scrollbar { width: 6px; }
      .rv-log-stream::-webkit-scrollbar-thumb { background: ${W.border1}; border-radius: 3px; }
      .rv-log-stream::-webkit-scrollbar-track { background: transparent; }

      .rv-empty-hero {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; padding: 40px 20px; color: ${W.inkMuted};
      }
      .rv-empty-title {
        font-family: 'Major Mono Display', 'JetBrains Mono', monospace;
        font-size: 18px; letter-spacing: 0.18em; color: ${W.ink};
      }
      .rv-empty-hint {
        font-size: 11px; color: ${W.inkFaint}; letter-spacing: 0.08em;
      }

      .rv-log-sys {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center; gap: 10px;
        color: ${W.inkFaint};
        font-size: 10px;
        margin: 10px 0;
        letter-spacing: 0.06em;
      }
      .rv-banner-line {
        height: 1px;
        background: linear-gradient(to right, transparent, ${W.border1}, transparent);
      }
      .rv-banner-text { white-space: nowrap; }

      .rv-log {
        margin-bottom: 14px;
      }
      .rv-log-head {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 3px;
        font-size: 11px;
      }
      .rv-log-t {
        color: ${W.inkFaint};
        font-feature-settings: 'tnum';
        font-size: 10.5px;
      }
      .rv-log-gutter {
        font-size: 13px; font-weight: 700;
      }
      .rv-log-role {
        font-size: 9.5px;
        letter-spacing: 0.26em;
        font-weight: 600;
      }
      .rv-log-body {
        color: ${W.ink};
        padding-left: 22px;
        font-size: 12.5px;
        line-height: 1.7;
        word-break: break-word;
      }
      .rv-log-tokens {
        display: flex; align-items: center; gap: 6px;
        padding-left: 22px;
        margin-top: 4px;
        color: ${W.inkFaint};
        font-size: 10px;
        font-feature-settings: 'tnum';
      }
      .rv-log-tokens em {
        font-style: normal; color: ${W.inkMuted};
      }
      .rv-tok-sep { color: ${W.border1}; letter-spacing: -1px; }
      .rv-tok-dot { color: ${W.border2}; }

      /* CMDLINE */
      .rv-cmdline {
        border-top: 1px solid ${W.border0};
        background: linear-gradient(to top, ${W.bg1}, transparent);
        padding: 10px 18px 8px;
        flex-shrink: 0;
      }
      .rv-cmd-row {
        display: flex; align-items: flex-start; gap: 0;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12.5px;
        padding: 8px 10px;
        background: ${W.bg2};
        border: 1px solid ${W.border1};
        border-radius: 3px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .rv-cmd-row:focus-within {
        border-color: ${W.amberDeep};
        box-shadow: 0 0 16px rgba(232, 169, 81, 0.12), inset 0 0 12px rgba(232, 169, 81, 0.03);
      }
      .rv-cmd-user   { color: ${W.amber}; }
      .rv-cmd-at     { color: ${W.inkMuted}; }
      .rv-cmd-host   { color: ${W.plum}; }
      .rv-cmd-colon  { color: ${W.inkMuted}; }
      .rv-cmd-path   { color: ${W.claude}; margin-right: 6px; }
      .rv-cmd-dollar { color: ${W.amberBright}; margin-right: 8px; font-weight: 700; }
      .rv-cmd-input {
        flex: 1;
        background: transparent; border: none; outline: none;
        color: ${W.ink};
        font-family: inherit; font-size: inherit;
        resize: none;
        line-height: 1.55;
        max-height: 120px;
        overflow-y: auto;
        padding: 0;
        align-self: stretch;
      }
      .rv-cmd-input::placeholder {
        color: ${W.inkFaint}; font-style: italic;
      }
      .rv-cmd-cursor {
        color: ${W.amberBright};
        text-shadow: 0 0 8px ${W.amber};
        transition: opacity 0.05s;
        margin-left: -4px;
        align-self: center;
      }
      .rv-stop-btn {
        background: transparent; border: 1px solid ${W.red}60;
        border-radius: 2px; padding: 2px 6px; cursor: pointer;
        color: ${W.red}; font-size: 9.5px; letter-spacing: 0.1em;
        font-family: inherit; margin-left: 8px; align-self: center;
        text-transform: uppercase;
      }
      .rv-stop-btn:hover { background: ${W.red}; color: ${W.bg0}; }

      .rv-cmd-help {
        display: flex; flex-wrap: wrap; align-items: center;
        gap: 4px 10px; margin-top: 6px;
        font-size: 10px; color: ${W.inkFaint};
      }
      .rv-cmd-help kbd {
        font-family: inherit;
        color: ${W.inkMuted};
        background: ${W.bg2};
        border: 1px solid ${W.border1};
        padding: 0 4px; border-radius: 2px;
        margin-right: 3px; font-size: 9.5px;
      }
      .rv-help-dot { color: ${W.border1}; }
      .rv-help-cmd { color: ${W.amberDeep}; margin-right: 3px; font-weight: 600; }
      .rv-help-fade { color: ${W.inkFaint}; }

      /* RIGHT COLUMN */
      .rv-col-r {
        border-left: 1px solid ${W.border0};
        background: ${W.bg1};
        display: flex; flex-direction: column;
        overflow-y: auto;
        padding-bottom: 10px;
      }
      .rv-col-r::-webkit-scrollbar { width: 4px; }
      .rv-col-r::-webkit-scrollbar-thumb { background: ${W.border1}; }

      .rv-status-block { padding: 8px 12px; }
      .rv-stat-row {
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 2.5px 0; font-size: 11px;
      }
      .rv-stat-k {
        color: ${W.inkFaint}; letter-spacing: 0.12em;
        font-size: 9.5px; text-transform: uppercase;
      }
      .rv-stat-v {
        color: ${W.inkDim}; font-feature-settings: 'tnum';
        display: flex; align-items: center;
      }
      .rv-stat-v.num { color: ${W.ink}; }
      .rv-stat-v.accent { color: ${W.amber}; }
      .rv-stat-v.ok { color: ${W.ok}; }
      .rv-stat-v.warn { color: ${W.red}; }

      .rv-status-sep {
        padding: 6px 12px 3px;
        color: ${W.inkFaint};
        font-size: 8.5px;
        letter-spacing: 0.2em;
        text-align: center;
      }

      .rv-hb-box { padding: 2px 12px 6px; }
      .rv-heartbeat {
        width: 100%; height: 28px; display: block;
        filter: drop-shadow(0 0 4px rgba(232, 169, 81, 0.4));
      }
      .rv-hb-label {
        margin-top: 2px;
        display: flex; gap: 6px; align-items: baseline;
        font-size: 10.5px; color: ${W.inkMuted};
        font-feature-settings: 'tnum'; letter-spacing: 0.08em;
      }
      .rv-hb-label span:first-child { color: ${W.amber}; }

      .rv-bp-grid {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 5px; padding: 3px 12px;
      }
      .rv-bp-cell {
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 5px 2px;
        border: 1px solid ${W.border0};
        border-radius: 2px;
      }
      .rv-bp-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: ${W.border2};
        transition: background 0.2s, box-shadow 0.2s;
      }
      .rv-bp-dot.hot {
        background: ${W.amber};
        box-shadow: 0 0 6px ${W.amber};
        animation: rv-pulse 2s ease-in-out infinite;
      }
      .rv-bp-name {
        font-size: 8.5px;
        color: ${W.inkFaint};
        letter-spacing: 0.1em;
      }
      .rv-bp-note {
        padding: 4px 12px 0;
        font-size: 9px;
        color: ${W.inkFaint};
        text-align: center;
        letter-spacing: 0.05em;
        font-style: italic;
      }

      .rv-col-foot-r {
        margin-top: auto;
        padding: 12px 12px 4px;
        text-align: center;
        color: ${W.amberDeep};
        font-size: 9.5px;
        letter-spacing: 0.15em;
        opacity: 0.65;
      }
    `}</style>
  )
}
