import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, FONT } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { toast } from '../stores/toastStore'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChannelInfo {
  name: string
  provider: string
  base_url: string
  api_key_masked: string
  models: string[]
  supports_thinking: boolean
  thinking_format: string
  enabled: boolean
  source: 'hardcoded' | 'db'
}

interface ServerStatus {
  version: string
  uptime_seconds: number
  uptime_display: string
  current_time: string
  channels_count: number
  models_count: number
  python_version: string
}

interface RequestLog {
  id: number
  session_id: string
  channel_name: string
  model_name: string
  status_code: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  duration_ms: number
  error_message: string | null
  created_at: string
}

interface UsageSummary {
  total_requests: number
  total_errors: number
  total_input_tokens: number
  total_output_tokens: number
  total_cached_tokens: number
  by_channel: Record<string, { requests: number; input_tokens: number; output_tokens: number; errors: number }>
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API_BASE}${path}${sep}_t=${Date.now()}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusCard({ status }: { status: ServerStatus | null }) {
  if (!status) return <CardSkeleton />
  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}>服务状态</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatItem label="版本" value={`v${status.version}`} />
        <StatItem label="运行时间" value={status.uptime_display} />
        <StatItem label="渠道数" value={String(status.channels_count)} />
        <StatItem label="模型数" value={String(status.models_count)} />
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted }}>
        {status.current_time} · Python {status.python_version}
      </div>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{value}</div>
    </div>
  )
}

function ChannelCard({ ch, onTest, onEdit, onDelete, onToggle }: {
  ch: ChannelInfo
  onTest: (ch: ChannelInfo) => void
  onEdit: (ch: ChannelInfo) => void
  onDelete: (ch: ChannelInfo) => void
  onToggle: (ch: ChannelInfo) => void
}) {
  const [testing, setTesting] = useState(false)
  const isDb = ch.source === 'db'

  const handleTest = async () => {
    setTesting(true)
    onTest(ch)
    setTimeout(() => setTesting(false), 3000)
  }

  return (
    <div style={{ ...cardStyle, padding: 14, opacity: ch.enabled ? 1 : 0.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: ch.enabled ? C.success : C.textMuted,
            boxShadow: ch.enabled ? `0 0 6px ${C.success}40` : 'none',
          }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{ch.name}</span>
          {!ch.enabled && <span style={{ fontSize: 10, color: C.textMuted }}>(已停用)</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: C.thinkingBg, color: C.textSecondary,
          }}>{ch.provider}</span>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 8,
            background: isDb ? '#e8f5e9' : C.surface,
            color: isDb ? '#4caf50' : C.textMuted,
          }}>{isDb ? 'DB' : '内置'}</span>
        </div>
      </div>

      <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 6, wordBreak: 'break-all' }}>
        {ch.base_url}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {ch.models.map(m => (
          <span key={m} style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 6,
            background: C.surface, color: C.textSecondary, border: `1px solid ${C.border}`,
          }}>{m}</span>
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
        Key: {ch.api_key_masked}
        {ch.supports_thinking && <span style={{ marginLeft: 8, color: C.accent }}>⚡ thinking</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={handleTest}
          disabled={testing}
          style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8,
            background: 'none', border: `1px solid ${C.border}`,
            color: testing ? C.textMuted : C.accent, cursor: testing ? 'default' : 'pointer',
          }}
        >
          {testing ? '测试中...' : '测试'}
        </button>
        {isDb && (
          <>
            <button onClick={() => onEdit(ch)} style={smallBtnStyle}>编辑</button>
            <button onClick={() => onToggle(ch)} style={smallBtnStyle}>
              {ch.enabled ? '停用' : '启用'}
            </button>
            <button onClick={() => onDelete(ch)} style={{ ...smallBtnStyle, color: '#e53935' }}>
              删除
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AddChannelForm({ onSubmit, onCancel }: {
  onSubmit: (data: { name: string; provider: string; base_url: string; api_key: string; models: string; supports_thinking: boolean; thinking_format: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai_compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState('')
  const [thinking, setThinking] = useState(true)
  const [thinkingFmt, setThinkingFmt] = useState('openai')

  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}>添加供应商</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FormField label="名称" value={name} onChange={setName} placeholder="例：guagua" />
        <div>
          <label style={labelStyle}>协议类型</label>
          <select value={provider} onChange={e => setProvider(e.target.value)} style={inputStyle}>
            <option value="openai_compatible">OpenAI Compatible</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
            <option value="zenmux">ZenMux</option>
          </select>
        </div>
        <FormField label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder="https://api.example.com/v1" />
        <FormField label="API Key" value={apiKey} onChange={setApiKey} placeholder="sk-..." type="password" />
        <FormField label="模型名（逗号分隔）" value={models} onChange={setModels} placeholder="claude-opus-4-6-thinking" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={thinking} onChange={e => setThinking(e.target.checked)} />
            支持 Thinking
          </label>
          {thinking && (
            <select value={thinkingFmt} onChange={e => setThinkingFmt(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1 }}>
              <option value="openai">openai</option>
              <option value="openai_xml">openai_xml</option>
              <option value="native">native</option>
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => {
              if (!name || !baseUrl || !apiKey || !models) { toast.warning('请填写所有必填项'); return }
              onSubmit({ name, provider, base_url: baseUrl, api_key: apiKey, models, supports_thinking: thinking, thinking_format: thinkingFmt })
            }}
            style={{ ...btnStyle, flex: 1, background: C.accentGradient, color: '#fff' }}
          >
            添加
          </button>
          <button onClick={onCancel} style={{ ...btnStyle, flex: 1, background: 'none', border: `1px solid ${C.border}`, color: C.textSecondary }}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

function EditChannelForm({ ch, onSubmit, onCancel }: {
  ch: ChannelInfo
  onSubmit: (name: string, data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [provider, setProvider] = useState(ch.provider)
  const [baseUrl, setBaseUrl] = useState(ch.base_url)
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState(ch.models.join(', '))
  const [thinking, setThinking] = useState(ch.supports_thinking)
  const [thinkingFmt, setThinkingFmt] = useState(ch.thinking_format)

  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}>编辑 — {ch.name}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={labelStyle}>协议类型</label>
          <select value={provider} onChange={e => setProvider(e.target.value)} style={inputStyle}>
            <option value="openai_compatible">OpenAI Compatible</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
            <option value="zenmux">ZenMux</option>
          </select>
        </div>
        <FormField label="Base URL" value={baseUrl} onChange={setBaseUrl} />
        <FormField label="API Key（留空不修改）" value={apiKey} onChange={setApiKey} placeholder="留空保持原 Key" type="password" />
        <FormField label="模型名（逗号分隔）" value={models} onChange={setModels} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={thinking} onChange={e => setThinking(e.target.checked)} />
            支持 Thinking
          </label>
          {thinking && (
            <select value={thinkingFmt} onChange={e => setThinkingFmt(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1 }}>
              <option value="openai">openai</option>
              <option value="openai_xml">openai_xml</option>
              <option value="native">native</option>
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => {
              const data: Record<string, unknown> = {
                provider,
                base_url: baseUrl,
                models: models.split(',').map(s => s.trim()).filter(Boolean),
                supports_thinking: thinking,
                thinking_format: thinkingFmt,
              }
              if (apiKey) data.api_key = apiKey
              onSubmit(ch.name, data)
            }}
            style={{ ...btnStyle, flex: 1, background: C.accentGradient, color: '#fff' }}
          >
            保存
          </button>
          <button onClick={onCancel} style={{ ...btnStyle, flex: 1, background: 'none', border: `1px solid ${C.border}`, color: C.textSecondary }}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  )
}

function LogsSection({ logs }: { logs: RequestLog[] | null }) {
  if (logs === null) return <CardSkeleton />
  if (logs.length === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>最近请求</h3>
        <div style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 20 }}>
          暂无日志数据
        </div>
      </div>
    )
  }
  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}>最近请求</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {logs.map(log => (
          <div key={log.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
            borderBottom: `1px solid ${C.border}`, fontSize: 12,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: log.status_code === 200 ? C.success : C.btnDanger,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.channel_name} → {log.model_name}
              </div>
              <div style={{ color: C.textMuted, fontSize: 11 }}>
                {log.status_code} · {log.duration_ms}ms · {log.input_tokens}+{log.output_tokens} tok
                {log.error_message && <span style={{ color: C.errorText }}> · {log.error_message}</span>}
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
              {new Date(log.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsageSection({ usage }: { usage: UsageSummary | null }) {
  if (!usage) return <CardSkeleton />
  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}>用量统计（7日）</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <StatItem label="总请求" value={String(usage.total_requests)} />
        <StatItem label="总错误" value={String(usage.total_errors)} />
        <StatItem label="缓存 tok" value={formatTokens(usage.total_cached_tokens)} />
      </div>
      {Object.entries(usage.by_channel).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(usage.by_channel).map(([ch, data]) => (
            <div key={ch} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12,
            }}>
              <span style={{ color: C.text, fontWeight: 500 }}>{ch}</span>
              <span style={{ color: C.textMuted }}>
                {data.requests}次 · {formatTokens(data.input_tokens + data.output_tokens)} tok
                {data.errors > 0 && <span style={{ color: C.errorText }}> · {data.errors}err</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div style={{ ...cardStyle, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: C.textMuted }}>加载中...</div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  padding: 16,
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12, margin: 0, paddingBottom: 10,
  borderBottom: `1px solid ${C.border}`,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: C.textSecondary, marginBottom: 4, display: 'block',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 13,
  background: C.inputBg, color: C.text, outline: 'none',
  boxSizing: 'border-box',
}

const btnStyle: React.CSSProperties = {
  padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
  border: 'none', cursor: 'pointer', textAlign: 'center',
}

const smallBtnStyle: React.CSSProperties = {
  fontSize: 11, padding: '4px 10px', borderRadius: 8,
  background: 'none', border: `1px solid ${C.border}`,
  color: C.textSecondary, cursor: 'pointer',
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = 'status' | 'channels' | 'logs' | 'memory'

const TABS: { key: Tab; label: string }[] = [
  { key: 'status', label: '总览' },
  { key: 'channels', label: '供应商' },
  { key: 'logs', label: '日志' },
  { key: 'memory', label: '记忆' },
]

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate()
  const token = useAuthStore(s => s.token)
  const [tab, setTab] = useState<Tab>('status')
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [channels, setChannels] = useState<ChannelInfo[] | null>(null)
  const [logs, setLogs] = useState<RequestLog[] | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingChannel, setEditingChannel] = useState<ChannelInfo | null>(null)
  const [lockStatus, setLockStatus] = useState<{ chen_locked_dream: any; dream_locked_chen: any } | null>(null)
  const [lockMinutes, setLockMinutes] = useState(120)

  const loadLockStatus = useCallback(async () => {
    try {
      const data = await adminFetch<{ chen_locked_dream: any; dream_locked_chen: any }>('/admin/lock/status')
      setLockStatus(data)
    } catch { /* ignore */ }
  }, [])

  const handleDreamLock = async () => {
    try {
      await adminFetch('/admin/lock/dream', {
        method: 'POST',
        body: JSON.stringify({ duration_minutes: lockMinutes, reason: 'Dream 关上了门' }),
      })
      toast.success(`门已关上，${lockMinutes}分钟后自动开`)
      loadLockStatus()
    } catch (e) {
      toast.error(`关门失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleDreamUnlock = async () => {
    try {
      await adminFetch('/admin/lock/dream', { method: 'DELETE' })
      toast.success('门已打开')
      loadLockStatus()
    } catch (e) {
      toast.error(`开门失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const loadStatus = useCallback(async () => {
    try {
      const data = await adminFetch<ServerStatus>('/admin/status')
      setStatus(data)
    } catch { setStatus(null) }
  }, [])

  const loadChannels = useCallback(async () => {
    try {
      const data = await adminFetch<{ channels: ChannelInfo[] }>('/admin/channels')
      setChannels(data.channels)
    } catch { setChannels([]) }
  }, [])

  const loadLogs = useCallback(async () => {
    try {
      const data = await adminFetch<{ logs: RequestLog[] }>('/admin/logs/recent?limit=30')
      setLogs(data.logs)
    } catch { setLogs([]) }
  }, [])

  const loadUsage = useCallback(async () => {
    try {
      const data = await adminFetch<UsageSummary>('/admin/usage/summary?days=7')
      setUsage(data)
    } catch { setUsage(null) }
  }, [])

  useEffect(() => {
    if (tab === 'status') { loadStatus(); loadUsage(); loadLockStatus() }
    if (tab === 'channels') loadChannels()
    if (tab === 'logs') loadLogs()
  }, [tab, loadStatus, loadChannels, loadLogs, loadUsage, loadLockStatus])

  const handleTestChannel = async (ch: ChannelInfo) => {
    try {
      const data = await adminFetch<{ success: boolean; status_code?: number; error?: string; latency_ms?: number }>(
        '/admin/channels/test',
        { method: 'POST', body: JSON.stringify({ name: ch.name }) },
      )
      if (data.success) {
        toast.success(`${ch.name} 连通正常 (${data.latency_ms}ms)`)
      } else {
        toast.error(`${ch.name} 连通失败: ${data.status_code} ${data.error ?? ''}`)
      }
    } catch (e) {
      toast.error(`测试失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleAddChannel = async (data: { name: string; provider: string; base_url: string; api_key: string; models: string; supports_thinking: boolean; thinking_format: string }) => {
    try {
      await adminFetch('/admin/channels', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          models: data.models.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      toast.success(`供应商 ${data.name} 已添加`)
      setShowAddForm(false)
      loadChannels()
    } catch (e) {
      toast.error(`添加失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleEditChannel = async (name: string, data: Record<string, unknown>) => {
    try {
      const resp = await adminFetch<{ success: boolean; message: string }>(
        `/admin/channels/${encodeURIComponent(name)}`,
        { method: 'PUT', body: JSON.stringify(data) },
      )
      if (resp.success) {
        toast.success(resp.message)
        setEditingChannel(null)
        loadChannels()
      } else {
        toast.error(resp.message)
      }
    } catch (e) {
      toast.error(`编辑失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleDeleteChannel = async (ch: ChannelInfo) => {
    if (!confirm(`确定删除渠道「${ch.name}」？此操作不可撤销。`)) return
    try {
      const resp = await adminFetch<{ success: boolean; message: string }>(
        `/admin/channels/${encodeURIComponent(ch.name)}`,
        { method: 'DELETE' },
      )
      if (resp.success) {
        toast.success(resp.message)
        loadChannels()
      } else {
        toast.error(resp.message)
      }
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleToggleChannel = async (ch: ChannelInfo) => {
    try {
      const resp = await adminFetch<{ success: boolean; enabled?: boolean; message: string }>(
        `/admin/channels/${encodeURIComponent(ch.name)}/toggle`,
        { method: 'PATCH' },
      )
      if (resp.success) {
        toast.success(resp.message)
        loadChannels()
      } else {
        toast.error(resp.message)
      }
    } catch (e) {
      toast.error(`操作失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: C.bg, fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{
        padding: '0 14px', height: 52, display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', color: C.textSecondary,
            cursor: 'pointer', padding: 4, display: 'flex', fontSize: 18,
          }}
        >
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }}>Gateway 管理</span>
        <button
          onClick={() => { loadStatus(); loadChannels(); loadLogs(); loadUsage(); toast.info('已刷新') }}
          style={{
            background: 'none', border: 'none', color: C.textSecondary,
            cursor: 'pointer', padding: 4, fontSize: 14,
          }}
        >
          ↻
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        padding: '0 14px', gap: 0,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '10px 0', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? C.accent : C.textMuted,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'status' && (
          <>
            <StatusCard status={status} />

            {/* 封锁系统 */}
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>封锁系统</h3>

              {/* 晨→Dream 锁状态 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>晨 → Dream</div>
                {lockStatus?.chen_locked_dream ? (
                  <div style={{ fontSize: 13, color: '#e53935' }}>
                    门已关 · 到 {new Date(lockStatus.chen_locked_dream.locked_until).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    {lockStatus.chen_locked_dream.reason && <span style={{ color: C.textMuted }}> · {lockStatus.chen_locked_dream.reason}</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: C.success }}>门开着</div>
                )}
              </div>

              {/* Dream→晨 锁控制 */}
              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Dream → 晨</div>
                {lockStatus?.dream_locked_chen ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#e53935' }}>
                      门已关 · 到 {new Date(lockStatus.dream_locked_chen.locked_until).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={handleDreamUnlock} style={{ ...smallBtnStyle, color: C.accent }}>开门</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: C.success }}>门开着</span>
                    <select
                      value={lockMinutes}
                      onChange={e => setLockMinutes(Number(e.target.value))}
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text }}
                    >
                      <option value={30}>30分钟</option>
                      <option value={60}>1小时</option>
                      <option value={120}>2小时</option>
                      <option value={240}>4小时</option>
                      <option value={480}>8小时</option>
                    </select>
                    <button onClick={handleDreamLock} style={{ ...smallBtnStyle, color: '#e53935' }}>关门</button>
                  </div>
                )}
              </div>
            </div>

            <UsageSection usage={usage} />
          </>
        )}

        {tab === 'channels' && (
          <>
            {!showAddForm && !editingChannel && (
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  ...btnStyle, width: '100%',
                  background: 'none', border: `1px dashed ${C.border}`,
                  color: C.accent, padding: '12px 0',
                }}
              >
                + 添加供应商
              </button>
            )}
            {showAddForm && <AddChannelForm onSubmit={handleAddChannel} onCancel={() => setShowAddForm(false)} />}
            {editingChannel && (
              <EditChannelForm
                ch={editingChannel}
                onSubmit={handleEditChannel}
                onCancel={() => setEditingChannel(null)}
              />
            )}
            {channels === null ? <CardSkeleton /> : channels.map(ch => (
              <ChannelCard
                key={ch.name}
                ch={ch}
                onTest={handleTestChannel}
                onEdit={(c) => { setShowAddForm(false); setEditingChannel(c) }}
                onDelete={handleDeleteChannel}
                onToggle={handleToggleChannel}
              />
            ))}
          </>
        )}

        {tab === 'logs' && <LogsSection logs={logs} />}

        {tab === 'memory' && (
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>记忆系统管理</h3>
            <div style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 30 }}>
              🚧 开发中，敬请期待
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
