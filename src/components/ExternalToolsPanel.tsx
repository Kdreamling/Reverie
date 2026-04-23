import { useEffect, useState } from 'react'
import { ChevronLeft, Plus, Trash2, Edit3, Play, Power, RefreshCw, Webhook, Puzzle } from 'lucide-react'
import { C } from '../theme'
import { userToolsApi, type UserTool, type RegistrySnapshot } from '../api/userTools'

interface Props {
  onBack: () => void
}

interface FormState {
  id: string | null
  name: string
  description: string
  webhook_url: string
  method: string
  headers_text: string // raw textarea value, parsed to JSON on submit
  args_schema_text: string
  enabled: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  webhook_url: '',
  method: 'POST',
  headers_text: '{}',
  args_schema_text: JSON.stringify(
    { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
    null,
    2
  ),
  enabled: true,
}

export default function ExternalToolsPanel({ onBack }: Props) {
  const [tools, setTools] = useState<UserTool[]>([])
  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState | null>(null) // null = closed, else edit/add
  const [testResult, setTestResult] = useState<string | null>(null)

  async function refresh() {
    try {
      setLoading(true)
      const [t, s] = await Promise.all([
        userToolsApi.list(),
        userToolsApi.snapshot().catch(() => null),
      ])
      setTools(t.tools)
      setSnapshot(s as RegistrySnapshot | null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function openAdd() {
    setForm({ ...EMPTY_FORM })
    setTestResult(null)
    setError('')
  }

  function openEdit(tool: UserTool) {
    setForm({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      webhook_url: tool.webhook_url,
      method: tool.method || 'POST',
      headers_text: JSON.stringify(tool.headers || {}, null, 2),
      args_schema_text: JSON.stringify(tool.args_schema || {}, null, 2),
      enabled: tool.enabled,
    })
    setTestResult(null)
    setError('')
  }

  async function save() {
    if (!form) return
    let headers: Record<string, string>
    let args_schema: Record<string, unknown>
    try {
      headers = JSON.parse(form.headers_text || '{}')
      args_schema = JSON.parse(form.args_schema_text || '{}')
    } catch (e) {
      setError('Headers 或 Schema 不是合法 JSON：' + (e instanceof Error ? e.message : ''))
      return
    }
    try {
      if (form.id) {
        await userToolsApi.update(form.id, {
          description: form.description,
          webhook_url: form.webhook_url,
          method: form.method,
          headers,
          args_schema,
          enabled: form.enabled,
        })
      } else {
        await userToolsApi.create({
          name: form.name.trim(),
          description: form.description,
          webhook_url: form.webhook_url,
          method: form.method,
          headers,
          args_schema,
          enabled: form.enabled,
        })
      }
      setForm(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    }
  }

  async function remove(tool: UserTool) {
    if (!confirm(`删除工具 ${tool.name}？`)) return
    await userToolsApi.remove(tool.id)
    refresh()
  }

  async function toggle(tool: UserTool) {
    await userToolsApi.update(tool.id, { enabled: !tool.enabled })
    refresh()
  }

  async function runTest() {
    if (!form?.id) {
      setTestResult('保存后才能测试')
      return
    }
    try {
      setTestResult('调用中…')
      // 从 schema 的 properties 拿默认空值示例，简单起见全空
      const res = await userToolsApi.test(form.id, {})
      setTestResult(
        `HTTP ${res.status}${res.ok ? ' ✓' : ' ✗'}\n\n` +
          (typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2))
      )
    } catch (e) {
      setTestResult('失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-5 md:px-4 w-full"
        style={{
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 16,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <button onClick={onBack} className="flex items-center gap-2 cursor-pointer">
          <ChevronLeft size={18} strokeWidth={1.8} style={{ color: C.textSecondary }} />
          <span className="text-base md:text-sm font-medium select-none">外部工具</span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={refresh}
            title="刷新"
            className="p-1.5 rounded-lg cursor-pointer"
            style={{ color: C.textSecondary }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-xs"
            style={{ border: `1px dashed ${C.borderStrong}`, color: C.accent }}
          >
            <Plus size={13} /> 新增
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {/* Webhook tools */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Webhook size={13} style={{ color: C.textSecondary }} />
            <p
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: C.textMuted, letterSpacing: '0.08em' }}
            >
              Webhook 工具
            </p>
            <span className="text-[11px]" style={{ color: C.textFaint }}>
              {tools.length}
            </span>
          </div>
          {tools.length === 0 && !loading && (
            <div
              className="px-4 py-6 rounded-xl text-center text-xs"
              style={{ border: `1px dashed ${C.border}`, color: C.textMuted }}
            >
              还没有 webhook 工具。点右上角 "新增" 配置你的第一个。
            </div>
          )}
          <div className="flex flex-col gap-2">
            {tools.map(tool => (
              <div
                key={tool.id}
                className="px-3 py-2.5 rounded-xl flex items-start gap-3"
                style={{
                  border: `1px dashed ${tool.enabled ? C.borderStrong : C.border}`,
                  background: tool.enabled ? 'rgba(160,120,90,0.03)' : 'transparent',
                  opacity: tool.enabled ? 1 : 0.55,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code
                      className="text-[13px] font-medium"
                      style={{ color: tool.enabled ? C.accent : C.textSecondary }}
                    >
                      {tool.name}
                    </code>
                    <span className="text-[10px]" style={{ color: C.textFaint }}>
                      {tool.method}
                    </span>
                  </div>
                  {tool.description && (
                    <p
                      className="text-xs mt-1 line-clamp-2"
                      style={{ color: C.textSecondary }}
                    >
                      {tool.description}
                    </p>
                  )}
                  <p
                    className="text-[11px] mt-1 truncate"
                    style={{ color: C.textFaint, fontFamily: 'monospace' }}
                  >
                    {tool.webhook_url}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => toggle(tool)}
                    title={tool.enabled ? '停用' : '启用'}
                    className="p-1 rounded cursor-pointer"
                    style={{ color: tool.enabled ? C.accent : C.textMuted }}
                  >
                    <Power size={13} />
                  </button>
                  <button
                    onClick={() => openEdit(tool)}
                    title="编辑"
                    className="p-1 rounded cursor-pointer"
                    style={{ color: C.textSecondary }}
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    onClick={() => remove(tool)}
                    title="删除"
                    className="p-1 rounded cursor-pointer"
                    style={{ color: C.errorText }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MCP tools (read-only) */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Puzzle size={13} style={{ color: C.textSecondary }} />
            <p
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: C.textMuted, letterSpacing: '0.08em' }}
            >
              MCP 工具
            </p>
            <span className="text-[11px]" style={{ color: C.textFaint }}>
              {snapshot?.mcp_tools.length ?? 0}
            </span>
          </div>
          {!snapshot || snapshot.mcp_tools.length === 0 ? (
            <div
              className="px-4 py-4 rounded-xl text-xs"
              style={{ border: `1px dashed ${C.border}`, color: C.textMuted }}
            >
              尚未连接 MCP server。在服务器的{' '}
              <code style={{ color: C.accent }}>gateway/mcp_servers.json</code>{' '}
              配置后重启 Gateway 生效。
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {snapshot.mcp_tools.map(t => (
                <div
                  key={t.name}
                  className="px-3 py-2 rounded-xl"
                  style={{
                    border: `1px dashed ${C.border}`,
                    background: 'rgba(122,142,152,0.04)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <code className="text-[13px] font-medium" style={{ color: C.memoryRefAccent }}>
                      {t.name}
                    </code>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: C.textFaint, border: `1px solid ${C.border}` }}>
                      {t.server}
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-xs mt-1" style={{ color: C.textSecondary }}>
                      {t.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs" style={{ color: C.errorText }}>{error}</p>
        )}
      </div>

      {/* Edit modal (simple bottom sheet on mobile) */}
      {form && (
        <div
          className="absolute inset-0 z-20 flex items-end md:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.2)' }}
          onClick={() => setForm(null)}
        >
          <div
            className="w-full md:max-w-lg md:rounded-xl rounded-t-2xl flex flex-col gap-3 p-5"
            style={{ background: C.bg, maxHeight: '90vh', border: `1px solid ${C.border}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium">{form.id ? '编辑工具' : '新增工具'}</h3>
              <button onClick={() => setForm(null)} className="text-xs cursor-pointer" style={{ color: C.textMuted }}>
                取消
              </button>
            </div>
            <div className="overflow-y-auto flex flex-col gap-3">
              <Field label="名称（晨调用时用）">
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  disabled={!!form.id}
                  placeholder="e.g. query_weather"
                  className="w-full text-sm px-3 py-2 rounded-lg"
                  style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                />
              </Field>
              <Field label="描述（让晨知道什么时候该调用）">
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="查询天气预报。Dream 问天气情况时使用。"
                  className="w-full text-sm px-3 py-2 rounded-lg"
                  style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                />
              </Field>
              <div className="flex gap-2">
                <Field label="方法" className="shrink-0 w-24">
                  <select
                    value={form.method}
                    onChange={e => setForm({ ...form, method: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg cursor-pointer"
                    style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                  >
                    <option>POST</option>
                    <option>GET</option>
                  </select>
                </Field>
                <Field label="Webhook URL" className="flex-1">
                  <input
                    value={form.webhook_url}
                    onChange={e => setForm({ ...form, webhook_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full text-sm px-3 py-2 rounded-lg font-mono"
                    style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12 }}
                  />
                </Field>
              </div>
              <Field label="Headers（JSON，可填 Authorization 等）">
                <textarea
                  value={form.headers_text}
                  onChange={e => setForm({ ...form, headers_text: e.target.value })}
                  rows={3}
                  className="w-full text-xs px-3 py-2 rounded-lg font-mono"
                  style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                />
              </Field>
              <Field label="参数 Schema（JSON Schema，告诉晨该传什么）">
                <textarea
                  value={form.args_schema_text}
                  onChange={e => setForm({ ...form, args_schema_text: e.target.value })}
                  rows={6}
                  className="w-full text-xs px-3 py-2 rounded-lg font-mono"
                  style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={e => setForm({ ...form, enabled: e.target.checked })}
                />
                <span>启用（晨可以调用）</span>
              </label>
              {testResult && (
                <pre
                  className="text-[11px] p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto"
                  style={{ background: C.toolBg, color: C.textSecondary, fontFamily: 'monospace' }}
                >
                  {testResult}
                </pre>
              )}
              {error && (
                <p className="text-xs" style={{ color: C.errorText }}>{error}</p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              {form.id && (
                <button
                  onClick={runTest}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer text-xs"
                  style={{ border: `1px dashed ${C.borderStrong}`, color: C.textSecondary }}
                >
                  <Play size={12} /> 测试
                </button>
              )}
              <button
                onClick={save}
                className="flex-1 px-4 py-2 rounded-lg cursor-pointer text-sm font-medium"
                style={{ border: `1px dashed ${C.accent}`, color: C.accent }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label className="text-[11px] uppercase tracking-wider" style={{ color: C.textMuted, letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
