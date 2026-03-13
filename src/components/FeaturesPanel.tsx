import { useState, useEffect } from 'react'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { client } from '../api/client'

interface FlagInfo {
  key: string
  label: string
  desc: string
}

const FLAG_META: FlagInfo[] = [
  { key: 'context_inject_enabled', label: '记忆注入', desc: '将记忆和历史摘要注入给 AI' },
  { key: 'memory_enabled', label: '对话存储', desc: '将每轮对话保存到数据库' },
  { key: 'micro_summary_enabled', label: '自动记忆', desc: '对话后自动提取新记忆（上限 3 条/天）' },
  { key: 'search_enabled', label: '语义检索', desc: '注入相关历史对话（当前关闭，噪点待优化）' },
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
      className="absolute inset-0 flex flex-col z-10"
      style={{ background: '#0a1a3a', color: '#c8d4e8' }}
    >
      {/* Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-4 w-full text-left transition-colors duration-150 cursor-pointer"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#c8d4e8' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <ChevronLeft size={16} strokeWidth={1.8} />
        <span className="text-sm font-medium select-none" style={{ letterSpacing: '0.05em' }}>
          Features
        </span>
      </button>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(200,212,232,0.5)' }}>
            <RefreshCw size={14} className="animate-spin" />
            加载中…
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {FLAG_META.map(({ key, label, desc }) => {
              const enabled = !!flags[key]
              const isSaving = saving === key
              return (
                <button
                  key={key}
                  onClick={() => toggle(key)}
                  disabled={isSaving}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-lg transition-colors duration-150 cursor-pointer text-left disabled:opacity-60"
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Toggle */}
                  <div
                    className="relative flex-shrink-0 rounded-full transition-colors duration-200"
                    style={{
                      width: 36,
                      height: 20,
                      background: enabled ? '#002FA7' : 'rgba(255,255,255,0.12)',
                    }}
                  >
                    <div
                      className="absolute top-0.5 rounded-full transition-transform duration-200"
                      style={{
                        width: 16,
                        height: 16,
                        background: '#fff',
                        transform: enabled ? 'translateX(18px)' : 'translateX(2px)',
                      }}
                    />
                  </div>
                  {/* Text */}
                  <div className="min-w-0">
                    <p className="text-sm" style={{ color: '#c8d4e8' }}>{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(200,212,232,0.4)' }}>{desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs px-1" style={{ color: '#e88' }}>{error}</p>
        )}

        <p className="mt-4 text-xs px-1" style={{ color: 'rgba(200,212,232,0.3)' }}>
          修改立即生效，服务器重启后恢复默认值。
        </p>
      </div>
    </div>
  )
}
