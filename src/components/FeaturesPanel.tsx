import { useState, useEffect } from 'react'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { client } from '../api/client'
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
  { key: 'graph_enabled', label: '记忆图谱', desc: '注入关联记忆的图谱脉络' },
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

        <p className="mt-4 text-xs px-1" style={{ color: C.textMuted }}>
          修改立即生效，服务器重启后恢复默认值。
        </p>
      </div>
    </div>
  )
}
