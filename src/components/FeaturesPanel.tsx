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
]

interface Props {
  onBack: () => void
}

export default function FeaturesPanel({ onBack }: Props) {
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    client.get<{ flags: Record<string, boolean> }>('/admin/settings')
      .then(res => setFlags(res.flags))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
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

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: C.bg, color: C.text }}
    >
      {/* Header */}
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
                  {/* Toggle */}
                  <div
                    className="relative flex-shrink-0 rounded-full transition-colors duration-200"
                    style={{
                      width: 44,
                      height: 24,
                      background: enabled ? C.accent : C.textMuted,
                    }}
                  >
                    <div
                      className="absolute top-0.5 rounded-full transition-transform duration-200"
                      style={{
                        width: 20,
                        height: 20,
                        background: '#fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        transform: enabled ? 'translateX(22px)' : 'translateX(2px)',
                      }}
                    />
                  </div>
                  {/* Text */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: C.text }}>{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>{desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
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
