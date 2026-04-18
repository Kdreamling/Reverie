import { useState, useEffect, useCallback } from 'react'
import { C } from '../theme'
import { toast } from '../stores/toastStore'

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface ModelInfo {
  name: string
  label: string
  scene_tags: string[]
  channel_name: string
  upstream_model: string
  enabled: boolean
  sort_order: number
  note?: string | null
}

interface ChannelBrief {
  name: string
  channel_tag?: string | null
  models: string[]
  enabled: boolean
}

const SCENE_OPTIONS = [
  { key: 'daily', label: '日常' },
  { key: 'rp', label: '剧本' },
  { key: 'reading', label: '共读' },
  { key: 'dev', label: 'Dev' },
  { key: 'study', label: '学习' },
]

// ─── API ────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseModelsText(text: string) {
  const list: string[] = []
  const overrides: Record<string, { model_name: string }> = {}
  text.split(/[\n,]/).map(s => s.trim()).filter(Boolean).forEach(line => {
    const m = line.match(/^(.+?)\s*=>\s*(.+)$/)
    if (m) {
      list.push(m[1].trim())
      if (m[2].trim() !== m[1].trim()) overrides[m[1].trim()] = { model_name: m[2].trim() }
    } else {
      list.push(line)
    }
  })
  return { models: list, model_overrides: overrides }
}

function encodeModelsText(models: string[], overrides?: Record<string, { model_name?: string }>) {
  return models.map(m => {
    const real = overrides?.[m]?.model_name
    return real ? `${m} => ${real}` : m
  }).join('\n')
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
  overflow: 'hidden',
}

const inputField: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 14,
  background: C.inputBg, color: C.text, outline: 'none',
  boxSizing: 'border-box',
}

const settingRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '13px 16px',
  borderBottom: `1px solid ${C.border}`,
}

const actionBtn: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '10px 0',
  borderRadius: 10, border: 'none', cursor: 'pointer',
  textAlign: 'center',
}

const tinyBtn: React.CSSProperties = {
  fontSize: 11, padding: '4px 10px', borderRadius: 8,
  background: 'none', border: `1px solid ${C.border}`,
  color: C.textSecondary, cursor: 'pointer',
}

// ─── Toggle ─────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{
      width: 44, height: 24, borderRadius: 12,
      background: checked ? C.accent : '#ddd',
      position: 'relative', cursor: 'pointer',
      transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 10, background: '#fff',
        position: 'absolute', top: 2, left: checked ? 22 : 2,
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }} />
    </div>
  )
}

// ─── Provider Config ────────────────────────────────────────────────────────

function ProviderConfig({ ch, onSaved }: {
  ch: ChannelInfo
  onSaved: () => void
}) {
  const [provider, setProvider] = useState(ch.provider)
  const [baseUrl, setBaseUrl] = useState(ch.base_url)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [modelsText, setModelsText] = useState(encodeModelsText(ch.models, ch.model_overrides))
  const [thinking, setThinking] = useState(ch.supports_thinking)
  const [thinkingFmt, setThinkingFmt] = useState(ch.thinking_format)
  const [channelTag, setChannelTag] = useState(ch.channel_tag ?? '')
  const [note, setNote] = useState(ch.note ?? '')
  const [saving, setSaving] = useState(false)

  const buildData = () => {
    const parsed = parseModelsText(modelsText)
    const data: Record<string, unknown> = {
      provider, base_url: baseUrl,
      models: parsed.models, model_overrides: parsed.model_overrides,
      supports_thinking: thinking, thinking_format: thinkingFmt,
      channel_tag: channelTag, note,
    }
    if (apiKey) data.api_key = apiKey
    return data
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const resp = await apiFetch<{ success: boolean; message: string }>(
        `/admin/channels/${encodeURIComponent(ch.name)}`,
        { method: 'PUT', body: JSON.stringify(buildData()) },
      )
      if (resp.success) { toast.success(resp.message); onSaved() }
      else toast.error(resp.message)
    } catch (e) {
      toast.error(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
    setSaving(false)
  }

  const handleSaveAndTest = async () => {
    setSaving(true)
    try {
      const resp = await apiFetch<{ success: boolean; message: string }>(
        `/admin/channels/${encodeURIComponent(ch.name)}`,
        { method: 'PUT', body: JSON.stringify(buildData()) },
      )
      if (!resp.success) { toast.error(resp.message); setSaving(false); return }
      toast.success(`${resp.message}，测试中...`)
      const test = await apiFetch<{ success: boolean; latency_ms?: number; error?: string; status_code?: number }>(
        '/admin/channels/test',
        { method: 'POST', body: JSON.stringify({ name: ch.name }) },
      )
      if (test.success) toast.success(`连通正常 (${test.latency_ms}ms)`)
      else toast.error(`连通失败: ${test.status_code ?? ''} ${test.error ?? ''}`)
      onSaved()
    } catch (e) {
      toast.error(`失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 管理 */}
      <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px' }}>管理</div>
      <div style={card}>
        <div style={settingRow}>
          <span style={{ fontSize: 14, color: C.text }}>协议类型</span>
          <select value={provider} onChange={e => setProvider(e.target.value)}
            style={{ fontSize: 13, color: C.textSecondary, background: 'none', border: 'none', textAlign: 'right', cursor: 'pointer', outline: 'none' }}>
            <option value="openai_compatible">OpenAI Compatible</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
            <option value="zenmux">ZenMux</option>
          </select>
        </div>
        <div style={settingRow}>
          <span style={{ fontSize: 14, color: C.text }}>渠道标签</span>
          <input value={channelTag} onChange={e => setChannelTag(e.target.value)}
            placeholder="如：官方直出"
            style={{ fontSize: 13, color: C.textSecondary, background: 'none', border: 'none', textAlign: 'right', outline: 'none', width: 140 }} />
        </div>
        <div style={settingRow}>
          <span style={{ fontSize: 14, color: C.text }}>Thinking</span>
          <Toggle checked={thinking} onChange={() => setThinking(!thinking)} />
        </div>
        {thinking && (
          <div style={{ ...settingRow, paddingLeft: 32 }}>
            <span style={{ fontSize: 13, color: C.textSecondary }}>格式</span>
            <select value={thinkingFmt} onChange={e => setThinkingFmt(e.target.value)}
              style={{ fontSize: 13, color: C.textSecondary, background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}>
              <option value="openai">openai</option>
              <option value="openai_xml">openai_xml</option>
              <option value="native">native</option>
            </select>
          </div>
        )}
        <div style={{ ...settingRow, borderBottom: 'none' }}>
          <span style={{ fontSize: 14, color: C.text }}>来源</span>
          <span style={{ fontSize: 13, color: C.textMuted }}>
            {ch.source === 'db' ? '自定义' : ch.source === 'hardcoded_override' ? '内置·已改' : '内置'}
          </span>
        </div>
      </div>

      {/* 连接 */}
      <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px' }}>连接</div>
      <div style={card}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>API Base URL</div>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            style={inputField} placeholder="https://api.example.com/v1" />
        </div>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>API Key（留空不修改）</div>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={ch.api_key_masked || 'sk-...'}
              style={{ ...inputField, paddingRight: 40 }}
            />
            <button onClick={() => setShowKey(!showKey)} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer',
              fontSize: 14,
            }}>
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </div>
      </div>

      {/* 可用模型 */}
      <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px' }}>供应商可用模型</div>
      <div style={card}>
        <div style={{ padding: '14px 16px' }}>
          <textarea
            value={modelsText}
            onChange={e => setModelsText(e.target.value)}
            rows={Math.max(3, modelsText.split('\n').length)}
            style={{ ...inputField, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' } as React.CSSProperties}
            placeholder={'显示名 => 上游id\n没有 => 就两者相同'}
          />
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            每行一个。用 <code style={{ background: C.surface, padding: '1px 4px', borderRadius: 3 }}>显示名 =&gt; 上游id</code> 自定义映射
          </div>
        </div>
      </div>

      {/* 备注 */}
      <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px' }}>备注</div>
      <div style={card}>
        <div style={{ padding: '14px 16px' }}>
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="（可选）" style={inputField} />
        </div>
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSaveAndTest} disabled={saving}
          style={{ ...actionBtn, flex: 1, background: 'none', border: `1px solid ${C.accent}`, color: C.accent }}>
          {saving ? '处理中...' : '保存并测试'}
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ ...actionBtn, flex: 1, background: 'none', border: `1px solid ${C.border}`, color: C.textSecondary }}>
          保存
        </button>
      </div>
    </div>
  )
}

// ─── Model Item (expandable) ────────────────────────────────────────────────

function ModelItem({ m, channelModels, expanded, onToggleExpand, onSaved }: {
  m: ModelInfo
  channelModels: string[]
  expanded: boolean
  onToggleExpand: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState(m.label)
  const [upstream, setUpstream] = useState(m.upstream_model)
  const [scenes, setScenes] = useState<string[]>(m.scene_tags)
  const [sortOrder, setSortOrder] = useState(m.sort_order)
  const [note, setNote] = useState(m.note ?? '')

  const reset = () => {
    setLabel(m.label); setUpstream(m.upstream_model)
    setScenes(m.scene_tags); setSortOrder(m.sort_order); setNote(m.note ?? '')
  }

  const save = async () => {
    const patch: Record<string, unknown> = {}
    const parts: string[] = []
    if (label !== m.label) { patch.label = label; parts.push(`名称→「${label}」`) }
    if (upstream !== m.upstream_model) { patch.upstream_model = upstream; parts.push(`上游→${upstream}`) }
    if (JSON.stringify([...scenes].sort()) !== JSON.stringify([...m.scene_tags].sort())) { patch.scene_tags = scenes; parts.push(`场景→${scenes.join(',')}`) }
    if (sortOrder !== m.sort_order) { patch.sort_order = sortOrder; parts.push(`排序→${sortOrder}`) }
    if (note !== (m.note ?? '')) { patch.note = note; parts.push('备注已改') }
    if (parts.length === 0) return
    try {
      const resp = await apiFetch<{ success: boolean; message: string }>(
        `/admin/models/${encodeURIComponent(m.name)}`,
        { method: 'PUT', body: JSON.stringify(patch) },
      )
      if (resp.success) { toast.success(`已保存：${parts.join(' / ')}`); onSaved() }
      else toast.error(resp.message)
    } catch (e) {
      toast.error(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleToggle = async () => {
    try {
      const resp = await apiFetch<{ success: boolean; enabled?: boolean; message?: string }>(
        `/admin/models/${encodeURIComponent(m.name)}/toggle`,
        { method: 'PATCH' },
      )
      if (resp.success) { toast.success(`${m.label} 已${resp.enabled ? '启用' : '停用'}`); onSaved() }
      else toast.error(resp.message ?? '切换失败')
    } catch (e) {
      toast.error(`切换失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleDelete = async () => {
    const sceneNames = m.scene_tags.map(t => SCENE_OPTIONS.find(o => o.key === t)?.label ?? t).join('/')
    if (!confirm(`确定删除「${m.label}」？\n${sceneNames} 场景将失去这个选项，不可撤销`)) return
    try {
      const resp = await apiFetch<{ success: boolean; message: string }>(
        `/admin/models/${encodeURIComponent(m.name)}`,
        { method: 'DELETE' },
      )
      if (resp.success) { toast.success(resp.message); onSaved() }
      else toast.error(resp.message)
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <div
      style={{
        padding: '14px 16px',
        borderBottom: `1px solid ${C.border}`,
        opacity: m.enabled ? 1 : 0.5,
        cursor: expanded ? 'default' : 'pointer',
      }}
      onClick={!expanded ? onToggleExpand : undefined}
    >
      {/* 摘要行 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{m.label}</div>
          <div style={{ fontSize: 12, color: C.textMuted, fontFamily: 'monospace', marginTop: 3 }}>
            {m.upstream_model}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {m.scene_tags.map(tag => (
              <span key={tag} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 8,
                background: C.surface, color: C.textSecondary,
              }}>
                {SCENE_OPTIONS.find(o => o.key === tag)?.label ?? tag}
              </span>
            ))}
          </div>
        </div>
        {!expanded && (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 10, flexShrink: 0, marginTop: 2,
            color: m.enabled ? '#4a8c5c' : C.textMuted,
            background: m.enabled ? 'rgba(34,197,94,0.08)' : C.surface,
          }}>
            {m.enabled ? '启用' : '停用'}
          </span>
        )}
      </div>

      {/* 展开编辑 */}
      {expanded && (
        <div onClick={e => e.stopPropagation()}
          style={{ marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${C.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>前端显示名</div>
            <input value={label} onChange={e => setLabel(e.target.value)} style={inputField} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>上游模型 id</div>
            <input list={`up-${m.name}`} value={upstream}
              onChange={e => setUpstream(e.target.value)}
              style={{ ...inputField, fontFamily: 'monospace' }} />
            <datalist id={`up-${m.name}`}>
              {channelModels.map(cm => <option key={cm} value={cm} />)}
            </datalist>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>场景</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SCENE_OPTIONS.map(opt => {
                const on = scenes.includes(opt.key)
                return (
                  <button key={opt.key}
                    onClick={() => setScenes(prev => on ? prev.filter(x => x !== opt.key) : [...prev, opt.key])}
                    style={{
                      fontSize: 11, padding: '5px 12px', borderRadius: 12,
                      border: `1px solid ${on ? C.accent : C.border}`,
                      color: on ? C.accent : C.textMuted,
                      background: on ? `${C.accent}0d` : 'transparent',
                      cursor: 'pointer',
                    }}>
                    {on ? '● ' : '○ '}{opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>排序（小在前）</div>
              <input type="number" value={sortOrder}
                onChange={e => setSortOrder(Number(e.target.value) || 0)} style={inputField} />
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>备注</div>
              <input value={note} onChange={e => setNote(e.target.value)}
                placeholder="（可选）" style={inputField} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={handleToggle} style={tinyBtn}>
              {m.enabled ? '停用' : '启用'}
            </button>
            <button onClick={handleDelete} style={{ ...tinyBtn, color: '#e53935' }}>删除</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => { reset(); onToggleExpand() }}
              style={{ ...tinyBtn, color: C.textSecondary }}>取消</button>
            <button onClick={save}
              style={{ ...tinyBtn, color: C.accent, borderColor: C.accent }}>保存</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add Model Form (inline, within provider) ──────────────────────────────

function AddModelInline({ channelName, channelModels, onDone }: {
  channelName: string
  channelModels: string[]
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [upstream, setUpstream] = useState('')
  const [scenes, setScenes] = useState<string[]>(['daily'])
  const [sortOrder, setSortOrder] = useState(100)
  const [note, setNote] = useState('')

  const submit = async () => {
    if (!name || !label || !upstream) { toast.warning('请填写必填项'); return }
    if (scenes.length === 0) { toast.warning('请至少选择一个场景'); return }
    try {
      const resp = await apiFetch<{ success: boolean; message: string }>('/admin/models', {
        method: 'POST',
        body: JSON.stringify({
          name, label, scene_tags: scenes,
          channel_name: channelName, upstream_model: upstream,
          enabled: true, sort_order: sortOrder, note,
        }),
      })
      if (resp.success) { toast.success(resp.message); onDone() }
      else toast.error(resp.message)
    } catch (e) {
      toast.error(`添加失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <div style={{ padding: '16px', borderTop: `1px dashed ${C.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>添加模型</div>
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>模型 id（英文，唯一）</div>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="例：opus46-guagua" style={inputField} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>前端显示名</div>
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder="例：Opus 4.6 (呱呱)" style={inputField} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>上游模型 id</div>
        <input list="add-model-ups" value={upstream}
          onChange={e => setUpstream(e.target.value)}
          placeholder={channelModels[0] ?? 'claude-opus-4-6'}
          style={{ ...inputField, fontFamily: 'monospace' }} />
        <datalist id="add-model-ups">
          {channelModels.map(cm => <option key={cm} value={cm} />)}
        </datalist>
      </div>
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>场景</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SCENE_OPTIONS.map(opt => {
            const on = scenes.includes(opt.key)
            return (
              <button key={opt.key}
                onClick={() => setScenes(prev => on ? prev.filter(x => x !== opt.key) : [...prev, opt.key])}
                style={{
                  fontSize: 11, padding: '5px 12px', borderRadius: 12,
                  border: `1px solid ${on ? C.accent : C.border}`,
                  color: on ? C.accent : C.textMuted,
                  background: on ? `${C.accent}0d` : 'transparent',
                  cursor: 'pointer',
                }}>
                {on ? '● ' : '○ '}{opt.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>排序</div>
          <input type="number" value={sortOrder}
            onChange={e => setSortOrder(Number(e.target.value) || 0)} style={inputField} />
        </div>
        <div style={{ flex: 2 }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>备注</div>
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="（可选）" style={inputField} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={submit}
          style={{ ...actionBtn, flex: 1, background: 'none', border: `1px solid ${C.accent}`, color: C.accent }}>
          添加
        </button>
        <button onClick={onDone}
          style={{ ...actionBtn, flex: 1, background: 'none', border: `1px solid ${C.border}`, color: C.textSecondary }}>
          取消
        </button>
      </div>
    </div>
  )
}

// ─── Add Provider Form ──────────────────────────────────────────────────────

function AddProviderForm({ onCreated, onCancel }: {
  onCreated: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai_compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelsText, setModelsText] = useState('')
  const [thinking, setThinking] = useState(true)
  const [thinkingFmt, setThinkingFmt] = useState('openai')
  const [channelTag, setChannelTag] = useState('')

  const submit = async () => {
    if (!name || !baseUrl || !apiKey || !modelsText.trim()) {
      toast.warning('请填写名称、URL、Key 和至少一个模型')
      return
    }
    const parsed = parseModelsText(modelsText)
    try {
      await apiFetch('/admin/channels', {
        method: 'POST',
        body: JSON.stringify({
          name, provider, base_url: baseUrl, api_key: apiKey,
          models: parsed.models, model_overrides: parsed.model_overrides,
          supports_thinking: thinking, thinking_format: thinkingFmt,
          channel_tag: channelTag, note: '',
        }),
      })
      toast.success(`供应商 ${name} 已添加`)
      onCreated(name)
    } catch (e) {
      toast.error(`添加失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px' }}>基本信息</div>
      <div style={card}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>名称（英文，唯一）</div>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="例：guagua" style={inputField} />
        </div>
        <div style={settingRow}>
          <span style={{ fontSize: 14, color: C.text }}>协议类型</span>
          <select value={provider} onChange={e => setProvider(e.target.value)}
            style={{ fontSize: 13, color: C.textSecondary, background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}>
            <option value="openai_compatible">OpenAI Compatible</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
            <option value="zenmux">ZenMux</option>
          </select>
        </div>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>渠道标签</div>
          <input value={channelTag} onChange={e => setChannelTag(e.target.value)}
            placeholder="官方直出 / 中转 / ..." style={inputField} />
        </div>
        <div style={settingRow}>
          <span style={{ fontSize: 14, color: C.text }}>Thinking</span>
          <Toggle checked={thinking} onChange={() => setThinking(!thinking)} />
        </div>
        {thinking && (
          <div style={{ ...settingRow, paddingLeft: 32 }}>
            <span style={{ fontSize: 13, color: C.textSecondary }}>格式</span>
            <select value={thinkingFmt} onChange={e => setThinkingFmt(e.target.value)}
              style={{ fontSize: 13, color: C.textSecondary, background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}>
              <option value="openai">openai</option>
              <option value="openai_xml">openai_xml</option>
              <option value="native">native</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px' }}>连接</div>
      <div style={card}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>API Base URL</div>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1" style={inputField} />
        </div>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>API Key</div>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..." style={inputField} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px' }}>可用模型</div>
      <div style={card}>
        <div style={{ padding: '14px 16px' }}>
          <textarea value={modelsText} onChange={e => setModelsText(e.target.value)}
            rows={3} placeholder={'每行一个模型名\n显示名 => 上游id'}
            style={{ ...inputField, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' } as React.CSSProperties} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={submit}
          style={{ ...actionBtn, flex: 1, background: 'none', border: `1px solid ${C.accent}`, color: C.accent }}>
          创建
        </button>
        <button onClick={onCancel}
          style={{ ...actionBtn, flex: 1, background: 'none', border: `1px solid ${C.border}`, color: C.textSecondary }}>
          取消
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ModelRoutingTab() {
  const [channels, setChannels] = useState<ChannelInfo[] | null>(null)
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [channelBriefs, setChannelBriefs] = useState<ChannelBrief[]>([])

  // 导航状态
  const [selected, setSelected] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<'config' | 'models'>('config')
  const [adding, setAdding] = useState(false)
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [showAddModel, setShowAddModel] = useState(false)

  const loadChannels = useCallback(async () => {
    try {
      const data = await apiFetch<{ channels: ChannelInfo[] }>('/admin/channels')
      setChannels(data.channels)
    } catch { setChannels([]) }
  }, [])

  const loadModels = useCallback(async () => {
    try {
      const data = await apiFetch<{ models: ModelInfo[]; channels: ChannelBrief[] }>('/admin/models')
      setModels(data.models ?? [])
      setChannelBriefs(data.channels ?? [])
    } catch {
      setModels([])
      setChannelBriefs([])
    }
  }, [])

  useEffect(() => { loadChannels(); loadModels() }, [loadChannels, loadModels])

  const reload = () => { loadChannels(); loadModels() }

  const ch = selected ? channels?.find(c => c.name === selected) ?? null : null
  const providerModels = selected ? (models?.filter(m => m.channel_name === selected) ?? []) : []
  const providerModelNames = ch?.models ?? []

  // 供应商操作
  const handleToggleChannel = async () => {
    if (!ch) return
    try {
      const resp = await apiFetch<{ success: boolean; message: string }>(
        `/admin/channels/${encodeURIComponent(ch.name)}/toggle`,
        { method: 'PATCH' },
      )
      if (resp.success) { toast.success(resp.message); reload() }
      else toast.error(resp.message)
    } catch (e) {
      toast.error(`操作失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleDeleteChannel = async () => {
    if (!ch) return
    const isHardcoded = ch.source === 'hardcoded' || ch.source === 'hardcoded_override'
    const msg = isHardcoded
      ? `确定恢复「${ch.name}」到默认配置？`
      : `确定删除「${ch.name}」？不可撤销。`
    if (!confirm(msg)) return
    try {
      const resp = await apiFetch<{ success: boolean; message: string }>(
        `/admin/channels/${encodeURIComponent(ch.name)}`,
        { method: 'DELETE' },
      )
      if (resp.success) { toast.success(resp.message); setSelected(null); reload() }
      else toast.error(resp.message)
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const handleTestChannel = async () => {
    if (!ch) return
    try {
      const data = await apiFetch<{ success: boolean; latency_ms?: number; error?: string; status_code?: number }>(
        '/admin/channels/test',
        { method: 'POST', body: JSON.stringify({ name: ch.name }) },
      )
      if (data.success) toast.success(`${ch.name} 连通正常 (${data.latency_ms}ms)`)
      else toast.error(`连通失败: ${data.status_code ?? ''} ${data.error ?? ''}`)
    } catch (e) {
      toast.error(`测试失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  // ─── Provider List View ───────────────────────────────────────────────

  if (!selected && !adding) {
    return (
      <>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>供应商</span>
          <button onClick={() => setAdding(true)} style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'none', border: `1px solid ${C.border}`,
            color: C.accent, fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
        </div>

        {/* List */}
        <div style={card}>
          {channels === null ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>加载中...</div>
          ) : channels.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>还没有供应商</div>
          ) : channels.map((c, i) => {
            const modelCount = models?.filter(m => m.channel_name === c.name).length ?? 0
            return (
              <div
                key={c.name}
                onClick={() => { setSelected(c.name); setSubTab('config'); setExpandedModel(null); setShowAddModel(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px',
                  borderBottom: i < channels.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer',
                  opacity: c.enabled ? 1 : 0.5,
                }}
              >
                {/* 状态灯 */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: c.enabled ? C.success : C.textMuted,
                  boxShadow: c.enabled ? `0 0 6px ${C.success}40` : 'none',
                }} />

                {/* 名称 + 标签 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: C.text }}>{c.name}</span>
                    {c.channel_tag && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                        border: `1px solid ${C.accent}40`, color: C.accent,
                      }}>{c.channel_tag}</span>
                    )}
                  </div>
                  {modelCount > 0 && (
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                      {modelCount} 个模型
                    </div>
                  )}
                </div>

                {/* 状态 badge */}
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 10, flexShrink: 0,
                  color: c.enabled ? '#4a8c5c' : C.textMuted,
                  background: c.enabled ? 'rgba(34,197,94,0.08)' : C.surface,
                }}>
                  {c.enabled ? '启用' : '禁用'}
                </span>

                {/* 箭头 */}
                <span style={{ color: C.textMuted, fontSize: 16, flexShrink: 0 }}>›</span>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // ─── Add Provider View ────────────────────────────────────────────────

  if (adding) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={() => setAdding(false)} style={{
            background: 'none', border: 'none', color: C.textSecondary,
            cursor: 'pointer', fontSize: 18, padding: 4,
          }}>←</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>添加供应商</span>
        </div>
        <AddProviderForm
          onCreated={(name) => { setAdding(false); setSelected(name); setSubTab('config'); reload() }}
          onCancel={() => setAdding(false)}
        />
      </>
    )
  }

  // ─── Provider Detail View ─────────────────────────────────────────────

  if (!ch) {
    setSelected(null)
    return null
  }

  const isHardcoded = ch.source === 'hardcoded' || ch.source === 'hardcoded_override'

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setSelected(null)} style={{
            background: 'none', border: 'none', color: C.textSecondary,
            cursor: 'pointer', fontSize: 18, padding: 4,
          }}>←</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{ch.name}</span>
          {ch.channel_tag && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              border: `1px solid ${C.accent}40`, color: C.accent,
            }}>{ch.channel_tag}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleTestChannel} style={tinyBtn}>测试</button>
          <button onClick={handleToggleChannel}
            style={{ ...tinyBtn, color: ch.enabled ? C.textSecondary : C.accent }}>
            {ch.enabled ? '停用' : '启用'}
          </button>
          <button onClick={handleDeleteChannel}
            style={{ ...tinyBtn, color: isHardcoded ? '#e65100' : '#e53935' }}>
            {isHardcoded ? '恢复默认' : '删除'}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 14,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {(['config', 'models'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            padding: '10px 20px', fontSize: 13,
            fontWeight: subTab === t ? 600 : 400,
            color: subTab === t ? C.accent : C.textMuted,
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: subTab === t ? `2px solid ${C.accent}` : '2px solid transparent',
            transition: 'all 0.2s',
          }}>
            {t === 'config' ? '配置' : `模型 (${providerModels.length})`}
          </button>
        ))}
      </div>

      {/* Config tab */}
      {subTab === 'config' && (
        <ProviderConfig
          key={ch.name + ch.base_url + ch.api_key_masked + String(ch.enabled)}
          ch={ch}
          onSaved={reload}
        />
      )}

      {/* Models tab */}
      {subTab === 'models' && (
        <>
          <div style={card}>
            {providerModels.length === 0 && !showAddModel ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                这个供应商还没有模型路由
              </div>
            ) : (
              providerModels.map(m => (
                <ModelItem
                  key={m.name}
                  m={m}
                  channelModels={providerModelNames}
                  expanded={expandedModel === m.name}
                  onToggleExpand={() => setExpandedModel(expandedModel === m.name ? null : m.name)}
                  onSaved={() => { setExpandedModel(null); reload() }}
                />
              ))
            )}
            {showAddModel && (
              <AddModelInline
                channelName={ch.name}
                channelModels={providerModelNames}
                onDone={() => { setShowAddModel(false); reload() }}
              />
            )}
          </div>

          {!showAddModel && (
            <button onClick={() => setShowAddModel(true)} style={{
              ...actionBtn, width: '100%', marginTop: 10,
              background: 'none', border: `1px dashed ${C.border}`, color: C.accent,
            }}>
              + 添加模型
            </button>
          )}
        </>
      )}
    </>
  )
}
