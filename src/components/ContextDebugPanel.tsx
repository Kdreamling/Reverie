import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { DebugInfo } from '../api/chat'

type Tab = 'memories' | 'search' | 'window' | 'summaries'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'memories', icon: '📌', label: '记忆' },
  { key: 'search', icon: '🔍', label: '检索' },
  { key: 'window', icon: '💬', label: '历史' },
  { key: 'summaries', icon: '📝', label: '摘要' },
]

const LAYER_COLORS: Record<string, string> = {
  core_base: '#002FA7',
  core_living: '#3366CC',
  scene: '#6699DD',
}

const MATCH_COLORS: Record<string, string> = {
  keyword: '#3366CC',
  vector: '#8855CC',
  both: '#22995e',
}

function getScoreColor(score: number) {
  if (score >= 0.7) return '#22995e'
  if (score >= 0.4) return '#cc9922'
  return '#999'
}

interface Props {
  debugInfo: DebugInfo
}

export default function ContextDebugPanel({ debugInfo }: Props) {
  const [activeTab, setActiveTab] = useState<Tab | null>(null)

  const memCount = debugInfo.memories.core_base.length + debugInfo.memories.core_living.length + debugInfo.memories.scene.length
  const searchCount = debugInfo.search_results.length
  const windowRounds = debugInfo.sliding_window?.rounds ?? 0
  const summaryCount = debugInfo.summaries.length
  const { token_usage } = debugInfo
  const usageRatio = token_usage.budget > 0 ? token_usage.total / token_usage.budget : 0

  const counts: Record<Tab, number | string> = {
    memories: memCount,
    search: searchCount,
    window: windowRounds > 0 ? `${windowRounds}轮` : '0',
    summaries: summaryCount,
  }

  return (
    <div
      className="mt-2 rounded-xl overflow-hidden w-full"
      style={{
        background: 'rgba(0,47,167,0.04)',
        border: '1px solid rgba(0,47,167,0.10)',
        backdropFilter: 'blur(8px)',
        transition: 'all 200ms ease',
      }}
    >
      {/* pill bar + token bar */}
      {activeTab === null ? (
        <div className="px-2.5 py-2.5 sm:px-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {TABS.map(t => {
              const c = counts[t.key]
              const empty = c === 0 || c === '0'
              return (
                <button
                  key={t.key}
                  onClick={() => !empty && setActiveTab(t.key)}
                  className="flex items-center gap-1 px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-full text-xs transition-all duration-150 cursor-pointer active:scale-95"
                  style={{
                    background: empty ? 'rgba(0,0,0,0.03)' : 'rgba(0,47,167,0.08)',
                    color: empty ? '#b0b8c8' : '#002FA7',
                    opacity: empty ? 0.5 : 1,
                    fontWeight: 500,
                    minHeight: 32,
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  <span style={{ opacity: 0.7 }}>({c})</span>
                </button>
              )
            })}
          </div>
          {/* token bar */}
          <div className="flex items-center gap-2 text-xs" style={{ color: '#8a9ab5' }}>
            <span className="whitespace-nowrap">{token_usage.total} / {token_usage.budget}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,47,167,0.08)', minWidth: 40 }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(usageRatio * 100, 100)}%`,
                  background: usageRatio > 0.9 ? '#e05555' : '#002FA7',
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* detail view */
        <div className="px-2.5 py-2.5 sm:px-3">
          <button
            onClick={() => setActiveTab(null)}
            className="flex items-center gap-1 text-xs mb-2 cursor-pointer transition-colors active:scale-95"
            style={{ color: '#002FA7', minHeight: 28 }}
          >
            <ChevronLeft size={14} />
            <span>返回</span>
            <span className="ml-auto" style={{ color: '#8a9ab5' }}>
              {TABS.find(t => t.key === activeTab)?.icon} {TABS.find(t => t.key === activeTab)?.label} ({counts[activeTab]})
            </span>
          </button>

          <div
            className="flex flex-col gap-1.5 overflow-y-auto overscroll-contain"
            style={{ maxHeight: 'min(60vh, 320px)', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
          >
            {activeTab === 'memories' && <MemoryDetail debugInfo={debugInfo} />}
            {activeTab === 'search' && <SearchDetail debugInfo={debugInfo} />}
            {activeTab === 'window' && <WindowDetail debugInfo={debugInfo} />}
            {activeTab === 'summaries' && <SummaryDetail debugInfo={debugInfo} />}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Detail sub-components ── */

function MemoryDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const layers = [
    { key: 'core_base' as const, label: 'core_base', items: debugInfo.memories.core_base },
    { key: 'core_living' as const, label: 'core_living', items: debugInfo.memories.core_living },
    { key: 'scene' as const, label: 'scene', items: debugInfo.memories.scene },
  ]
  return (
    <>
      {layers.map(l => l.items.map((m, i) => (
        <div
          key={`${l.key}-${i}`}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{
            background: 'rgba(255,255,255,0.6)',
            border: `1px solid ${LAYER_COLORS[l.key]}22`,
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ background: LAYER_COLORS[l.key] + '15', color: LAYER_COLORS[l.key], fontSize: 10 }}
            >
              {l.label}
            </span>
            {'importance' in m && (
              <span style={{ color: '#8a9ab5', fontSize: 10 }}>importance: {(m as { importance: number }).importance}</span>
            )}
            {'recorded_at' in m && (
              <span style={{ color: '#8a9ab5', fontSize: 10 }}>{(m as { recorded_at: string }).recorded_at}</span>
            )}
          </div>
          <p className="leading-relaxed" style={{ color: '#3a4a6a', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{m.content}</p>
        </div>
      )))}
    </>
  )
}

function SearchDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  return (
    <>
      {debugInfo.search_results.map((r, i) => (
        <div
          key={i}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,47,167,0.08)' }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-medium" style={{ color: getScoreColor(r.score), fontSize: 11 }}>
              {r.score.toFixed(2)}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: (MATCH_COLORS[r.match_type] || '#999') + '15', color: MATCH_COLORS[r.match_type] || '#999', fontSize: 10 }}
            >
              {r.match_type}
            </span>
          </div>
          {r.source === 'summaries' ? (
            <p style={{ color: '#3a4a6a', wordBreak: 'break-word' }}>{r.summary}</p>
          ) : (
            <>
              <p style={{ color: '#3a4a6a', wordBreak: 'break-word' }}>👤 {r.user_msg}</p>
              <p style={{ color: '#6a7a9a', wordBreak: 'break-word', marginTop: 2 }}>🤖 {r.assistant_msg}</p>
            </>
          )}
        </div>
      ))}
      {debugInfo.search_results.length === 0 && (
        <p className="text-xs py-2" style={{ color: '#b0b8c8' }}>未触发检索或无结果</p>
      )}
    </>
  )
}

function WindowDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const w = debugInfo.sliding_window
  const messages = w?.messages ?? []
  return (
    <>
      <div className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.4)' }}>
        <span style={{ color: '#8a9ab5' }}>
          滑动窗口：<strong style={{ color: '#3a4a6a' }}>{w?.rounds ?? 0}</strong> 轮
          {w?.range && ` · ${w.range}`}
        </span>
      </div>
      {messages.map((m, i) => (
        <div
          key={i}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,47,167,0.06)' }}
        >
          {m.user_msg && <p style={{ color: '#3a4a6a', wordBreak: 'break-word' }}>👤 {m.user_msg}</p>}
          {m.assistant_msg && <p style={{ color: '#6a7a9a', wordBreak: 'break-word', marginTop: 2 }}>🤖 {m.assistant_msg}</p>}
        </div>
      ))}
      {messages.length === 0 && (
        <p className="text-xs py-2" style={{ color: '#b0b8c8' }}>无历史对话</p>
      )}
    </>
  )
}

function SummaryDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  return (
    <>
      {debugInfo.summaries.map((s, i) => (
        <div
          key={i}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,47,167,0.08)' }}
        >
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium mb-1 inline-block"
            style={{ background: 'rgba(0,47,167,0.08)', color: '#002FA7', fontSize: 10 }}
          >
            {s.dimension}
          </span>
          <p className="leading-relaxed" style={{ color: '#3a4a6a', wordBreak: 'break-word' }}>{s.content}</p>
        </div>
      ))}
      {debugInfo.summaries.length === 0 && (
        <p className="text-xs py-2" style={{ color: '#b0b8c8' }}>无摘要</p>
      )}
    </>
  )
}
