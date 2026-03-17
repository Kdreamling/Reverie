import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { DebugInfo } from '../api/chat'

type Tab = 'memories' | 'search' | 'window' | 'summaries'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'memories', icon: '\ud83d\udccc', label: '\u8bb0\u5fc6' },
  { key: 'search', icon: '\ud83d\udd0d', label: '\u68c0\u7d22' },
  { key: 'window', icon: '\ud83d\udcac', label: '\u5386\u53f2' },
  { key: 'summaries', icon: '\ud83d\udcdd', label: '\u6458\u8981' },
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
    window: windowRounds > 0 ? `${windowRounds}\u8f6e` : '0',
    summaries: summaryCount,
  }

  return (
    <div
      className="mt-2 rounded-xl overflow-hidden"
      style={{
        background: 'rgba(0,47,167,0.04)',
        border: '1px solid rgba(0,47,167,0.10)',
        backdropFilter: 'blur(8px)',
        transition: 'all 200ms ease',
      }}
    >
      {/* pill bar + token bar */}
      {activeTab === null ? (
        <div className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {TABS.map(t => {
              const c = counts[t.key]
              const empty = c === 0 || c === '0'
              return (
                <button
                  key={t.key}
                  onClick={() => !empty && setActiveTab(t.key)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all duration-150 cursor-pointer"
                  style={{
                    background: empty ? 'rgba(0,0,0,0.03)' : 'rgba(0,47,167,0.08)',
                    color: empty ? '#b0b8c8' : '#002FA7',
                    opacity: empty ? 0.5 : 1,
                    fontWeight: 500,
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
            <span>Token: {token_usage.total} / {token_usage.budget}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,47,167,0.08)' }}>
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
        <div className="px-3 py-2.5">
          <button
            onClick={() => setActiveTab(null)}
            className="flex items-center gap-1 text-xs mb-2 cursor-pointer transition-colors"
            style={{ color: '#002FA7' }}
          >
            <ChevronLeft size={14} />
            <span>\u8fd4\u56de</span>
            <span className="ml-auto" style={{ color: '#8a9ab5' }}>
              {TABS.find(t => t.key === activeTab)?.icon} {TABS.find(t => t.key === activeTab)?.label} ({counts[activeTab]})
            </span>
          </button>

          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
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
          <div className="flex items-center gap-1.5 mb-1">
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
          <p className="leading-relaxed" style={{ color: '#3a4a6a', wordBreak: 'break-all' }}>{m.content}</p>
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
            <p style={{ color: '#3a4a6a' }}>{r.summary}</p>
          ) : (
            <>
              <p style={{ color: '#3a4a6a' }}><span style={{ color: '#8a9ab5' }}>\ud83d\udc64</span> {r.user_msg}</p>
              <p style={{ color: '#3a4a6a' }}><span style={{ color: '#8a9ab5' }}>\ud83e\udd16</span> {r.assistant_msg}</p>
            </>
          )}
        </div>
      ))}
      {debugInfo.search_results.length === 0 && (
        <p className="text-xs py-2" style={{ color: '#b0b8c8' }}>\u672a\u89e6\u53d1\u68c0\u7d22\u6216\u65e0\u7ed3\u679c</p>
      )}
    </>
  )
}

function WindowDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const w = debugInfo.sliding_window
  return (
    <div className="rounded-lg px-2.5 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.6)' }}>
      <p style={{ color: '#3a4a6a' }}>
        \u6ed1\u52a8\u7a97\u53e3\uff1a<strong>{w?.rounds ?? 0}</strong> \u8f6e
        {w?.range && <span style={{ color: '#8a9ab5' }}> \u00b7 {w.range}</span>}
      </p>
    </div>
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
          <p className="leading-relaxed" style={{ color: '#3a4a6a' }}>{s.content}</p>
        </div>
      ))}
      {debugInfo.summaries.length === 0 && (
        <p className="text-xs py-2" style={{ color: '#b0b8c8' }}>\u65e0\u6458\u8981</p>
      )}
    </>
  )
}
