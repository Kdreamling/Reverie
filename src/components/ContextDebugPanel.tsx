import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { DebugInfo } from '../api/chat'
import { C } from '../theme'

type Tab = 'memories' | 'search' | 'window' | 'summaries' | 'session_summary' | 'session_memories' | 'journals' | 'anchor' | 'life_items' | 'events' | 'keepalive' | 'system'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'system', icon: 'S', label: '系统' },
  { key: 'memories', icon: '📌', label: '记忆' },
  { key: 'session_memories', icon: '💾', label: '已存' },
  { key: 'search', icon: '🔍', label: '检索' },
  { key: 'window', icon: '💬', label: '历史' },
  { key: 'summaries', icon: '📝', label: '摘要' },
  { key: 'session_summary', icon: '📋', label: 'Session摘要' },
  { key: 'journals', icon: '📖', label: '日记' },
  { key: 'anchor', icon: '🔖', label: '共振' },
  { key: 'life_items', icon: '☑️', label: '待办' },
  { key: 'events', icon: '📡', label: '感知' },
  { key: 'keepalive', icon: '🌙', label: '自由活动' },
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
  const summaryCount = debugInfo.summaries.length + (debugInfo.rolling_summary?.entries?.length ?? 0)
  const { token_usage } = debugInfo
  const usageRatio = token_usage.budget > 0 ? token_usage.total / token_usage.budget : 0

  const hasSessionSummary = (debugInfo.session_summary?.exists ?? false) || !!debugInfo.previous_session_tail?.content
  const sessionMemCount = debugInfo.session_memories?.length ?? 0
  const journalCount = debugInfo.journals?.count ?? 0
  const hasAnchor = !!debugInfo.anchor_evoked?.id
  const lifeItemCount = debugInfo.life_items?.length ?? 0
  const eventCount = debugInfo.events?.length ?? 0
  const keepaliveCount = debugInfo.keepalive?.length ?? 0

  const counts: Record<Tab, number | string> = {
    system: debugInfo.system_config ? 'ON' : '-',
    memories: memCount,
    session_memories: sessionMemCount,
    search: searchCount,
    window: windowRounds > 0 ? `${windowRounds}轮` : '0',
    summaries: summaryCount,
    session_summary: hasSessionSummary ? '有' : '无',
    journals: journalCount,
    anchor: hasAnchor ? '有' : '无',
    life_items: lifeItemCount,
    events: eventCount,
    keepalive: keepaliveCount,
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
            {TABS.filter(t =>
              (t.key !== 'session_summary' || hasSessionSummary) &&
              (t.key !== 'session_memories' || sessionMemCount > 0) &&
              (t.key !== 'journals' || journalCount > 0) &&
              (t.key !== 'anchor' || hasAnchor) &&
              (t.key !== 'life_items' || lifeItemCount > 0) &&
              (t.key !== 'events' || eventCount > 0) &&
              (t.key !== 'keepalive' || keepaliveCount > 0)
            ).map(t => {
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
            {activeTab === 'system' && <SystemDetail debugInfo={debugInfo} />}
            {activeTab === 'memories' && <MemoryDetail debugInfo={debugInfo} />}
            {activeTab === 'session_memories' && <SessionMemoriesDetail debugInfo={debugInfo} />}
            {activeTab === 'search' && <SearchDetail debugInfo={debugInfo} />}
            {activeTab === 'window' && <WindowDetail debugInfo={debugInfo} />}
            {activeTab === 'summaries' && <SummaryDetail debugInfo={debugInfo} />}
            {activeTab === 'session_summary' && <SessionSummaryDetail debugInfo={debugInfo} />}
            {activeTab === 'journals' && <JournalsDetail debugInfo={debugInfo} />}
            {activeTab === 'anchor' && <AnchorDetail debugInfo={debugInfo} />}
            {activeTab === 'life_items' && <LifeItemsDetail debugInfo={debugInfo} />}
            {activeTab === 'events' && <EventsDetail debugInfo={debugInfo} />}
            {activeTab === 'keepalive' && <KeepaliveDetail debugInfo={debugInfo} />}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Detail sub-components ── */

function SystemDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const config = debugInfo.system_config
  const lastMicro = debugInfo.last_micro_summary
  const itemStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', padding: '6px 0',
    borderBottom: `1px solid ${C.border}`, fontSize: 13,
  }
  const labelStyle: React.CSSProperties = { color: C.textSecondary }
  const valueStyle: React.CSSProperties = { color: C.text, fontFamily: 'monospace' }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>System Config</div>
      {config ? (
        <>
          <div style={itemStyle}><span style={labelStyle}>history_budget</span><span style={valueStyle}>{config.history_budget}</span></div>
          <div style={itemStyle}><span style={labelStyle}>history_fetch_limit</span><span style={valueStyle}>{config.history_fetch_limit}</span></div>
          <div style={itemStyle}><span style={labelStyle}>rerank_threshold</span><span style={valueStyle}>{config.rerank_threshold}</span></div>
          <div style={itemStyle}><span style={labelStyle}>dedup_threshold</span><span style={valueStyle}>{config.dedup_threshold}</span></div>
          <div style={itemStyle}><span style={labelStyle}>micro_summary_model</span><span style={valueStyle}>{config.micro_summary_model}</span></div>
        </>
      ) : (
        <div style={{ color: C.textSecondary, fontSize: 12 }}>no config data</div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 16, marginBottom: 8 }}>Last Micro Summary</div>
      {lastMicro ? (
        <div style={{ background: C.surface, borderRadius: 8, padding: 10, fontSize: 12 }}>
          <div style={{ color: C.textSecondary, marginBottom: 4 }}>{lastMicro.layer} | {lastMicro.time?.slice(0, 16)}</div>
          <div style={{ color: C.text, lineHeight: 1.5 }}>{lastMicro.content}</div>
        </div>
      ) : (
        <div style={{ color: C.textSecondary, fontSize: 12 }}>no micro summary yet</div>
      )}
    </div>
  )
}

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
  const rolling = debugInfo.rolling_summary
  const hasDimensional = debugInfo.summaries.length > 0
  const hasRolling = rolling && rolling.entries.length > 0
  return (
    <>
      {hasRolling && (
        <>
          <div className="text-xs font-medium mb-1" style={{ color: C.textSecondary }}>
            最近动态（{rolling.days}天 · {rolling.tokens} tokens）
          </div>
          {rolling.entries.map((e, i) => (
            <div
              key={`rolling-${i}`}
              className="rounded-lg px-2.5 py-2 text-xs"
              style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
            >
              <span
                className="px-1.5 py-0.5 rounded text-xs font-medium mb-1 inline-block"
                style={{ background: '#e8d5c4', color: '#8b6914', fontSize: 10 }}
              >
                {e.date || `第${i + 1}天`}
              </span>
              <div className="leading-relaxed md-content" style={{ color: C.text, wordBreak: 'break-word', fontSize: 12 }}>
                <ReactMarkdown>{e.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </>
      )}
      {hasDimensional && (
        <>
          {hasRolling && <div className="text-xs font-medium mb-1 mt-2" style={{ color: C.textSecondary }}>中期维度摘要</div>}
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
        </>
      )}
      {!hasRolling && !hasDimensional && (
        <p className="text-xs py-2" style={{ color: C.textMuted }}>无摘要</p>
      )}
    </>
  )
}

function SessionSummaryDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const content = debugInfo.session_summary?.content || ''
  const tail = debugInfo.previous_session_tail
  return (
    <>
      {tail?.content && (
        <div
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ background: '#e8d5c4', color: '#8b6914', fontSize: 10 }}
            >
              昨日对话尾巴
            </span>
            <span style={{ color: C.textMuted, fontSize: 10 }}>{tail.rounds}轮 · {tail.tokens} tokens</span>
          </div>
          <div className="leading-relaxed mt-1 whitespace-pre-wrap" style={{ color: C.text, wordBreak: 'break-word', fontSize: 12 }}>{tail.content}</div>
        </div>
      )}
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
    </>
  )
}

function SessionMemoriesDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const items = debugInfo.session_memories ?? []
  return (
    <>
      {items.map((m, i) => {
        const lc = LAYER_COLORS.ai_journal
        return (
          <div
            key={m.id}
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
                #{i + 1} {m.mem_type}
              </span>
              <span style={{ color: C.textMuted, fontSize: 10 }}>id: {m.id.slice(0, 8)}...</span>
            </div>
            <p className="leading-relaxed" style={{ color: C.text, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{m.content}</p>
          </div>
        )
      })}
      {items.length === 0 && (
        <p className="text-xs py-2" style={{ color: C.textMuted }}>本次对话未记录记忆</p>
      )}
    </>
  )
}

function JournalsDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const entries = debugInfo.journals?.entries ?? []
  return (
    <>
      {entries.map((j, i) => (
        <div
          key={i}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${LAYER_COLORS.ai_journal.dot}22` }}
        >
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium mb-1 inline-block"
            style={{ background: LAYER_COLORS.ai_journal.bg, color: LAYER_COLORS.ai_journal.fg, fontSize: 10 }}
          >
            {j.created_at?.slice(0, 16).replace('T', ' ') || ''}
          </span>
          <p className="leading-relaxed mt-1" style={{ color: C.text, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{j.content}</p>
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-xs py-2" style={{ color: C.textMuted }}>无近期日记注入</p>
      )}
    </>
  )
}

function AnchorDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const anchor = debugInfo.anchor_evoked
  if (!anchor?.id) return <p className="text-xs py-2" style={{ color: C.textMuted }}>本轮无共振锚点</p>
  return (
    <div
      className="rounded-lg px-2.5 py-2 text-xs"
      style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="px-1.5 py-0.5 rounded text-xs font-medium"
          style={{ background: '#e8d5c4', color: '#8b6914', fontSize: 10 }}
        >
          浮现的记忆
        </span>
        <span style={{ color: C.textMuted, fontSize: 10 }}>
          相似度: {anchor.score?.toFixed(2) ?? '-'}
        </span>
        <span style={{ color: C.textMuted, fontSize: 10 }}>
          id: {anchor.id.slice(0, 8)}...
        </span>
      </div>
      <p className="leading-relaxed mt-1" style={{ color: C.text, wordBreak: 'break-word' }}>{anchor.summary}</p>
    </div>
  )
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#D97757',
  normal: '#A08060',
  low: '#B8A898',
}

function LifeItemsDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const items = debugInfo.life_items ?? []
  return (
    <>
      {items.map((item, i) => (
        <div
          key={item.id || i}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ background: C.sidebarActive, color: C.accent, fontSize: 10 }}
            >
              {item.type === 'todo' ? '☐ 待办' : item.type === 'schedule' ? '📅 日程' : '📝 笔记'}
            </span>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{
                background: (PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal) + '15',
                color: PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal,
                fontSize: 10,
              }}
            >
              {item.priority}
            </span>
            {(item.due_at || item.scheduled_at) && (
              <span style={{ color: C.textMuted, fontSize: 10 }}>
                {(item.scheduled_at || item.due_at || '').slice(0, 16)}
              </span>
            )}
          </div>
          <p style={{ color: C.text, wordBreak: 'break-word' }}>{item.content}</p>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-xs py-2" style={{ color: C.textMuted }}>无待办事项</p>
      )}
    </>
  )
}

function EventsDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const events = debugInfo.events ?? []
  return (
    <>
      {events.map((ev, i) => (
        <div
          key={i}
          className="rounded-lg px-2.5 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ color: C.accent, fontWeight: 600, fontSize: 11 }}>{ev.time}</span>
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ background: 'rgba(160,120,90,0.08)', color: '#A08060', fontSize: 10 }}
            >
              {ev.type}
            </span>
            {ev.value && (
              <span style={{ color: C.textSecondary, fontSize: 11 }}>{ev.value}</span>
            )}
          </div>
        </div>
      ))}
      {events.length === 0 && (
        <p className="text-xs py-2" style={{ color: C.textMuted }}>无感知事件</p>
      )}
    </>
  )
}

function KeepaliveDetail({ debugInfo }: { debugInfo: DebugInfo }) {
  const items = debugInfo.keepalive || []
  if (items.length === 0) return <p className="text-xs" style={{ color: C.textMuted }}>无自由活动记录</p>
  const actionLabels: Record<string, string> = { none: '安静等待', message: '发了消息', explore: '探索记忆' }
  return (
    <div className="flex flex-col gap-2">
      {items.map((ka, i) => (
        <div key={i} className="rounded-lg p-2.5" style={{ background: C.memoryBg, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono" style={{ color: C.accent }}>{ka.time}</span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: C.surface, color: C.textSecondary, fontSize: 10 }}>{ka.mode}</span>
            <span className="text-xs" style={{ color: ka.action === 'message' ? C.accent : ka.action === 'explore' ? '#7A9A70' : C.textMuted }}>
              {actionLabels[ka.action] || ka.action}
            </span>
          </div>
          {ka.thoughts && <p className="text-xs leading-relaxed mt-1" style={{ color: C.textSecondary, fontStyle: 'italic' }}>{ka.thoughts}</p>}
          {ka.content && <p className="text-xs leading-relaxed mt-1" style={{ color: ka.action === 'message' ? C.accent : '#7A9A70' }}>{ka.content}</p>}
        </div>
      ))}
    </div>
  )
}
