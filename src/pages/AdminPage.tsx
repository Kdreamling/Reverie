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
  model_overrides?: Record<string, { model_name?: string; supports_thinking?: boolean }>
  supports_thinking: boolean
  thinking_format: string
  enabled: boolean
  channel_tag?: string | null
  note?: string | null
  source: 'hardcoded' | 'hardcoded_override' | 'db'
}

// 前端可选模型（gateway_models 表）
interface ModelInfo {
  name: string
  label: string
  scene_tags: string[]
  channel_name: string
  upstream_model: string
  enabled: boolean
  sort_order: number
  note?: string | null
  created_at?: string
  updated_at?: string
}

interface ChannelBrief {
  name: string
  channel_tag?: string | null
  base_url?: string
  models: string[]
  enabled: boolean
}

const SCENE_TAG_OPTIONS: { key: string; label: string }[] = [
  { key: 'daily', label: '日常' },
  { key: 'rp', label: '剧本' },
  { key: 'reading', label: '共读' },
  { key: 'dev', label: 'Dev' },
  { key: 'study', label: '学习' },
]

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

interface CacheHealth {
  period_hours: number
  summary: {
    total_conversations: number
    avg_hit_rate: number
    total_cached_tokens: number
    total_cache_creation_tokens: number
    total_input_tokens: number
    total_output_tokens: number
    total_cost_usd: number
    total_saved_usd: number
    anomalies: number
  }
  by_scene: Record<string, {
    count: number
    cached_tokens: number
    cache_creation_tokens: number
    total_input: number
    hit_rate: number
    anomalies: number
  }>
  recent: Array<{
    id: number | string
    created_at: string
    scene: string
    channel: string | null
    input_tokens: number
    output_tokens: number
    cached_tokens: number
    cache_creation_tokens: number
    hit_rate: number
    cost: number
    saved: number
    anomaly: boolean
  }>
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
  const isHardcoded = ch.source === 'hardcoded' || ch.source === 'hardcoded_override'
  const hasOverride = ch.source === 'hardcoded_override'

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
          {ch.channel_tag && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              border: `1px solid ${C.accent}50`, color: C.accent,
              background: 'transparent',
            }}>{ch.channel_tag}</span>
          )}
          {!ch.enabled && <span style={{ fontSize: 10, color: C.textMuted }}>(已停用)</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: C.thinkingBg, color: C.textSecondary,
          }}>{ch.provider}</span>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 8,
            background: isDb ? '#e8f5e9' : (hasOverride ? '#fff3e0' : C.surface),
            color: isDb ? '#4caf50' : (hasOverride ? '#e65100' : C.textMuted),
          }}>{isDb ? 'DB' : (hasOverride ? '内置·已改' : '内置')}</span>
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

      {ch.note && (
        <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 8, fontStyle: 'italic' }}>
          备注: {ch.note}
        </div>
      )}

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
        <button onClick={() => onEdit(ch)} style={smallBtnStyle}>编辑</button>
        <button onClick={() => onToggle(ch)} style={smallBtnStyle}>
          {ch.enabled ? '停用' : '启用'}
        </button>
        {isDb && (
          <button onClick={() => onDelete(ch)} style={{ ...smallBtnStyle, color: '#e53935' }}>
            删除
          </button>
        )}
        {isHardcoded && hasOverride && (
          <button onClick={() => onDelete(ch)} style={{ ...smallBtnStyle, color: '#e65100' }}>
            恢复默认
          </button>
        )}
      </div>
    </div>
  )
}

function AddChannelForm({ onSubmit, onCancel }: {
  onSubmit: (data: { name: string; provider: string; base_url: string; api_key: string; models: string; supports_thinking: boolean; thinking_format: string; channel_tag: string; note: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai_compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState('')
  const [thinking, setThinking] = useState(true)
  const [thinkingFmt, setThinkingFmt] = useState('openai')
  const [channelTag, setChannelTag] = useState('')
  const [note, setNote] = useState('')

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
        <FormField label="渠道标签（如：官方直出 / 谷歌出 / 中转）" value={channelTag} onChange={setChannelTag} placeholder="官方直出" />
        <FormField label="备注（可选）" value={note} onChange={setNote} placeholder="例：稳定但偏贵" />
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
              onSubmit({ name, provider, base_url: baseUrl, api_key: apiKey, models, supports_thinking: thinking, thinking_format: thinkingFmt, channel_tag: channelTag, note })
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

// 把 "显示名 => 上游id" 的文本解析为 {models, model_overrides}
function parseModelsText(text: string): { models: string[]; model_overrides: Record<string, { model_name: string }> } {
  const list: string[] = []
  const overrides: Record<string, { model_name: string }> = {}
  text.split(/[\n,]/).map(s => s.trim()).filter(Boolean).forEach(line => {
    const m = line.match(/^(.+?)\s*=>\s*(.+)$/)
    if (m) {
      const disp = m[1].trim()
      const real = m[2].trim()
      list.push(disp)
      if (real && real !== disp) overrides[disp] = { model_name: real }
    } else {
      list.push(line)
    }
  })
  return { models: list, model_overrides: overrides }
}

function encodeModelsText(models: string[], overrides?: Record<string, { model_name?: string }>): string {
  return models.map(m => {
    const real = overrides?.[m]?.model_name
    return real ? `${m} => ${real}` : m
  }).join('\n')
}

function EditChannelForm({ ch, onSubmit, onSubmitAndTest, onCancel }: {
  ch: ChannelInfo
  onSubmit: (name: string, data: Record<string, unknown>) => void
  onSubmitAndTest: (name: string, data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [provider, setProvider] = useState(ch.provider)
  const [baseUrl, setBaseUrl] = useState(ch.base_url)
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState(encodeModelsText(ch.models, ch.model_overrides))
  const [thinking, setThinking] = useState(ch.supports_thinking)
  const [thinkingFmt, setThinkingFmt] = useState(ch.thinking_format)
  const [channelTag, setChannelTag] = useState(ch.channel_tag ?? '')
  const [note, setNote] = useState(ch.note ?? '')

  const buildData = (): Record<string, unknown> => {
    const parsed = parseModelsText(models)
    const data: Record<string, unknown> = {
      provider,
      base_url: baseUrl,
      models: parsed.models,
      model_overrides: parsed.model_overrides,
      supports_thinking: thinking,
      thinking_format: thinkingFmt,
      channel_tag: channelTag,
      note: note,
    }
    if (apiKey) data.api_key = apiKey
    return data
  }

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
        <FormField label="渠道标签" value={channelTag} onChange={setChannelTag} placeholder="官方直出 / 谷歌出 / 中转 ..." />
        <FormField label="备注" value={note} onChange={setNote} placeholder="（可选）" />
        <div>
          <label style={labelStyle}>模型（每行一个，可用 <code>显示名 =&gt; 上游id</code> 自定义）</label>
          <textarea
            value={models}
            onChange={e => setModels(e.target.value)}
            rows={Math.max(3, models.split('\n').length)}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' } as React.CSSProperties}
            placeholder={'opus-慢 => claude-opus-4-6\nopus-快 => claude-opus-4-7'}
          />
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
            左边是聊天页显示的名字（随意取），右边是上游 API 真实的 model id。没 =&gt; 就是两者相同。
          </div>
        </div>
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
            onClick={() => onSubmit(ch.name, buildData())}
            style={{ ...btnStyle, flex: 1, background: C.accentGradient, color: '#fff' }}
          >
            保存
          </button>
          <button
            onClick={() => onSubmitAndTest(ch.name, buildData())}
            style={{ ...btnStyle, flex: 1, background: 'none', border: `1px solid ${C.accent}`, color: C.accent }}
          >
            保存并测试
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

function CacheSection({
  data, hours, onHoursChange, onRefresh,
}: {
  data: CacheHealth | null
  hours: number
  onHoursChange: (h: number) => void
  onRefresh: () => void
}) {
  const sceneLabel = (s: string): string => ({
    daily: '日常', dev: '开发', roleplay: '剧本', reading: '共读', event: '桌宠',
  } as Record<string, string>)[s] ?? s
  const hitColor = (rate: number) =>
    rate >= 70 ? C.success : rate >= 40 ? C.accentWarm : C.errorText

  return (
    <>
      {/* 时间范围选择 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>时间范围</span>
          {[6, 24, 72, 168].map(h => (
            <button
              key={h}
              onClick={() => onHoursChange(h)}
              style={{
                ...smallBtnStyle,
                color: hours === h ? C.accent : C.textSecondary,
                borderColor: hours === h ? C.accent : C.border,
              }}
            >
              {h < 24 ? `${h}h` : h < 168 ? `${h / 24}d` : '7d'}
            </button>
          ))}
          <button
            onClick={onRefresh}
            style={{ ...smallBtnStyle, marginLeft: 'auto', color: C.accent }}
          >
            ↻ 刷新
          </button>
        </div>
      </div>

      {!data ? <CardSkeleton /> : (
        <>
          {/* 总览 */}
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>缓存总览（{data.period_hours}h）</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <StatItem label="对话数" value={String(data.summary.total_conversations)} />
              <StatItem
                label="平均命中率"
                value={`${data.summary.avg_hit_rate}%`}
              />
              <StatItem
                label="异常次数"
                value={String(data.summary.anomalies)}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <StatItem
                label="缓存命中 tok"
                value={formatTokens(data.summary.total_cached_tokens)}
              />
              <StatItem
                label="缓存写入 tok"
                value={formatTokens(data.summary.total_cache_creation_tokens)}
              />
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 10, background: C.surface,
              fontSize: 12,
            }}>
              <span style={{ color: C.textMuted }}>总成本 / 节省</span>
              <span>
                <span style={{ color: C.text, fontWeight: 600 }}>${data.summary.total_cost_usd.toFixed(3)}</span>
                <span style={{ color: C.textMuted }}> · 节省 </span>
                <span style={{ color: C.success, fontWeight: 600 }}>${data.summary.total_saved_usd.toFixed(3)}</span>
              </span>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
              异常 = 有缓存写入 但 cached=0 且输入&gt;4096，即"该命中却没命中"的冷启动/miss
            </div>
          </div>

          {/* 按场景分组 */}
          {Object.keys(data.by_scene).length > 0 && (
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>按场景</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {Object.entries(data.by_scene)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([scene, s]) => (
                    <div key={scene} style={{
                      padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ color: C.text, fontWeight: 500 }}>
                          {sceneLabel(scene)}
                          <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>
                            {s.count}条
                          </span>
                        </span>
                        <span style={{ color: hitColor(s.hit_rate), fontWeight: 600 }}>
                          {s.hit_rate}%
                        </span>
                      </div>
                      <div style={{ color: C.textMuted, fontSize: 11 }}>
                        命中 {formatTokens(s.cached_tokens)} / 写入 {formatTokens(s.cache_creation_tokens)} / 输入 {formatTokens(s.total_input)}
                        {s.anomalies > 0 && (
                          <span style={{ color: C.errorText }}> · 异常 {s.anomalies}</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 最近对话 */}
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>最近对话</h3>
            {data.recent.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 20 }}>暂无记录</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {data.recent.map(r => (
                  <div
                    key={r.id}
                    style={{
                      padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 12,
                      background: r.anomaly ? 'rgba(229, 57, 53, 0.06)' : 'transparent',
                      borderRadius: r.anomaly ? 6 : 0,
                      marginBottom: r.anomaly ? 2 : 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ color: C.text, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.anomaly && (
                          <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 4,
                            background: C.errorText, color: '#fff', fontWeight: 600,
                          }}>
                            MISS
                          </span>
                        )}
                        {sceneLabel(r.scene)}
                        {r.channel && (
                          <span style={{ color: C.textMuted, fontWeight: 400 }}>· {r.channel}</span>
                        )}
                      </span>
                      <span style={{ color: hitColor(r.hit_rate), fontWeight: 600 }}>
                        {r.hit_rate}%
                      </span>
                    </div>
                    <div style={{ color: C.textMuted, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        命中 {formatTokens(r.cached_tokens)} / 写入 {formatTokens(r.cache_creation_tokens)} / 输入 {formatTokens(r.input_tokens)}
                      </span>
                      <span>
                        {new Date(r.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

// ─── 模型管理：行内编辑 Row + 新增表单 ─────────────────────────────────────

function ModelRow({ m, channels, onUpdate, onDelete, onToggle }: {
  m: ModelInfo
  channels: ChannelBrief[]
  onUpdate: (name: string, patch: Partial<ModelInfo>, summary: string) => void
  onDelete: (m: ModelInfo) => void
  onToggle: (m: ModelInfo) => void
}) {
  const [label, setLabel] = useState(m.label)
  const [sceneTags, setSceneTags] = useState<string[]>(m.scene_tags)
  const [channelName, setChannelName] = useState(m.channel_name)
  const [upstreamModel, setUpstreamModel] = useState(m.upstream_model)
  const [sortOrder, setSortOrder] = useState(m.sort_order)
  const [note, setNote] = useState(m.note ?? '')

  // 判断哪些字段有未保存的改动
  const dirty = {
    label: label !== m.label,
    scene_tags: JSON.stringify([...sceneTags].sort()) !== JSON.stringify([...m.scene_tags].sort()),
    channel_name: channelName !== m.channel_name,
    upstream_model: upstreamModel !== m.upstream_model,
    sort_order: sortOrder !== m.sort_order,
    note: note !== (m.note ?? ''),
  }
  const anyDirty = Object.values(dirty).some(Boolean)

  // 找到当前 channel 的 models 列表（用于 datalist 提示）
  const channelModels = channels.find(c => c.name === channelName)?.models ?? []

  const dirtyBorder = (flag: boolean): React.CSSProperties => (
    flag
      ? { border: '1.5px solid #e67e22', background: 'rgba(230,126,34,0.04)' }
      : {}
  )

  const toggleSceneTag = (tag: string) => {
    setSceneTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag])
  }

  const save = () => {
    const patch: Partial<ModelInfo> = {}
    const summary: string[] = []
    if (dirty.label) { patch.label = label; summary.push(`名称→「${label}」`) }
    if (dirty.scene_tags) { patch.scene_tags = sceneTags; summary.push(`场景→${sceneTags.join(',')}`) }
    if (dirty.channel_name) { patch.channel_name = channelName; summary.push(`供应商→${channelName}`) }
    if (dirty.upstream_model) { patch.upstream_model = upstreamModel; summary.push(`上游→${upstreamModel}`) }
    if (dirty.sort_order) { patch.sort_order = sortOrder; summary.push(`排序→${sortOrder}`) }
    if (dirty.note) { patch.note = note; summary.push('备注已改') }
    onUpdate(m.name, patch, summary.join(' / '))
  }

  const reset = () => {
    setLabel(m.label); setSceneTags(m.scene_tags); setChannelName(m.channel_name)
    setUpstreamModel(m.upstream_model); setSortOrder(m.sort_order); setNote(m.note ?? '')
  }

  return (
    <div style={{
      ...cardStyle, padding: 14, opacity: m.enabled ? 1 : 0.55,
      position: 'relative',
    }}>
      {/* 顶部：启用状态 + 模型 id + 操作 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: m.enabled ? C.success : C.textMuted,
            boxShadow: m.enabled ? `0 0 6px ${C.success}40` : 'none', flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace', flexShrink: 0 }}>{m.name}</span>
          {anyDirty && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              color: '#e67e22', border: '1px solid #e67e2250', background: 'rgba(230,126,34,0.06)',
            }}>未保存</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onToggle(m)} style={smallBtnStyle}>
            {m.enabled ? '停用' : '启用'}
          </button>
          <button onClick={() => onDelete(m)} style={{ ...smallBtnStyle, color: '#e53935' }}>
            删除
          </button>
        </div>
      </div>

      {/* 显示名 + 排序 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={label} onChange={e => setLabel(e.target.value)}
          placeholder="前端显示名"
          style={{ ...inputStyle, flex: 1, fontSize: 14, fontWeight: 600, ...dirtyBorder(dirty.label) }}
        />
        <input
          type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value) || 0)}
          placeholder="排序"
          style={{ ...inputStyle, width: 80, fontSize: 12, ...dirtyBorder(dirty.sort_order) }}
          title="同场景内排序，小的在前"
        />
      </div>

      {/* 场景标签 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>显示在哪些场景的选择框</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SCENE_TAG_OPTIONS.map(opt => {
            const active = sceneTags.includes(opt.key)
            const changed = dirty.scene_tags
            return (
              <button
                key={opt.key}
                onClick={() => toggleSceneTag(opt.key)}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 12,
                  border: `1px solid ${active ? C.accent : C.border}`,
                  color: active ? C.accent : C.textMuted,
                  background: active ? `${C.accent}0d` : 'transparent',
                  cursor: 'pointer',
                  boxShadow: changed ? '0 0 0 1px #e67e2280' : 'none',
                }}
              >
                {active ? '● ' : '○ '}{opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Channel + Upstream Model */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>供应商</div>
          <select
            value={channelName} onChange={e => setChannelName(e.target.value)}
            style={{ ...inputStyle, fontSize: 12, ...dirtyBorder(dirty.channel_name) }}
          >
            {channels.map(c => (
              <option key={c.name} value={c.name}>
                {c.name}{c.channel_tag ? ` · ${c.channel_tag}` : ''}{c.enabled === false ? ' (已停用)' : ''}
              </option>
            ))}
            {!channels.find(c => c.name === channelName) && (
              <option value={channelName}>{channelName} · ⚠ 不存在</option>
            )}
          </select>
        </div>
        <div style={{ flex: 1.3, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>上游模型 id</div>
          <input
            list={`upstreams-${m.name}`}
            value={upstreamModel} onChange={e => setUpstreamModel(e.target.value)}
            style={{ ...inputStyle, fontSize: 12, fontFamily: 'monospace', ...dirtyBorder(dirty.upstream_model) }}
          />
          <datalist id={`upstreams-${m.name}`}>
            {channelModels.map(cm => <option key={cm} value={cm} />)}
          </datalist>
        </div>
      </div>

      {/* 备注 */}
      <input
        value={note} onChange={e => setNote(e.target.value)}
        placeholder="备注（可选）"
        style={{ ...inputStyle, fontSize: 12, marginBottom: anyDirty ? 10 : 0, ...dirtyBorder(dirty.note) }}
      />

      {/* 待保存操作栏 */}
      {anyDirty && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={save}
            style={{ ...btnStyle, flex: 1, padding: '8px 0', background: 'transparent', border: `1.5px solid ${C.accent}`, color: C.accent }}
          >
            保存改动
          </button>
          <button
            onClick={reset}
            style={{ ...btnStyle, flex: 1, padding: '8px 0', background: 'transparent', border: `1px solid ${C.border}`, color: C.textSecondary }}
          >
            放弃
          </button>
        </div>
      )}
    </div>
  )
}


function AddModelForm({ channels, onSubmit, onCancel }: {
  channels: ChannelBrief[]
  onSubmit: (data: Omit<ModelInfo, 'created_at' | 'updated_at'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [sceneTags, setSceneTags] = useState<string[]>(['daily'])
  const [channelName, setChannelName] = useState(channels[0]?.name ?? '')
  const [upstreamModel, setUpstreamModel] = useState('')
  const [sortOrder, setSortOrder] = useState(100)
  const [note, setNote] = useState('')

  const channelModels = channels.find(c => c.name === channelName)?.models ?? []

  const toggleSceneTag = (tag: string) => {
    setSceneTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag])
  }

  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}>添加模型</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <FormField label="模型条目 id（英文，唯一）" value={name} onChange={setName} placeholder="opus46-guagua" />
        </div>
        <FormField label="前端显示名" value={label} onChange={setLabel} placeholder="Claude Opus 4.6 (呱呱)" />

        <div>
          <label style={labelStyle}>显示在哪些场景的选择框</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SCENE_TAG_OPTIONS.map(opt => {
              const active = sceneTags.includes(opt.key)
              return (
                <button
                  key={opt.key}
                  onClick={() => toggleSceneTag(opt.key)}
                  style={{
                    fontSize: 12, padding: '5px 12px', borderRadius: 14,
                    border: `1px solid ${active ? C.accent : C.border}`,
                    color: active ? C.accent : C.textMuted,
                    background: active ? `${C.accent}0d` : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {active ? '● ' : '○ '}{opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>供应商</label>
          <select value={channelName} onChange={e => setChannelName(e.target.value)} style={inputStyle}>
            {channels.length === 0 && <option value="">（没有可用供应商，先去供应商 Tab 添加）</option>}
            {channels.map(c => (
              <option key={c.name} value={c.name}>
                {c.name}{c.channel_tag ? ` · ${c.channel_tag}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>上游模型 id（后端真实 model 字段）</label>
          <input
            list="new-model-upstreams"
            value={upstreamModel} onChange={e => setUpstreamModel(e.target.value)}
            placeholder={channelModels[0] ?? 'claude-opus-4-6'}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
          <datalist id="new-model-upstreams">
            {channelModels.map(cm => <option key={cm} value={cm} />)}
          </datalist>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
            从该供应商已有的模型中选，也可以手填（请确保上游有这个 id）
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>排序（小在前）</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div style={{ flex: 2 }}>
            <label style={labelStyle}>备注</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="（可选）" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => {
              if (!name || !label || !channelName || !upstreamModel) { toast.warning('请填写所有必填项'); return }
              if (sceneTags.length === 0) { toast.warning('请至少选择一个场景'); return }
              onSubmit({
                name, label, scene_tags: sceneTags,
                channel_name: channelName, upstream_model: upstreamModel,
                enabled: true, sort_order: sortOrder, note,
              })
            }}
            style={{ ...btnStyle, flex: 1, background: C.accentGradient, color: '#fff' }}
          >
            添加
          </button>
          <button
            onClick={onCancel}
            style={{ ...btnStyle, flex: 1, background: 'none', border: `1px solid ${C.border}`, color: C.textSecondary }}
          >
            取消
          </button>
        </div>
      </div>
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

type Tab = 'status' | 'models' | 'channels' | 'logs' | 'scheduler' | 'cache'

const TABS: { key: Tab; label: string }[] = [
  { key: 'status', label: '总览' },
  { key: 'models', label: '模型' },
  { key: 'channels', label: '供应商' },
  { key: 'logs', label: '日志' },
  { key: 'cache', label: '缓存' },
  { key: 'scheduler', label: '运维' },
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
  const [schedulerData, setSchedulerData] = useState<{ jobs: any[]; last_keepalive_ts: string | null; recent_keepalive: any[] } | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [cacheHealth, setCacheHealth] = useState<CacheHealth | null>(null)
  const [cacheHours, setCacheHours] = useState(24)

  // 模型管理
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [channelOptions, setChannelOptions] = useState<ChannelBrief[]>([])
  const [showAddModel, setShowAddModel] = useState(false)

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

  const loadCacheHealth = useCallback(async (hours: number) => {
    try {
      setCacheHealth(null)
      const data = await adminFetch<CacheHealth>(`/admin/cache/health?hours=${hours}&limit=30`)
      setCacheHealth(data)
    } catch { setCacheHealth(null) }
  }, [])

  const loadModels = useCallback(async () => {
    try {
      const data = await adminFetch<{ models: ModelInfo[]; channels: ChannelBrief[] }>('/admin/models')
      setModels(data.models ?? [])
      setChannelOptions(data.channels ?? [])
    } catch {
      setModels([])
      setChannelOptions([])
    }
  }, [])

  const loadScheduler = useCallback(async () => {
    try {
      const data = await adminFetch<{ jobs: any[]; last_keepalive_ts: string | null; recent_keepalive: any[] }>('/admin/scheduler/status')
      setSchedulerData(data)
    } catch { setSchedulerData(null) }
  }, [])

  const handleRestart = async () => {
    if (!confirm('确定重启 Gateway？会中断当前所有请求。')) return
    setRestarting(true)
    try {
      const data = await adminFetch<{ success: boolean; message: string }>('/admin/restart', { method: 'POST' })
      toast.info(data.message)
    } catch (e) {
      toast.error(`重启失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
    setTimeout(() => setRestarting(false), 10000)
  }

  useEffect(() => {
    if (tab === 'status') { loadStatus(); loadUsage(); loadLockStatus() }
    if (tab === 'models') loadModels()
    if (tab === 'channels') loadChannels()
    if (tab === 'logs') loadLogs()
    if (tab === 'scheduler') loadScheduler()
    if (tab === 'cache') loadCacheHealth(cacheHours)
  }, [tab, cacheHours, loadStatus, loadChannels, loadLogs, loadUsage, loadLockStatus, loadScheduler, loadCacheHealth, loadModels])

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

  const handleAddChannel = async (data: { name: string; provider: string; base_url: string; api_key: string; models: string; supports_thinking: boolean; thinking_format: string; channel_tag: string; note: string }) => {
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

  const handleEditAndTestChannel = async (name: string, data: Record<string, unknown>) => {
    try {
      const resp = await adminFetch<{ success: boolean; message: string }>(
        `/admin/channels/${encodeURIComponent(name)}`,
        { method: 'PUT', body: JSON.stringify(data) },
      )
      if (!resp.success) {
        toast.error(resp.message)
        return
      }
      toast.success(`${resp.message}，正在测试...`)
      // 保存后立刻测试
      const testResp = await adminFetch<{ success: boolean; status_code?: number; error?: string; latency_ms?: number }>(
        '/admin/channels/test',
        { method: 'POST', body: JSON.stringify({ name }) },
      )
      if (testResp.success) {
        toast.success(`${name} 连通正常 (${testResp.latency_ms}ms)`)
      } else {
        toast.error(`${name} 连通失败: ${testResp.status_code ?? ''} ${testResp.error ?? ''}`)
      }
      setEditingChannel(null)
      loadChannels()
    } catch (e) {
      toast.error(`编辑失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleDeleteChannel = async (ch: ChannelInfo) => {
    const isHardcoded = ch.source === 'hardcoded' || ch.source === 'hardcoded_override'
    const promptText = isHardcoded
      ? `确定恢复「${ch.name}」到默认配置？自定义的 key / base_url / 模型列表将被清除，回退到 .env + 硬编码。`
      : `确定删除渠道「${ch.name}」？此操作不可撤销。`
    if (!confirm(promptText)) return
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

  // ---- 模型操作 ----
  const handleAddModel = async (data: Omit<ModelInfo, 'created_at' | 'updated_at'>) => {
    try {
      const resp = await adminFetch<{ success: boolean; message: string }>('/admin/models', {
        method: 'POST', body: JSON.stringify(data),
      })
      if (resp.success) {
        toast.success(resp.message)
        setShowAddModel(false)
        loadModels()
      } else {
        toast.error(resp.message)
      }
    } catch (e) {
      toast.error(`添加失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleUpdateModel = async (name: string, patch: Partial<ModelInfo>, summary: string) => {
    try {
      const resp = await adminFetch<{ success: boolean; message: string }>(
        `/admin/models/${encodeURIComponent(name)}`,
        { method: 'PUT', body: JSON.stringify(patch) },
      )
      if (resp.success) {
        toast.success(`已保存：${summary}`)
        loadModels()
      } else {
        toast.error(resp.message)
      }
    } catch (e) {
      toast.error(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleDeleteModel = async (m: ModelInfo) => {
    if (!confirm(`确定删除模型「${m.label}」？\n（删除后，所有 ${m.scene_tags.map(t => SCENE_TAG_OPTIONS.find(o=>o.key===t)?.label||t).join('/')} 场景的对话框都会失去这个选项，此操作不可撤销）`)) return
    try {
      const resp = await adminFetch<{ success: boolean; message: string }>(
        `/admin/models/${encodeURIComponent(m.name)}`,
        { method: 'DELETE' },
      )
      if (resp.success) {
        toast.success(resp.message)
        loadModels()
      } else {
        toast.error(resp.message)
      }
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleToggleModel = async (m: ModelInfo) => {
    try {
      const resp = await adminFetch<{ success: boolean; enabled?: boolean; message?: string }>(
        `/admin/models/${encodeURIComponent(m.name)}/toggle`,
        { method: 'PATCH' },
      )
      if (resp.success) {
        toast.success(`${m.label} 已${resp.enabled ? '启用' : '停用'}`)
        loadModels()
      } else {
        toast.error(resp.message ?? '切换失败')
      }
    } catch (e) {
      toast.error(`切换失败: ${e instanceof Error ? e.message : '未知错误'}`)
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

        {tab === 'models' && (
          <>
            <div style={{
              fontSize: 11, color: C.textMuted, padding: '2px 4px 8px', lineHeight: 1.6,
            }}>
              这里管理的是"前端对话框能选到的模型"。每个条目绑定一个供应商 + 上游模型 id。改动后对应场景的选择框会立即同步，不用改代码。
            </div>
            {!showAddModel && (
              <button
                onClick={() => setShowAddModel(true)}
                style={{
                  ...btnStyle, width: '100%',
                  background: 'none', border: `1px dashed ${C.border}`,
                  color: C.accent, padding: '12px 0',
                }}
              >
                + 添加模型
              </button>
            )}
            {showAddModel && (
              <AddModelForm
                channels={channelOptions}
                onSubmit={handleAddModel}
                onCancel={() => setShowAddModel(false)}
              />
            )}
            {models === null ? <CardSkeleton /> : models.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 30 }}>
                还没有模型——点上面的"+ 添加模型"开始，或者先去"供应商"Tab 加好 API 再来。
              </div>
            ) : (
              <>
                {/* 按场景分组显示 */}
                {SCENE_TAG_OPTIONS.map(opt => {
                  const group = models.filter(m => m.scene_tags.includes(opt.key))
                  if (group.length === 0) return null
                  return (
                    <div key={opt.key}>
                      <div style={{
                        fontSize: 11, color: C.textMuted, marginBottom: 8, padding: '4px 2px',
                        borderBottom: `1px dashed ${C.border}`,
                        display: 'flex', justifyContent: 'space-between',
                      }}>
                        <span>场景：{opt.label}</span>
                        <span>{group.filter(m => m.enabled).length} / {group.length} 启用</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {group.map(m => (
                          <ModelRow
                            key={m.name}
                            m={m}
                            channels={channelOptions}
                            onUpdate={handleUpdateModel}
                            onDelete={handleDeleteModel}
                            onToggle={handleToggleModel}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {/* 无场景标签的孤儿 */}
                {(() => {
                  const orphans = models.filter(m => m.scene_tags.length === 0)
                  if (orphans.length === 0) return null
                  return (
                    <div>
                      <div style={{ fontSize: 11, color: '#e67e22', marginBottom: 8, padding: '4px 2px' }}>
                        ⚠ 未分配场景（在任何对话框都不会出现）
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {orphans.map(m => (
                          <ModelRow
                            key={m.name}
                            m={m}
                            channels={channelOptions}
                            onUpdate={handleUpdateModel}
                            onDelete={handleDeleteModel}
                            onToggle={handleToggleModel}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
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
                onSubmitAndTest={handleEditAndTestChannel}
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

        {tab === 'cache' && (
          <CacheSection
            data={cacheHealth}
            hours={cacheHours}
            onHoursChange={setCacheHours}
            onRefresh={() => loadCacheHealth(cacheHours)}
          />
        )}

        {tab === 'scheduler' && (
          <>
            {/* 重启按钮 */}
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>Gateway 控制</h3>
              <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 12, lineHeight: 1.6 }}>
                重启会中断当前所有请求（包括晨正在回复的消息）。重启后所有定时任务自动恢复。通常在更新代码或遇到异常时使用。
              </div>
              <button
                onClick={handleRestart}
                disabled={restarting}
                style={{
                  ...btnStyle, width: '100%',
                  background: restarting ? C.surface : '#fff',
                  border: `1px solid ${restarting ? C.border : '#e53935'}`,
                  color: restarting ? C.textMuted : '#e53935',
                  cursor: restarting ? 'default' : 'pointer',
                }}
              >
                {restarting ? '重启中...请稍等后刷新' : '重启 Gateway'}
              </button>
            </div>

            {/* 定时任务 */}
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>定时任务</h3>
              <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 12, lineHeight: 1.6 }}>
                这些任务在 Gateway 运行时自动执行。"下次执行"显示的是服务器时间。
              </div>
              {!schedulerData ? <div style={{ fontSize: 13, color: C.textMuted, padding: 20, textAlign: 'center' }}>加载中...</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {schedulerData.jobs.map(job => {
                    const jobInfo: Record<string, { name: string; desc: string }> = {
                      'cache_warmup': { name: '缓存暖机', desc: '每 5 分钟检查，45 分钟无聊天时发静默请求续缓存' },
                      'keepalive': { name: '自由时间', desc: '每 5 分钟检查，55 分钟无聊天时晨自主活动（写日记等）' },
                      'life_reminder': { name: '待办提醒', desc: '每 5 分钟检查到期的待办，推送提醒' },
                      'care_engine': { name: '关心引擎', desc: '每 5 分钟检查 Dream 状态，Sonnet 判断是否需要推送关怀（冷却 90 分钟）' },
                      'daily_rebuild': { name: '维度摘要重建', desc: '每天凌晨 1:00，全量重建五维度记忆摘要' },
                      'core_living_cleanup': { name: '记忆清理', desc: '每天 1:05，清理过期的活水记忆' },
                      'daily_profile_update': { name: '观察笔记', desc: '每天 1:10，更新晨对 Dream 的观察笔记' },
                      'daily_rolling_summary': { name: '滚动摘要', desc: '每天 23:50，生成当天对话的 500 字摘要' },
                      'daily_backup': { name: '数据备份', desc: '每天 3:00，备份关键数据' },
                      'monthly_archive': { name: '月度归档', desc: '每月 1 日 4:00，归档上月数据' },
                    }
                    const info = jobInfo[job.id]
                    return (
                      <div key={job.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.text, fontWeight: 500 }}>{info?.name ?? job.id}</div>
                          <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{info?.desc ?? job.trigger}</div>
                        </div>
                        <div style={{ fontSize: 11, color: C.textSecondary, flexShrink: 0, marginLeft: 8 }}>
                          {job.next_run ? new Date(job.next_run).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 最近 keepalive */}
            <div style={cardStyle}>
              <h3 style={cardTitleStyle}>晨的自由活动</h3>
              <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10, lineHeight: 1.6 }}>
                你不聊天时晨会自己活动——写日记、探索记忆、或者给你发消息。这里显示最近 5 次。
                {schedulerData?.last_keepalive_ts && (
                  <span> 上次活动: {new Date(schedulerData.last_keepalive_ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </div>
              {!schedulerData?.recent_keepalive?.length ? (
                <div style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 20 }}>暂无记录</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {schedulerData.recent_keepalive.map((k, i) => (
                    <div key={i} style={{
                      padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: C.text, fontWeight: 500 }}>
                          {({ light: '轻量', free: '自由' } as Record<string, string>)[k.mode] ?? k.mode}
                          {' / '}
                          {({ none: '安静等待', message: '发消息', explore: '探索', diary: '写日记' } as Record<string, string>)[k.action] ?? k.action}
                        </span>
                        <span style={{ color: C.textMuted, fontSize: 11 }}>
                          {new Date(k.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {k.content && (
                        <div style={{ color: C.textSecondary, fontSize: 11, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                          {k.content}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
