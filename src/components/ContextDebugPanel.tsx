import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { DebugInfo } from '../api/chat'
import { C } from '../theme'

type Tab = 'memories' | 'search' | 'window' | 'summaries' | 'session_summary' | 'graph'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'memories', icon: '📌', label: '记忆' },
  { key: 'search', icon: '🔍', label: '检索' },
  { key: 'window', icon: '💬', label: '历史' },
  { key: 'summaries', icon: '📝', label: '摘要' },
  { key: 'session_summary', icon: '📋', label: 'Session摘要' },
  { key: 'graph', icon: '🕸️', label: '图谱' },
]

const LAYER_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  core_base: { bg: 'rgba(200,170,130,0.12)', fg: '#A08060', dot: '#C4A878' },
  core_living: { bg: 'rgba(140,160,180,0.1)', fg: '#7A8A9A', dot: '#9AACBC' },
  scene: { bg: 'rgba(200,150,160,0.1)', fg: '#B08088', dot: '#D0A0A8' },
  ai_journal: { bg: 'rgba(150,180,140,0.1)', fg: '#7A9A70', dot: '#A0C090' },
}

const LAYER_LABELS: Record<string, string> = {
  core_base: '基石',
  core_living: '活水',
  scene: '场景',
  ai_journal: '日记',
}

const MATCH_COLORS: Record<string, string> = {
  keyword: '#A08060',
  vector: '#B08088',
  both: '#7A9A70',
}

function getScoreColor(score: number) {
  if (score >= 0.7) return '#7A9A70'
  if (score >= 0.4) return '#C4A878'
  return C.textMuted
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

  const hasSessionSummary = debugInfo.session_summary?.exists ?? false
  const graphTotal = (debugInfo.graph?.seed_nodes?.length ?? 0) + (debugInfo.graph?.expanded_nodes?.length ?? 0)

  const counts: Record<Tab, number | string> = {
    memories: memCount,
    search: searchCount,
    window: windowRounds > 0 ? `${windowRounds}轮` : '0',
    summaries: summaryCount,
    session_summary: hasSessionSummary ? '有' : '无',
    graph: graphTotal,
  }

  return (
    <div
      className="mt-2 rounded-xl overflow-hidden w-full"
      style={{
        background: C.memoryBg,
        border: `1px solid ${C.border}`,
        backdropFilter: 'blur(8px)',
        transition: 'all 200ms ease',
      }}
    >
      {/* pill bar + token bar */}
      {activeTab === null ? (
        <div className="px-2.5 py-2.5 sm:px-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {TABS.filter(t => (t.key !== 'session_summary' || hasSessionSummary) && (t.key !== 'graph' || graphTotal > 0)).map(t => {
              const c = counts[t.key]
              const empty = c === 0 || c === '0'
              return (
                <button
                  key={t.key}
                  onClick={() => !empty && setActiveTab(t.key)}
                  className="flex items-center gap-1 px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-full text-xs transition-all duration-150 cursor-pointer active:scale-95"
                  style={{
                    background: empty ? 'rgba(0,0,0,0.03)' : C.sidebarActive,
                    color: empty ? C.textMuted : C.accent,
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
          <div className="flex items-center gap-2 text-xs" style={{ color: C.textMuted }}>
            <span className="whitespace-nowrap">{token_usage.total} / {token_usage.budget}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: C.surface, minWidth: 40 }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(usageRatio * 100, 100)}%`,
                  background: usageRatio > 0.9 ? C.errorText : `linear-gradient(90deg, ${C.accentWarm}, ${C.accent})`,
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
            style={{ color: C.accent, minHeight: 28 }}
          >
            <ChevronLeft size={14} />
            <span>返回</span>
            <span className="ml-auto" style={{ color: C.textMuted }}>
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
            {activeTab === 'session_summary' && <SessionSummaryDetail debugInfo={debugInfo} />}
            {activeTab === 'graph' && <GraphDetail debugInfo={debugInfo} />}
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
      {layers.map(l => l.items.map((m, i) => {
        const lc = LAYER_COLORS[l.key] || LAYER_COLORS.core_base
        return (
          <div
            key={`${l.key}-${i}`}
            className="rounded-lg px-2.5 py-2 text-xs"
            style={{
              background: 'rgba(255,255,255,0.6)',
              border: `1px solid ${lc.dot}22`,
            }}
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span
                className="px-1.5 py-0.5 rounded text-xs font-medium"
                style={{ background: lc.bg, color: lc.fg, fontSize: 10 }}
              >
                {LAYER_LABELS[l.key] || l.label}
              </span>
              {'importance' in m && (
                <span style={{ color: C.textMuted, fontSize: 10 }}>importance: {(m as { importance: number }).importance}</span>
              )}
              {'recorded_at' in m && (
                <span style={{ color: C.textMuted, fontSize: 10 }}>{(m as { recorded_at: string }).recorded_at}</span>
              )}
            </div>
            <p className="leading-relaxed" style={{ color: C.text, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{m.content}</p>
          </div>
        )
      }))}
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
          style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-medium" style={{ color: getScoreColor(r.score), fontSize: 11 }}>
              {r.score.toFixed(2)}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: (MATCH_COLORS[r.match_type] || C.textMuted) + '15', color: MATCH_COLORS[r.match_type] || C.textMuted, fontSize: 10 }}
            >
              {r.match_type}
            </span>
          </div>
          {r.source === 'summaries' ? (
            <p style={{ color: C.text, wordBreak: 'break-word' }}>{r.summary}</p>
          ) : r.source === 'memories' ? (
            <>
              <span
                className="px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: (LAYER_COLORS[r.layer ?? '']?.bg || LAYER_COLORS.scene.bg),
                  color: (LAYER_COLORS[r.layer ?? '']?.fg || LAYER_COLORS.scene.fg),
                  fontSize: 10,
                }}
              >
                {LAYER_LABELS[r.layer ?? ''] || r.layer || 'memory'}
              </span>
              <p style={{ color: C.text, wordBreak: 'break-word', marginTop: 4 }}>📝 {r.content}</p>
            </>
          ) : (
            <>
              <p style={{ color: C.text, wordBreak: 'break-word' }}>👤 {r.user_msg}</p>
              <p style={{ color: C.textSecondary, wordBreak: 'break-word', marginTop: 2 }}>🤖 {r.assistant_msg}</p>
            </>
          )}
        </div>
      ))}
      {debugInfo.search_results.length === 0 && (
        <p className="text-xs py-2" style={{ color: C.textMuted }}>未触发检索或无结果</p>
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
        <span style={{ color: C.textMuted }}>
          滑动窗口：<strong style={{ color: C.text }}>{w?.rounds ?? 0}</strong> 轮
          {w?.range && ` · ${w.range}`}
        </span>
      </div>
      {messages.map((m, i) => (
        <div
          key={i}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
        >
          {m.user_msg && <p style={{ color: C.text, wordBreak: 'break-word' }}>👤 {m.user_msg}</p>}
          {m.assistant_msg && <p style={{ color: C.textSecondary, wordBreak: 'break-word', marginTop: 2 }}>🤖 {m.assistant_msg}</p>}
        </div>
      ))}
      {messages.length === 0 && (
        <p className="text-xs py-2" style={{ color: C.textMuted }}>无历史对话</p>
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
          style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
        >
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium mb-1 inline-block"
            style={{ background: C.sidebarActive, color: C.accent, fontSize: 10 }}
          >
            {s.dimension}
          </span>
          <div className="leading-relaxed md-content" style={{ color: C.text, wordBreak: 'break-word', fontSize: 12 }}><ReactMarkdown>{s.content}</ReactMarkdown></div>
        </div>
      ))}
      {debugInfo.summaries.length === 0 && (
        <p className="text-xs py-2" style={{ color: C.textMuted }}>无摘要</p>
      )}
    </>
  )
}

function SessionSummaryDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const content = debugInfo.session_summary?.content || ''
  return (
    <div
      className="rounded-lg px-2.5 py-2 text-xs"
      style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
    >
      <span
        className="px-1.5 py-0.5 rounded text-xs font-medium mb-1 inline-block"
        style={{ background: C.sidebarActive, color: C.accent, fontSize: 10 }}
      >
        前情概要
      </span>
      <div className="leading-relaxed mt-1 md-content" style={{ color: C.text, wordBreak: 'break-word', fontSize: 12 }}><ReactMarkdown>{content}</ReactMarkdown></div>
    </div>
  )
}

const RELATION_LABELS: Record<string, string> = {
  causal: '因果', echo: '呼应', growth: '成长',
  same_topic: '同主题', temporal: '时间线',
}

function GraphDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const graph = debugInfo.graph
  if (!graph) return <p className="text-xs py-2" style={{ color: C.textMuted }}>图谱未启用</p>
  const [showRaw, setShowRaw] = useState(false)

  return (
    <>
      {graph.seed_nodes.map((seed, i) => (
        <div
          key={`seed-${i}`}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.accent}22` }}
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ background: C.sidebarActive, color: C.accent, fontSize: 10 }}
            >
              ◆ 种子
            </span>
            <span style={{ color: C.textMuted, fontSize: 10 }}>
              相似度: {seed.similarity.toFixed(2)}
            </span>
            {seed.base_importance != null && seed.base_importance >= 0.9 && (
              <span style={{ color: C.accentWarm, fontSize: 10 }}>★</span>
            )}
          </div>
          <p style={{ color: C.text, wordBreak: 'break-word' }}>{seed.content}</p>

          {/* 展开的邻居节点 */}
          {graph.expanded_nodes.map((nb, j) => (
            <div
              key={`nb-${j}`}
              className="ml-3 mt-1.5 rounded-lg px-2 py-1.5"
              style={{ background: C.memoryBg, borderLeft: `2px solid ${C.accent}30` }}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ background: LAYER_COLORS.scene.bg, color: LAYER_COLORS.scene.fg, fontSize: 10 }}
                >
                  └─ {RELATION_LABELS[nb.edge_relation_type] || nb.edge_relation_type}
                </span>
                {nb.emotion_intensity != null && (
                  <span style={{ color: C.textMuted, fontSize: 10 }}>强度: {nb.emotion_intensity}</span>
                )}
                {nb.base_importance != null && nb.base_importance >= 0.9 && (
                  <span style={{ color: C.accentWarm, fontSize: 10 }}>★</span>
                )}
              </div>
              <p style={{ color: C.textSecondary, wordBreak: 'break-word' }}>{nb.content}</p>
            </div>
          ))}
        </div>
      ))}

      {/* 注入原文（可折叠） */}
      {graph.formatted_text && (
        <div
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.4)', border: `1px solid ${C.border}` }}
        >
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="cursor-pointer text-xs"
            style={{ color: C.textMuted }}
          >
            {showRaw ? '▼' : '▶'} 注入原文
          </button>
          {showRaw && (
            <pre className="mt-1 whitespace-pre-wrap" style={{ color: C.textSecondary, fontSize: 11 }}>
              {graph.formatted_text}
            </pre>
          )}
        </div>
      )}
    </>
  )
}
