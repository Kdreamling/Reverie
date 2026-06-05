import { useState, useEffect } from 'react'
import { ChevronLeft, RefreshCw, Bell, Trash2, Activity } from 'lucide-react'
import { client } from '../api/client'
import { resubscribePush } from '../api/pushSubscription'
import { C } from '../theme'

interface FlagInfo {
  key: string
  label: string
  desc: string
}

const FLAG_META: FlagInfo[] = [
  { key: 'context_inject_enabled', label: '记忆注入', desc: '将记忆和历史摘要注入给 AI' },
  { key: 'memory_enabled', label: '对话存储', desc: '将每轮对话保存到数据库' },
  { key: 'micro_summary_enabled', label: '自动记忆', desc: '对话后自动提取新记忆' },
  { key: 'search_enabled', label: '语义检索', desc: '注入相关历史对话' },
  { key: 'memory_tool_enabled', label: 'AI 主动记忆', desc: 'AI 自主检索和保存记忆' },
  { key: 'life_butler_enabled', label: '生活管家', desc: '待办/日程/习惯打卡工具' },
]

const TOOL_LABELS: Record<string, string> = {
  search: '搜索',
  save_memory: '记日记',
  url_op: '打开网页',
  diary_op: '日记操作',
  generate_image: '画图',
  ticktick_op: '滴答清单',
  request_photo: '请求拍照',
  link_memory: '关联记忆',
  maps_op: '高德地图',
  reopen_session: '重开会话',
  create_life_item: '创建待办',
  list_life_items: '查看待办',
  complete_life_item: '完成待办',
  update_life_item: '更新待办',
  delete_life_item: '删除待办',
  create_habit: '创建习惯',
  log_habit: '打卡',
  get_habit_stats: '习惯统计',
}

interface ToolInfo {
  name: string
  description: string
}

interface Props {
  onBack: () => void
}

const SERVICE_LABELS: Record<string, string> = {
  gateway: 'Gateway',
  supabase: 'Supabase',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  siliconflow: 'SiliconFlow',
}

interface ServiceStatus {
  ok: boolean
  error?: string
  status?: number
  uptime_hours?: number
  count?: number
}

function SystemSection() {
  const [clearing, setClearing] = useState(false)
  const [clearMsg, setClearMsg] = useState('')
  const [health, setHealth] = useState<Record<string, ServiceStatus> | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthChecked, setHealthChecked] = useState(false)

  async function handleClearCache() {
    setClearing(true)
    setClearMsg('')
    try {
      await client.post('/admin/cache/clear', {})
      setClearMsg('缓存已清除')
      setTimeout(() => setClearMsg(''), 3000)
    } catch (err) {
      setClearMsg('清除失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setClearing(false)
    }
  }

  async function checkHealth() {
    setHealthLoading(true)
    try {
      const res = await client.get<{ ok: boolean; services: Record<string, ServiceStatus> }>('/admin/health')
      setHealth(res.services)
      setHealthChecked(true)
    } catch {
      setHealth(null)
    } finally {
      setHealthLoading(false)
    }
  }

  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wider mt-6 mb-3 px-1" style={{ color: C.textMuted }}>
        系统
      </p>
      <div className="flex flex-col gap-2">
        {/* 缓存清除 */}
        <div
          className="flex items-center gap-4 px-4 py-4 md:py-3 rounded-xl md:rounded-lg"
          style={{ background: C.sidebarBg, border: `1px solid ${C.border}` }}
        >
          <div
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 36, height: 36, background: C.surface }}
          >
            <Trash2 size={16} strokeWidth={1.5} style={{ color: C.accent }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: C.text }}>清除缓存</p>
            <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>重建晨的上下文，修复记忆不更新</p>
            {clearMsg && (
              <p className="text-xs mt-1" style={{ color: clearMsg.includes('失败') ? C.errorText : C.success }}>
                {clearMsg}
              </p>
            )}
          </div>
          <button
            onClick={handleClearCache}
            disabled={clearing}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-50 flex-shrink-0"
            style={{ background: 'transparent', color: C.accent, border: `1px solid ${C.border}` }}
          >
            {clearing ? '清除中…' : '清除'}
          </button>
        </div>

        {/* 连接状态 */}
        <div
          className="px-4 py-4 md:py-3 rounded-xl md:rounded-lg"
          style={{ background: C.sidebarBg, border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ width: 36, height: 36, background: C.surface }}
            >
              <Activity size={16} strokeWidth={1.5} style={{ color: C.accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: C.text }}>连接状态</p>
              <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>检测上游服务是否正常</p>
            </div>
            <button
              onClick={checkHealth}
              disabled={healthLoading}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-50 flex-shrink-0"
              style={{ background: 'transparent', color: C.accent, border: `1px solid ${C.border}` }}
            >
              {healthLoading ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : healthChecked ? '刷新' : '检测'}
            </button>
          </div>
          {health && (
            <div className="mt-3 flex flex-col gap-1.5 pl-[52px]">
              {Object.entries(health).map(([key, svc]) => (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="rounded-full flex-shrink-0"
                    style={{
                      width: 6, height: 6,
                      background: svc.ok ? C.success : C.errorText,
                    }}
                  />
                  <span className="text-xs" style={{ color: C.text }}>
                    {SERVICE_LABELS[key] || key}
                  </span>
                  <span className="text-xs" style={{ color: C.textMuted }}>
                    {svc.ok
                      ? (svc.uptime_hours != null ? `${svc.uptime_hours}h` : '')
                      : (svc.error || `HTTP ${svc.status}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function NotificationSection() {
  const [status, setStatus] = useState<'loading' | 'unsupported' | 'denied' | 'off' | 'on'>('loading')
  const [subscribing, setSubscribing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setStatus(sub && Notification.permission === 'granted' ? 'on' : 'off')
      })
    ).catch(() => setStatus('off'))
  }, [])

  async function handleSubscribe() {
    setSubscribing(true)
    setMessage('')
    try {
      await resubscribePush()
      setStatus('on')
      setMessage('通知已开启')
    } catch (err) {
      if (Notification.permission === 'denied') {
        setStatus('denied')
        setMessage('浏览器已拒绝通知权限，请在系统设置中允许')
      } else {
        setMessage('订阅失败：' + (err instanceof Error ? err.message : '未知错误'))
      }
    } finally {
      setSubscribing(false)
    }
  }

  const statusMap = {
    loading: { text: '检测中…', color: C.textMuted },
    unsupported: { text: '当前浏览器不支持', color: C.textMuted },
    denied: { text: '已被浏览器拒绝', color: C.errorText },
    off: { text: '未开启', color: C.textMuted },
    on: { text: '已开启', color: C.success },
  }
  const s = statusMap[status]

  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wider mt-6 mb-3 px-1" style={{ color: C.textMuted }}>
        通知
      </p>
      <div
        className="flex items-center gap-4 px-4 py-4 md:py-3 rounded-xl md:rounded-lg"
        style={{ background: C.sidebarBg, border: `1px solid ${C.border}` }}
      >
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 36, height: 36, background: C.surface }}
        >
          <Bell size={16} strokeWidth={1.5} style={{ color: status === 'on' ? C.accent : C.textMuted }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: C.text }}>浏览器推送</p>
          <p className="text-xs mt-0.5" style={{ color: s.color }}>{s.text}</p>
          {message && <p className="text-xs mt-1" style={{ color: status === 'on' ? C.success : C.errorText }}>{message}</p>}
        </div>
        {(status === 'off' || status === 'on') && (
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-50 flex-shrink-0"
            style={{
              background: status === 'on' ? 'transparent' : C.accent,
              color: status === 'on' ? C.accent : '#fff',
              border: status === 'on' ? `1px solid ${C.border}` : 'none',
            }}
          >
            {subscribing ? '订阅中…' : status === 'on' ? '重新订阅' : '开启通知'}
          </button>
        )}
        {status === 'denied' && (
          <p className="text-xs flex-shrink-0" style={{ color: C.textMuted }}>请在浏览器设置中允许</p>
        )}
      </div>
    </>
  )
}

export default function FeaturesPanel({ onBack }: Props) {
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [tools, setTools] = useState<ToolInfo[]>([])
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set())
  const [toolsLoading, setToolsLoading] = useState(true)
  const [toolSaving, setToolSaving] = useState(false)

  useEffect(() => {
    client.get<{ flags: Record<string, boolean> }>('/admin/settings')
      .then(res => setFlags(res.flags))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    client.get<{ tools: ToolInfo[]; disabled: string[] }>('/admin/tools')
      .then(res => {
        setTools(res.tools)
        setDisabledTools(new Set(res.disabled))
      })
      .catch(() => {})
      .finally(() => setToolsLoading(false))
  }, [])

  async function toggle(key: string) {
    const newVal = !flags[key]
    setSaving(key)
    setError('')
    try {
      const res = await client.patch<{ flags: Record<string, boolean> }>(
        '/admin/settings',
        { [key]: newVal }
      )
      setFlags(res.flags)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(null)
    }
  }

  async function toggleTool(name: string) {
    const next = new Set(disabledTools)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setDisabledTools(next)
    setToolSaving(true)
    try {
      const res = await client.patch<{ disabled_tools: string[] }>(
        '/admin/settings',
        { disabled_tools: [...next] }
      )
      setDisabledTools(new Set(res.disabled_tools))
    } catch {
      setDisabledTools(disabledTools)
    } finally {
      setToolSaving(false)
    }
  }

  function Toggle({ on, disabled }: { on: boolean; disabled?: boolean }) {
    return (
      <div
        className="relative flex-shrink-0 rounded-full transition-colors duration-200"
        style={{
          width: 44,
          height: 24,
          background: on ? C.accent : C.textMuted,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div
          className="absolute top-0.5 rounded-full transition-transform duration-200"
          style={{
            width: 20,
            height: 20,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            transform: on ? 'translateX(22px)' : 'translateX(2px)',
          }}
        />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: C.bg, color: C.text }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2.5 px-5 md:px-4 w-full text-left transition-colors duration-150 cursor-pointer"
        style={{
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 16,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <ChevronLeft size={18} strokeWidth={1.8} style={{ color: C.textSecondary }} />
        <span className="text-base md:text-sm font-medium select-none">Features</span>
      </button>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: C.textMuted }}>
            <RefreshCw size={14} className="animate-spin" />
            加载中…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {FLAG_META.map(({ key, label, desc }) => {
                const enabled = !!flags[key]
                const isSaving = saving === key
                return (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    disabled={isSaving}
                    className="flex items-center gap-4 w-full px-4 py-4 md:py-3 rounded-xl md:rounded-lg transition-colors duration-150 cursor-pointer text-left disabled:opacity-60"
                    style={{ background: C.sidebarBg, border: `1px solid ${C.border}` }}
                  >
                    <Toggle on={enabled} disabled={isSaving} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: C.text }}>{label}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>{desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {!toolsLoading && tools.length > 0 && (
              <>
                <p className="text-xs font-medium uppercase tracking-wider mt-6 mb-3 px-1" style={{ color: C.textMuted }}>
                  AI 工具
                </p>
                <p className="text-xs mb-3 px-1" style={{ color: C.textSecondary }}>
                  关闭后工具定义不发送给上游，节省 token。切换后缓存会重建一次。
                </p>
                <div className="flex flex-col gap-1.5">
                  {tools.map(t => {
                    const enabled = !disabledTools.has(t.name)
                    return (
                      <button
                        key={t.name}
                        onClick={() => toggleTool(t.name)}
                        disabled={toolSaving}
                        className="flex items-center gap-3 w-full px-4 py-3 md:py-2.5 rounded-lg transition-colors duration-150 cursor-pointer text-left disabled:opacity-60"
                        style={{ background: C.sidebarBg, border: `1px solid ${C.border}` }}
                      >
                        <Toggle on={enabled} disabled={toolSaving} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium" style={{ color: enabled ? C.text : C.textMuted }}>
                            {TOOL_LABELS[t.name] || t.name}
                          </p>
                          <p className="text-xs mt-0.5 truncate" style={{ color: C.textSecondary }}>
                            {t.name}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        {error && (
          <p className="mt-3 text-xs px-1" style={{ color: C.errorText }}>{error}</p>
        )}

        {/* 通知管理 */}
        <NotificationSection />

        {/* 系统控制 */}
        <SystemSection />

        <p className="mt-4 text-xs px-1" style={{ color: C.textMuted }}>
          修改立即生效，服务器重启后恢复默认值。
        </p>
      </div>
    </div>
  )
}
