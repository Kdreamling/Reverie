import { useState, useEffect } from 'react'
import { ChevronLeft, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { client } from '../api/client'
import { C } from '../theme'

interface SectionInfo {
  label: string
  desc: string
  content: string
  is_custom: boolean
  default: string
  editable: boolean
}

interface Props {
  onBack: () => void
}

const BP_LABELS: Record<string, { tag: string; color: string }> = {
  personality: { tag: 'BP1', color: C.accent },
  memory_desc: { tag: 'BP1', color: C.accent },
  artifact_format: { tag: 'BP1', color: C.accent },
  tool_instructions: { tag: 'BP1', color: C.accent },
}

export default function PromptPanel({ onBack }: Props) {
  const [sections, setSections] = useState<Record<string, SectionInfo>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  useEffect(() => {
    client.get<{ sections: Record<string, SectionInfo> }>('/admin/prompt')
      .then(res => {
        setSections(res.sections)
        const d: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.sections)) {
          d[k] = v.content
        }
        setDrafts(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const hasChanges = Object.keys(sections).some(
    k => drafts[k] !== sections[k]?.content
  )

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const changed: Record<string, string> = {}
      for (const k of Object.keys(drafts)) {
        if (drafts[k] !== sections[k]?.content) {
          changed[k] = drafts[k]
        }
      }
      await client.put('/admin/prompt', { sections: changed })
      // Refresh
      const res = await client.get<{ sections: Record<string, SectionInfo> }>('/admin/prompt')
      setSections(res.sections)
      const d: Record<string, string> = {}
      for (const [k, v] of Object.entries(res.sections)) {
        d[k] = v.content
      }
      setDrafts(d)
      setSuccess('已保存')
      setTimeout(() => setSuccess(''), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function handleReset(key: string) {
    if (!sections[key]) return
    setDrafts(prev => ({ ...prev, [key]: sections[key].default }))
  }

  const sectionOrder = ['personality', 'memory_desc', 'artifact_format', 'tool_instructions']

  return (
    <div
      className="flex flex-col h-full prompt-root"
      style={{ background: C.bg, color: C.text }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 md:px-4"
        style={{
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 16,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2.5 transition-colors duration-150 cursor-pointer"
        >
          <ChevronLeft size={18} strokeWidth={1.8} style={{ color: C.textSecondary }} />
          <span className="text-base md:text-sm font-medium select-none">Prompt</span>
        </button>

        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 transition-colors"
            style={{ background: C.accent, color: '#fff' }}
          >
            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? '保存中' : '保存'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: C.textMuted }}>
            <RefreshCw size={14} className="animate-spin" />
            加载中…
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sectionOrder.map(key => {
              const section = sections[key]
              if (!section) return null
              const bp = BP_LABELS[key]
              const isExpanded = expandedKey === key
              const isModified = drafts[key] !== section.content

              return (
                <div
                  key={key}
                  className="rounded-xl overflow-hidden transition-all duration-200"
                  style={{ border: `1px solid ${C.border}`, background: C.sidebarBg }}
                >
                  {/* Section header */}
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    className="flex items-center gap-3 w-full px-4 py-3.5 text-left cursor-pointer transition-colors"
                    style={{ background: isExpanded ? C.surface : 'transparent' }}
                  >
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: bp?.color + '22', color: bp?.color, letterSpacing: '0.05em' }}
                    >
                      {bp?.tag}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{section.label}</span>
                      {!isExpanded && (
                        <span className="text-xs ml-2" style={{ color: C.textSecondary }}>{section.desc}</span>
                      )}
                    </div>
                    {section.is_custom && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: C.accent + '14', color: C.accent }}
                      >
                        已自定义
                      </span>
                    )}
                    {isModified && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: '#e8a87c22', color: '#c07a4a' }}
                      >
                        未保存
                      </span>
                    )}
                    <ChevronLeft
                      size={14}
                      strokeWidth={2}
                      style={{
                        color: C.textMuted,
                        transform: isExpanded ? 'rotate(-90deg)' : 'rotate(180deg)',
                        transition: 'transform 0.2s',
                        flexShrink: 0,
                      }}
                    />
                  </button>

                  {/* Expanded editor */}
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      <p className="text-xs mb-2" style={{ color: C.textSecondary }}>{section.desc}</p>
                      <textarea
                        value={drafts[key] ?? ''}
                        onChange={e => setDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full rounded-lg p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1"
                        style={{
                          border: `1px solid ${C.border}`,
                          background: C.sidebarBg,
                          color: C.text,
                          minHeight: 160,
                          fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                          fontSize: 13,
                        }}
                        rows={8}
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleReset(key)}
                          className="flex items-center gap-1 text-xs cursor-pointer transition-colors"
                          style={{ color: C.textMuted }}
                        >
                          <RotateCcw size={11} />
                          恢复默认
                        </button>
                        {isModified && (
                          <span className="text-[11px]" style={{ color: '#c07a4a' }}>
                            有未保存的修改
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs px-1" style={{ color: C.errorText }}>{error}</p>
        )}
        {success && (
          <p className="mt-3 text-xs px-1" style={{ color: C.success }}>{success}</p>
        )}

        <p className="mt-4 text-xs px-1" style={{ color: C.textMuted }}>
          修改后立即生效，下一次对话将使用新的提示词。点击"恢复默认"可以回到系统默认值。
        </p>
      </div>
    </div>
  )
}
