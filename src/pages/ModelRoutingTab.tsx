import { useState, useEffect, useCallback, useRef } from 'react'
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
  is_warmup_target?: boolean
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

// 根据模型名/协议类型猜一个 emoji 图标（纯装饰）
function guessProviderIcon(provider: string, name: string): string {
  const n = name.toLowerCase()
  if (n.includes('claude') || n.includes('opus') || n.includes('sonnet')) return '✦'
  if (n.includes('deepseek')) return '◈'
  if (n.includes('gemini') || n.includes('google')) return '◆'
  if (n.includes('openrouter')) return '◁'
  if (n.includes('zenmux')) return '◉'
  if (provider === 'anthropic') return '✦'
  return n.slice(0, 1).toUpperCase() || 'A'
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
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${C.border}`, fontSize: 14,
  background: C.inputBg, color: C.text, outline: 'none',
  boxSizing: 'border-box',
}

const settingRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '13px 16px',
  borderBottom: `1px solid ${C.border}`,
}

const tinyBtn: React.CSSProperties = {
  fontSize: 12, padding: '5px 12px', borderRadius: 10,
  background: 'none', border: `1px solid ${C.border}`,
  color: C.textSecondary, cursor: 'pointer',
}

const pillBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '9px 0',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  border: 'none',
  background: active ? `${C.accent}1a` : 'transparent',
  color: active ? C.accent : C.textSecondary,
  cursor: 'pointer',
  transition: 'all 0.15s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
})

// ─── Toggle ─────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <div onClick={disabled ? undefined : onChange} style={{
      width: 44, height: 24, borderRadius: 12,
      background: checked ? C.accent : '#d8d2c8',
      position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background 0.2s', flexShrink: 0,
      opacity: disabled ? 0.4 : 1,
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

// ─── 能力徽章（聊天/T→T/工具/推理） ─────────────────────────────────────────

function CapabilityBadges({ m }: { m: ModelInfo }) {
  // 目前后端只有 scene_tags + upstream model，先展示静态"聊天"+ "T→T"
  // 工具/推理靠模型名/场景推断
  const nameL = m.upstream_model.toLowerCase()
  const hasReasoning = /thinking|reasoner|r1/.test(nameL) || m.name.includes('thinking')
  const hasTools = true // 默认都支持

  const badge = (bg: string, color: string, content: React.ReactNode, key: string) => (
    <span key={key} style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 10, padding: '3px 8px', borderRadius: 8,
      background: bg, color: color, gap: 3, flexShrink: 0,
      fontFamily: 'monospace', letterSpacing: 0.3,
    }}>{content}</span>
  )

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {badge(`${C.accent}14`, C.accent, '聊天', 'chat')}
      {badge(`${C.accent}10`, C.textSecondary, 'T ▸ T', 'mode')}
      {hasTools && badge(`${C.accent}10`, C.textSecondary, '🔧', 'tool')}
      {hasReasoning && badge('rgba(180,140,90,0.12)', '#8a6548', '💭', 'reason')}
    </div>
  )
}

// ─── Scene Tags 编辑器 ──────────────────────────────────────────────────────

function SceneTagEditor({ scenes, setScenes }: {
  scenes: string[]; setScenes: (s: string[]) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {SCENE_OPTIONS.map(opt => {
        const on = scenes.includes(opt.key)
        return (
          <button key={opt.key}
            onClick={() => setScenes(on ? scenes.filter(x => x !== opt.key) : [...scenes, opt.key])}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 14,
              border: `1px solid ${on ? C.accent : C.border}`,
              color: on ? C.accent : C.textMuted,
              background: on ? `${C.accent}0d` : 'transparent',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── 模型编辑 Bottom Sheet ─────────────────────────────────────────────────

function ModelEditSheet({ m, channelModels, onClose, onSaved }: {
  m: ModelInfo
  channelModels: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'builtin'>('basic')
  const [upstream, setUpstream] = useState(m.upstream_model)
  const [label, setLabel] = useState(m.label)
  const [modelType, setModelType] = useState<'chat' | 'embedding'>('chat')
  const [inputModes, setInputModes] = useState<string[]>(['text'])
  const [outputModes, setOutputModes] = useState<string[]>(['text'])
  const [capTool, setCapTool] = useState(true)
  const [capReason, setCapReason] = useState(/thinking|reasoner|r1/.test(m.upstream_model.toLowerCase()))
  const [scenes, setScenes] = useState<string[]>(m.scene_tags)
  const [thinkingOn, setThinkingOn] = useState(capReason)
  const [thinkingFmt, setThinkingFmt] = useState('openai')
  const [sortOrder, setSortOrder] = useState(m.sort_order)
  const [note, setNote] = useState(m.note ?? '')

  const toggleIn = (k: string) => setInputModes(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])
  const toggleOut = (k: string) => setOutputModes(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])

  const save = async () => {
    const patch: Record<string, unknown> = {}
    const parts: string[] = []
    if (label !== m.label) { patch.label = label; parts.push(`名称→「${label}」`) }
    if (upstream !== m.upstream_model) { patch.upstream_model = upstream; parts.push(`上游→${upstream}`) }
    if (JSON.stringify([...scenes].sort()) !== JSON.stringify([...m.scene_tags].sort())) {
      patch.scene_tags = scenes; parts.push(`场景→${scenes.join(',')}`)
    }
    if (sortOrder !== m.sort_order) { patch.sort_order = sortOrder; parts.push(`排序→${sortOrder}`) }
    if (note !== (m.note ?? '')) { patch.note = note; parts.push('备注已改') }
    if (parts.length === 0) { onClose(); return }
    try {
      const resp = await apiFetch<{ success: boolean; message: string }>(
        `/admin/models/${encodeURIComponent(m.name)}`,
        { method: 'PUT', body: JSON.stringify(patch) },
      )
      if (resp.success) { toast.success(`已保存：${parts.join(' / ')}`); onSaved(); onClose() }
      else toast.error(resp.message)
    } catch (e) {
      toast.error(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.28)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'sheetFadeIn 0.18s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: C.bg,
          borderRadius: '20px 20px 0 0',
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          animation: 'sheetSlideUp 0.22s ease-out',
          boxShadow: '0 -6px 30px rgba(0,0,0,0.12)',
        }}
      >
        {/* Handle */}
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.borderStrong }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 18px 10px' }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, color: C.textSecondary,
            cursor: 'pointer', padding: 4, lineHeight: 1,
          }}>×</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600, color: C.text }}>
            编辑模型
          </div>
          <div style={{ width: 28 }} />
        </div>

        {/* Tabs */}
        <div style={{ padding: '4px 16px 12px', display: 'flex', gap: 4 }}>
          <button onClick={() => setActiveTab('basic')} style={pillBtn(activeTab === 'basic')}>基本设置</button>
          <button onClick={() => setActiveTab('advanced')} style={pillBtn(activeTab === 'advanced')}>高级设置</button>
          <button onClick={() => setActiveTab('builtin')} style={pillBtn(activeTab === 'builtin')}>内置工具</button>
        </div>

        {/* Body scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 16px' }}>
          {activeTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>上游 ID</div>
                <input list={`up-${m.name}`} value={upstream}
                  onChange={e => setUpstream(e.target.value)}
                  style={{ ...inputField, fontFamily: 'monospace' }} />
                <datalist id={`up-${m.name}`}>
                  {channelModels.map(cm => <option key={cm} value={cm} />)}
                </datalist>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                  上游 API 识别用。模型 ID（我们系统内标识）：<code style={{ background: C.surface, padding: '1px 5px', borderRadius: 3 }}>{m.name}</code>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>模型名称</div>
                <input value={label} onChange={e => setLabel(e.target.value)} style={inputField}
                  placeholder="前端显示用，可自由编辑" />
              </div>

              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>模型类型</div>
                <SegmentedOptions
                  options={[{ key: 'chat', label: '聊天' }, { key: 'embedding', label: '嵌入' }]}
                  value={[modelType]}
                  onToggle={k => setModelType(k as 'chat' | 'embedding')}
                  single
                  disabled
                />
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>暂仅支持"聊天"</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>输入模式</div>
                <SegmentedOptions
                  options={[{ key: 'text', label: '文本' }, { key: 'image', label: '图片' }]}
                  value={inputModes}
                  onToggle={toggleIn}
                  disabled
                />
              </div>

              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>输出模式</div>
                <SegmentedOptions
                  options={[{ key: 'text', label: '文本' }, { key: 'image', label: '图片' }]}
                  value={outputModes}
                  onToggle={toggleOut}
                  disabled
                />
              </div>

              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>能力</div>
                <SegmentedOptions
                  options={[{ key: 'tool', label: '工具' }, { key: 'reasoning', label: '推理' }]}
                  value={[capTool && 'tool', capReason && 'reasoning'].filter(Boolean) as string[]}
                  onToggle={k => {
                    if (k === 'tool') setCapTool(!capTool)
                    else setCapReason(!capReason)
                  }}
                  disabled
                />
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>（字段待后端扩展）</div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>场景标签</div>
                <SceneTagEditor scenes={scenes} setScenes={setScenes} />
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
                  晨在不同场景会从对应标签的模型里选。
                </div>
              </div>

              <div style={{ ...card, padding: 0 }}>
                <div style={{ ...settingRow, padding: '12px 14px' }}>
                  <div>
                    <div style={{ fontSize: 13, color: C.text }}>Thinking</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>开启后，晨可以展示思考过程</div>
                  </div>
                  <Toggle checked={thinkingOn} onChange={() => setThinkingOn(!thinkingOn)} />
                </div>
                {thinkingOn && (
                  <div style={{ ...settingRow, padding: '12px 14px', borderBottom: 'none' }}>
                    <span style={{ fontSize: 13, color: C.text }}>Thinking 格式</span>
                    <select value={thinkingFmt} onChange={e => setThinkingFmt(e.target.value)}
                      style={{ fontSize: 13, color: C.textSecondary, background: 'none', border: `1px solid ${C.border}`, padding: '4px 8px', borderRadius: 8, cursor: 'pointer', outline: 'none' }}>
                      <option value="openai">openai (reasoning_content)</option>
                      <option value="openai_xml">openai_xml (&lt;thinking&gt;)</option>
                      <option value="native">native (Anthropic)</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
                  供应商重写 <span style={{ fontSize: 10 }}>（暂未实现）</span>
                </div>
                <button disabled style={{
                  width: '100%', padding: '10px 0', borderRadius: 10,
                  background: 'none', border: `1px dashed ${C.border}`,
                  color: C.textMuted, fontSize: 13, cursor: 'not-allowed',
                }}>+ 添加供应商重写</button>
              </div>

              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
                  自定义 Headers <span style={{ fontSize: 10 }}>（暂未实现）</span>
                </div>
                <button disabled style={{
                  width: '100%', padding: '10px 0', borderRadius: 10,
                  background: 'none', border: `1px dashed ${C.border}`,
                  color: C.textMuted, fontSize: 13, cursor: 'not-allowed',
                }}>+ 添加 Header</button>
              </div>

              <div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
                  自定义 Body <span style={{ fontSize: 10 }}>（暂未实现）</span>
                </div>
                <button disabled style={{
                  width: '100%', padding: '10px 0', borderRadius: 10,
                  background: 'none', border: `1px dashed ${C.border}`,
                  color: C.textMuted, fontSize: 13, cursor: 'not-allowed',
                }}>+ 添加 Body</button>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>排序（小在前）</div>
                  <input type="number" value={sortOrder}
                    onChange={e => setSortOrder(Number(e.target.value) || 0)} style={inputField} />
                </div>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>备注</div>
                  <input value={note} onChange={e => setNote(e.target.value)}
                    placeholder="（可选）" style={inputField} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'builtin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
                内置工具仅支持官方 API。<br />
                需要启用 OpenAI Responses API。
              </div>
              <div style={{ ...card, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.55 }}>
                <div>
                  <div style={{ fontSize: 13, color: C.text }}>代码解释器</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>启用代码解释器工具（容器自动，内存上限 4g）</div>
                </div>
                <Toggle checked={false} onChange={() => { }} disabled />
              </div>
              <div style={{ ...card, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.55 }}>
                <div>
                  <div style={{ fontSize: 13, color: C.text }}>图像生成</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>启用图像生成工具</div>
                </div>
                <Toggle checked={false} onChange={() => { }} disabled />
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 8 }}>暂未实现</div>
            </div>
          )}
        </div>

        {/* Footer 确认 */}
        <div style={{ padding: '12px 18px 18px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <button onClick={save} style={{
            width: '100%', padding: '12px 0',
            background: `${C.accent}14`, color: C.accent,
            border: 'none', borderRadius: 12,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            ✓ 确认
          </button>
        </div>
      </div>

      {/* 动画 keyframes */}
      <style>{`
        @keyframes sheetFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sheetSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  )
}

// ─── SegmentedOptions（多选/单选按钮组） ───────────────────────────────────

function SegmentedOptions({ options, value, onToggle, single, disabled }: {
  options: { key: string; label: string }[]
  value: string[]
  onToggle: (k: string) => void
  single?: boolean
  disabled?: boolean
}) {
  return (
    <div style={{
      display: 'flex', gap: 0, padding: 3, borderRadius: 12,
      background: `${C.accent}08`,
    }}>
      {options.map(opt => {
        const on = value.includes(opt.key)
        return (
          <button
            key={opt.key}
            onClick={() => !disabled && onToggle(opt.key)}
            disabled={disabled}
            style={{
              flex: 1, padding: '8px 0',
              background: on ? '#fff' : 'transparent',
              color: on ? C.accent : C.textMuted,
              border: 'none', borderRadius: 10,
              fontSize: 13, fontWeight: on ? 600 : 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'all 0.15s',
              boxShadow: on ? '0 1px 3px rgba(160,120,90,0.15)' : 'none',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {on && <span>✓</span>}{opt.label}
          </button>
        )
      })}
      {single && <span style={{ display: 'none' }} />}
    </div>
  )
}

// ─── Provider Config Tab ───────────────────────────────────────────────────

function ProviderConfigTab({ ch, onSaved }: {
  ch: ChannelInfo
  onSaved: () => void
}) {
  const [provider, setProvider] = useState(ch.provider)
  const [baseUrl, setBaseUrl] = useState(ch.base_url)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [apiPath, setApiPath] = useState('/chat/completions')
  const [channelTag, setChannelTag] = useState(ch.channel_tag ?? '')
  const [modelsText, setModelsText] = useState(encodeModelsText(ch.models, ch.model_overrides))
  const [enabled, setEnabled] = useState(ch.enabled)
  const [note, setNote] = useState(ch.note ?? '')
  const [saving, setSaving] = useState(false)

  const buildData = () => {
    const parsed = parseModelsText(modelsText)
    const data: Record<string, unknown> = {
      provider, base_url: baseUrl,
      models: parsed.models, model_overrides: parsed.model_overrides,
      supports_thinking: ch.supports_thinking, // 保留：模型级切到 advanced tab 后此处不动
      thinking_format: ch.thinking_format,
      channel_tag: channelTag, note,
    }
    if (apiKey) data.api_key = apiKey
    return data
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 启用状态独立处理
      if (enabled !== ch.enabled) {
        await apiFetch(`/admin/channels/${encodeURIComponent(ch.name)}/toggle`, { method: 'PATCH' })
      }
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

  const handleTest = async () => {
    try {
      const test = await apiFetch<{ success: boolean; latency_ms?: number; error?: string; status_code?: number }>(
        '/admin/channels/test',
        { method: 'POST', body: JSON.stringify({ name: ch.name }) },
      )
      if (test.success) toast.success(`连通正常 (${test.latency_ms}ms)`)
      else toast.error(`连通失败: ${test.status_code ?? ''} ${test.error ?? ''}`)
    } catch (e) {
      toast.error(`测试失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 管理卡片 */}
      <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px' }}>管理</div>
      <div style={card}>
        <div style={settingRow}>
          <span style={{ fontSize: 14, color: C.text }}>供应商类型</span>
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
            style={{ fontSize: 13, color: C.textSecondary, background: 'none', border: 'none', textAlign: 'right', outline: 'none', width: 160 }} />
        </div>
        <div style={settingRow}>
          <span style={{ fontSize: 14, color: C.text }}>是否启用</span>
          <Toggle checked={enabled} onChange={() => setEnabled(!enabled)} />
        </div>
        <div style={settingRow}>
          <div>
            <div style={{ fontSize: 14, color: C.text }}>多 Key 模式</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>暂未实现</div>
          </div>
          <Toggle checked={false} onChange={() => { }} disabled />
        </div>
        <div style={settingRow}>
          <div>
            <div style={{ fontSize: 14, color: C.text }}>Response API (/responses)</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>暂未实现</div>
          </div>
          <Toggle checked={false} onChange={() => { }} disabled />
        </div>
        <div style={{ ...settingRow, borderBottom: 'none', cursor: 'not-allowed', opacity: 0.55 }}>
          <div>
            <div style={{ fontSize: 14, color: C.text }}>网络代理</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>暂未实现</div>
          </div>
          <span style={{ color: C.textMuted }}>›</span>
        </div>
      </div>

      {/* 名称 */}
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px', marginBottom: 6 }}>名称</div>
        <input value={ch.name} readOnly style={{ ...inputField, background: C.surface, cursor: 'not-allowed' }} />
      </div>

      {/* API Key */}
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px', marginBottom: 6 }}>API Key</div>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={ch.api_key_masked || '留空不修改'}
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

      {/* API Base URL */}
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px', marginBottom: 6 }}>API Base URL</div>
        <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
          style={inputField} placeholder="https://api.example.com/v1" />
      </div>

      {/* API 路径 */}
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px', marginBottom: 6 }}>API 路径</div>
        <input value={apiPath} onChange={e => setApiPath(e.target.value)}
          style={{ ...inputField, fontFamily: 'monospace' }} placeholder="/chat/completions" />
        <div style={{ fontSize: 11, color: C.textMuted, padding: '4px 4px 0' }}>当前仅作占位展示，实际路径由 Gateway 按协议决定</div>
      </div>

      {/* 可用模型 */}
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px', marginBottom: 6 }}>供应商可用模型</div>
        <textarea
          value={modelsText}
          onChange={e => setModelsText(e.target.value)}
          rows={Math.max(3, modelsText.split('\n').length)}
          style={{ ...inputField, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' } as React.CSSProperties}
          placeholder={'每行一个\n显示名 => 上游id  (可选)'}
        />
      </div>

      {/* 备注 */}
      <div>
        <div style={{ fontSize: 12, color: C.textMuted, padding: '2px 4px', marginBottom: 6 }}>备注</div>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="（可选）" style={inputField} />
      </div>

      {/* 来源信息 */}
      <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center' }}>
        来源：{ch.source === 'db' ? '自定义' : ch.source === 'hardcoded_override' ? '内置·已改' : '内置'}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={handleTest}
          style={{
            flex: 1, padding: '12px 0',
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 12, color: C.textSecondary, cursor: 'pointer',
            fontSize: 14, fontWeight: 500,
          }}>测试连通</button>
        <button onClick={handleSave} disabled={saving}
          style={{
            flex: 1, padding: '12px 0',
            background: `${C.accent}14`, border: 'none',
            borderRadius: 12, color: C.accent, cursor: saving ? 'wait' : 'pointer',
            fontSize: 14, fontWeight: 600,
          }}>{saving ? '保存中...' : '保存'}</button>
      </div>
    </div>
  )
}

// ─── Provider Models Tab ──────────────────────────────────────────────────

function ProviderModelsTab({ ch, models, onReload }: {
  ch: ChannelInfo
  models: ModelInfo[]
  onReload: () => void
}) {
  const [editing, setEditing] = useState<ModelInfo | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const handleToggle = async (m: ModelInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const resp = await apiFetch<{ success: boolean; enabled?: boolean; message?: string }>(
        `/admin/models/${encodeURIComponent(m.name)}/toggle`,
        { method: 'PATCH' },
      )
      if (resp.success) { toast.success(`${m.label} 已${resp.enabled ? '启用' : '停用'}`); onReload() }
      else toast.error(resp.message ?? '切换失败')
    } catch (err) {
      toast.error(`切换失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  const handleWarmupToggle = async (m: ModelInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const resp = await apiFetch<{ success: boolean; is_warmup_target?: boolean; message?: string }>(
        `/admin/models/${encodeURIComponent(m.name)}/warmup-target`,
        { method: 'PATCH' },
      )
      if (resp.success) {
        toast.success(resp.message ?? (resp.is_warmup_target ? `${m.label} 已设为续命目标` : '已取消续命目标'))
        onReload()
      } else {
        toast.error(resp.message ?? '切换失败')
      }
    } catch (err) {
      toast.error(`切换失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  const handleBatchDelete = async () => {
    if (selected.size === 0) { setDeleteMode(false); return }
    if (!confirm(`确定删除 ${selected.size} 个模型？不可撤销`)) return
    const names = Array.from(selected)
    let ok = 0, fail = 0
    for (const name of names) {
      try {
        const resp = await apiFetch<{ success: boolean }>(
          `/admin/models/${encodeURIComponent(name)}`,
          { method: 'DELETE' },
        )
        if (resp.success) ok++; else fail++
      } catch { fail++ }
    }
    toast.success(`已删除 ${ok} 个${fail ? `，失败 ${fail}` : ''}`)
    setDeleteMode(false); setSelected(new Set()); onReload()
  }

  return (
    <>
      <div style={{ ...card, padding: 0 }}>
        {models.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            这个供应商还没有模型路由
          </div>
        ) : models.map((m, i) => {
          const isSel = selected.has(m.name)
          return (
            <div
              key={m.name}
              onClick={() => {
                if (deleteMode) {
                  const ns = new Set(selected)
                  if (ns.has(m.name)) ns.delete(m.name); else ns.add(m.name)
                  setSelected(ns)
                } else {
                  setEditing(m)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px',
                borderBottom: i < models.length - 1 ? `1px solid ${C.border}` : 'none',
                cursor: 'pointer',
                opacity: m.enabled ? 1 : 0.5,
                background: isSel ? `${C.accent}08` : 'transparent',
                transition: 'background 0.12s',
              }}
            >
              {deleteMode && (
                <div style={{
                  width: 18, height: 18, borderRadius: 9,
                  border: `1.5px solid ${isSel ? C.accent : C.border}`,
                  background: isSel ? C.accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 11, flexShrink: 0,
                }}>{isSel && '✓'}</div>
              )}

              {/* 图标 */}
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `${C.accent}10`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.accent, fontSize: 16, flexShrink: 0,
              }}>
                {guessProviderIcon(ch.provider, m.upstream_model)}
              </div>

              {/* 名称 + 徽章 + 场景 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 500, marginBottom: 4, wordBreak: 'break-all' }}>
                  {m.label}
                </div>
                <CapabilityBadges m={m} />
                {m.scene_tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                    {m.scene_tags.map(t => (
                      <span key={t} style={{
                        fontSize: 10, padding: '1px 7px', borderRadius: 7,
                        background: C.surface, color: C.textSecondary,
                      }}>{SCENE_OPTIONS.find(o => o.key === t)?.label ?? t}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* 续命目标切换 ⚡ */}
              {!deleteMode && (
                <button onClick={e => handleWarmupToggle(m, e)} style={{
                  background: m.is_warmup_target ? `${C.accent}18` : 'none',
                  border: 'none', color: m.is_warmup_target ? C.accent : C.textMuted,
                  cursor: 'pointer', fontSize: 16, padding: 6, flexShrink: 0,
                  lineHeight: 1, borderRadius: 8,
                }} title={m.is_warmup_target ? '当前续命目标（点击取消）' : '设为缓存续命目标'}>
                  ⚡
                </button>
              )}

              {/* 启用/停用切换（右侧小图标） */}
              {!deleteMode && (
                <button onClick={e => handleToggle(m, e)} style={{
                  background: 'none', border: 'none', color: C.textMuted,
                  cursor: 'pointer', fontSize: 18, padding: 6, flexShrink: 0,
                  lineHeight: 1,
                }} title={m.enabled ? '停用' : '启用'}>
                  {m.enabled ? '⚙' : '○'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 底部操作按钮 */}
      <div style={{
        marginTop: 14,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: '#fff', borderRadius: 14,
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
      }}>
        <button style={{
          padding: '8px 16px', borderRadius: 10,
          border: `1px solid ${C.accent}`, color: C.accent,
          background: 'none', fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
        }} onClick={() => toast.info('获取功能待实现')}>
          <span>◉</span> 获取
        </button>
        <button onClick={() => setAdding(true)} style={{
          flex: 1,
          padding: '8px 16px', borderRadius: 10,
          background: `${C.accent}14`, color: C.accent,
          border: 'none', fontSize: 13, cursor: 'pointer',
          fontWeight: 500,
        }}>
          + 添加新模型
        </button>
        {deleteMode ? (
          <>
            <button onClick={() => { setDeleteMode(false); setSelected(new Set()) }} style={{
              padding: '8px 14px', borderRadius: 10,
              background: 'none', border: `1px solid ${C.border}`,
              color: C.textSecondary, fontSize: 13, cursor: 'pointer',
            }}>取消</button>
            <button onClick={handleBatchDelete} style={{
              padding: '8px 14px', borderRadius: 10,
              background: '#fee', border: 'none',
              color: '#e53935', fontSize: 13, cursor: 'pointer',
              fontWeight: 500,
            }}>删除 ({selected.size})</button>
          </>
        ) : (
          <button onClick={() => setDeleteMode(true)} style={{
            padding: '8px 12px', borderRadius: 10,
            background: '#fee', border: 'none',
            color: '#e53935', fontSize: 14, cursor: 'pointer',
          }} title="批量删除">
            🗑
          </button>
        )}
      </div>

      {/* 添加模型 sheet（复用 ModelEditSheet 的壳，但内容不同） */}
      {adding && (
        <AddModelSheet
          channelName={ch.name}
          channelModels={ch.models}
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); onReload() }}
        />
      )}

      {editing && (
        <ModelEditSheet
          m={editing}
          channelModels={ch.models}
          onClose={() => setEditing(null)}
          onSaved={onReload}
        />
      )}
    </>
  )
}

// ─── Add Model Sheet ───────────────────────────────────────────────────────

function AddModelSheet({ channelName, channelModels, onClose, onDone }: {
  channelName: string
  channelModels: string[]
  onClose: () => void
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
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.28)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'sheetFadeIn 0.18s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: C.bg, borderRadius: '20px 20px 0 0',
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          animation: 'sheetSlideUp 0.22s ease-out',
          boxShadow: '0 -6px 30px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.borderStrong }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 18px 12px' }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, color: C.textSecondary,
            cursor: 'pointer', padding: 4, lineHeight: 1,
          }}>×</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600, color: C.text }}>
            添加模型
          </div>
          <div style={{ width: 28 }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>模型 ID（系统内唯一）</div>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="例：opus46-guagua" style={{ ...inputField, fontFamily: 'monospace' }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>模型名称（前端显示）</div>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="例：Opus 4.6 (呱呱)" style={inputField} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>上游 ID</div>
            <input list="add-up-list" value={upstream}
              onChange={e => setUpstream(e.target.value)}
              placeholder={channelModels[0] ?? 'claude-opus-4-6'}
              style={{ ...inputField, fontFamily: 'monospace' }} />
            <datalist id="add-up-list">
              {channelModels.map(cm => <option key={cm} value={cm} />)}
            </datalist>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>场景标签</div>
            <SceneTagEditor scenes={scenes} setScenes={setScenes} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>排序</div>
              <input type="number" value={sortOrder}
                onChange={e => setSortOrder(Number(e.target.value) || 0)} style={inputField} />
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>备注</div>
              <input value={note} onChange={e => setNote(e.target.value)}
                placeholder="（可选）" style={inputField} />
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 18px 18px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <button onClick={submit} style={{
            width: '100%', padding: '12px 0',
            background: `${C.accent}14`, color: C.accent,
            border: 'none', borderRadius: 12,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            ✓ 确认
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Provider Form ─────────────────────────────────────────────────────

function AddProviderForm({ onCreated, onCancel }: {
  onCreated: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai_compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelsText, setModelsText] = useState('')
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
          supports_thinking: true, thinking_format: 'openai',
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
          <span style={{ fontSize: 14, color: C.text }}>供应商类型</span>
          <select value={provider} onChange={e => setProvider(e.target.value)}
            style={{ fontSize: 13, color: C.textSecondary, background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}>
            <option value="openai_compatible">OpenAI Compatible</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
            <option value="zenmux">ZenMux</option>
          </select>
        </div>
        <div style={{ padding: '14px 16px', borderBottom: 'none' }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>渠道标签</div>
          <input value={channelTag} onChange={e => setChannelTag(e.target.value)}
            placeholder="官方直出 / 中转 / ..." style={inputField} />
        </div>
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

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel}
          style={{
            flex: 1, padding: '12px 0',
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 12, color: C.textSecondary, cursor: 'pointer',
            fontSize: 14, fontWeight: 500,
          }}>取消</button>
        <button onClick={submit}
          style={{
            flex: 1, padding: '12px 0',
            background: `${C.accent}14`, border: 'none',
            borderRadius: 12, color: C.accent, cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
          }}>创建</button>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function ModelRoutingTab() {
  const [channels, setChannels] = useState<ChannelInfo[] | null>(null)
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [_briefs, setBriefs] = useState<ChannelBrief[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<'config' | 'models'>('config')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

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
      setBriefs(data.channels ?? [])
    } catch {
      setModels([])
      setBriefs([])
    }
  }, [])

  useEffect(() => { loadChannels(); loadModels() }, [loadChannels, loadModels])

  const reload = () => { loadChannels(); loadModels() }

  // 清理失效的 selected（channels 重载后发现当前 selected 已经不在）
  useEffect(() => {
    if (selected && channels && !channels.find(c => c.name === selected)) {
      setSelected(null)
    }
  }, [selected, channels])

  const ch = selected ? channels?.find(c => c.name === selected) ?? null : null
  const providerModels = selected ? (models?.filter(m => m.channel_name === selected) ?? []) : []

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

  // ─── Provider List View ───────────────────────────────────────────────
  if (!selected && !adding) {
    const filtered = channels?.filter(c =>
      !search || c.name.toLowerCase().includes(search.toLowerCase())
        || (c.channel_tag ?? '').toLowerCase().includes(search.toLowerCase())
    ) ?? null

    return (
      <div>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>供应商</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setSearch(''); reload() }} style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'none', border: `1px solid ${C.border}`,
              color: C.textSecondary, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="刷新">↻</button>
            <button onClick={() => setAdding(true)} style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'none', border: `1px solid ${C.border}`,
              color: C.accent, fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="添加供应商">+</button>
          </div>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          background: C.surface, borderRadius: 12,
          marginBottom: 12,
        }}>
          <span style={{ color: C.textMuted, fontSize: 14 }}>🔍</span>
          <input
            ref={searchInputRef}
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索供应商"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 14, color: C.text,
            }}
          />
        </div>

        {/* List */}
        <div style={card}>
          {filtered === null ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>加载中...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
              {search ? '没有匹配的供应商' : '还没有供应商'}
            </div>
          ) : filtered.map((c, i) => {
            const modelCount = models?.filter(m => m.channel_name === c.name).length ?? 0
            return (
              <div
                key={c.name}
                onClick={() => { setSelected(c.name); setSubTab('config') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px',
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
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

                {/* 图标 */}
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `${C.accent}10`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.accent, fontSize: 16, flexShrink: 0,
                  fontWeight: 600,
                }}>
                  {guessProviderIcon(c.provider, c.name)}
                </div>

                {/* 名称 + 标签 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: C.text }}>{c.name}</span>
                    {c.channel_tag && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                        border: `1px solid ${C.accent}40`, color: C.accent,
                      }}>{c.channel_tag}</span>
                    )}
                  </div>
                  {modelCount > 0 && (
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
                      {modelCount} 个模型
                    </div>
                  )}
                </div>

                {/* 启用 badge */}
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 10, flexShrink: 0,
                  color: c.enabled ? '#4a8c5c' : C.textMuted,
                  background: c.enabled ? 'rgba(34,197,94,0.08)' : C.surface,
                }}>
                  {c.enabled ? '启用' : '禁用'}
                </span>

                <span style={{ color: C.textMuted, fontSize: 16, flexShrink: 0 }}>›</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Add Provider View ────────────────────────────────────────────────
  if (adding) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => setAdding(false)} style={{
            background: 'none', border: 'none', color: C.textSecondary,
            cursor: 'pointer', fontSize: 18, padding: 4,
          }}>←</button>
          <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>添加供应商</span>
        </div>
        <AddProviderForm
          onCreated={(name) => { setAdding(false); setSelected(name); setSubTab('config'); reload() }}
          onCancel={() => setAdding(false)}
        />
      </div>
    )
  }

  // ─── Provider Detail ─────────────────────────────────────────────────
  // selected 有值但 ch 没找到：说明 channels 还在重载，等 useEffect 清理 selected
  if (!ch) return null

  const isHardcoded = ch.source === 'hardcoded' || ch.source === 'hardcoded_override'

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <button onClick={() => setSelected(null)} style={{
            background: 'none', border: 'none', color: C.textSecondary,
            cursor: 'pointer', fontSize: 18, padding: 4, flexShrink: 0,
          }}>←</button>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `${C.accent}10`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.accent, fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}>{guessProviderIcon(ch.provider, ch.name)}</div>
          <span style={{
            fontSize: 16, fontWeight: 600, color: C.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{ch.name}</span>
        </div>
        <button onClick={handleDeleteChannel}
          style={{ ...tinyBtn, color: isHardcoded ? '#e65100' : '#e53935', flexShrink: 0 }}>
          {isHardcoded ? '恢复默认' : '删除'} 🗑
        </button>
      </div>

      {/* Content area */}
      {subTab === 'config' && (
        <ProviderConfigTab
          key={ch.name + ch.base_url + ch.api_key_masked + String(ch.enabled)}
          ch={ch}
          onSaved={reload}
        />
      )}
      {subTab === 'models' && (
        <ProviderModelsTab ch={ch} models={providerModels} onReload={reload} />
      )}

      {/* Bottom tab bar (sticky in card) */}
      <div style={{
        position: 'sticky', bottom: 0,
        marginTop: 20,
        display: 'flex', gap: 4,
        padding: '6px',
        background: '#fff', borderRadius: 14,
        border: `1px solid ${C.border}`,
        boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
      }}>
        <button onClick={() => setSubTab('config')} style={{
          flex: 1, padding: '12px 0', borderRadius: 10,
          background: subTab === 'config' ? `${C.accent}14` : 'transparent',
          color: subTab === 'config' ? C.accent : C.textSecondary,
          fontSize: 13, fontWeight: subTab === 'config' ? 600 : 500,
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'all 0.15s',
        }}>
          <span>⚙</span> 配置
        </button>
        <button onClick={() => setSubTab('models')} style={{
          flex: 1, padding: '12px 0', borderRadius: 10,
          background: subTab === 'models' ? `${C.accent}14` : 'transparent',
          color: subTab === 'models' ? C.accent : C.textSecondary,
          fontSize: 13, fontWeight: subTab === 'models' ? 600 : 500,
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'all 0.15s',
        }}>
          <span>◈</span> 模型 ({providerModels.length})
        </button>
      </div>
    </div>
  )
}
