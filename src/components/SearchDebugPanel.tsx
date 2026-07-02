import { useState, useRef, useEffect } from 'react'
import { X, Search, CornerDownLeft, Loader2, AlertTriangle } from 'lucide-react'
import { client } from '../api/client'

// ─── Types（对齐后端 /api/debug/search 响应）────────────────────────────────

interface ChatPath {
  would_search: boolean
  skip_reason: string | null
  intent: string
  intent_overridden: boolean
  search_limit: number
}

interface AutoInjectPath {
  rule: string
  search_query: string | null
  note: string
}

interface TraceCandidate {
  id: string
  source: string
  layer: string
  match_type: string
  created_at: string
  snippet: string
}

interface RerankVerdict {
  index: number
  score: number | null
  kept: boolean
  reason: string
}

interface TraceFinal extends TraceCandidate {
  base_score: number
  base_from: string
  hits_boost: number
  time_boost: number
  entity_boost: number
  final_score: number
}

interface SearchTrace {
  intent?: string
  tables?: string[]
  layers?: string[]
  expanded_terms?: string[]
  limit?: number
  time_scale?: number | null
  recall?: { keyword: number; vector: number; time_range: number; errors: string[] }
  candidates?: TraceCandidate[]
  rerank?: { mode: string; reason?: string; sent?: number; top_n?: number; threshold?: number; verdicts?: RerankVerdict[] }
  final?: TraceFinal[]
  timing?: { search_s: number; rerank_s: number }
  timeout?: boolean
  error?: string
}

interface AnchorHit {
  id?: string
  summary?: string
  score?: number
  would_surface?: boolean
  temporal_reason?: string | null
  error?: string
}

interface DebugResponse {
  query: string
  chat_path: ChatPath
  auto_inject_path: AutoInjectPath
  trace: SearchTrace
  result_count: number
  anchors: AnchorHit[]
  anchor_note: string
}

// ─── Palette（对齐 DevPage 暖夜终端）─────────────────────────────────────────

const P = {
  bg: '#15100a', bg2: '#1d1610', border: '#3e301f', borderDim: '#2d2317',
  ink: '#ecd7b0', dim: '#b89c73', muted: '#7a6547', faint: '#55442e',
  amber: '#e8a951', ok: '#a8c090', warn: '#d4735a', plum: '#c98a78',
}

const SOURCE_COLORS: Record<string, string> = {
  memories: '#a8c090',
  memory_summaries: '#c9a878',
  conversations: '#c98a78',
}

const SOURCE_LABELS: Record<string, string> = {
  memories: '记忆',
  memory_summaries: '摘要',
  conversations: '原文',
}

const LAYER_LABELS: Record<string, string> = {
  core_base: '基石', core_living: '活水', ai_journal: '日记',
  conversation_snapshot: '快照', dream_manual: '手写', scene: '场景',
  daily_rolling: '滚动', emotion: '情绪', event: '事件',
  preference: '偏好', knowledge: '知识', self: '自我',
}

function fmtScore(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(digits)
}

function boostText(n: number): string {
  if (!n) return ''
  return n > 0 ? `+${n.toFixed(3)}` : n.toFixed(3)
}

function ageOf(iso: string): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return '今天'
  if (days < 30) return `${days}天前`
  if (days < 365) return `${Math.floor(days / 30)}个月前`
  return `${Math.floor(days / 365)}年前`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SearchDebugPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [sceneType, setSceneType] = useState('daily')
  const [channel, setChannel] = useState('claude')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DebugResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const run = async () => {
    const q = query.trim()
    if (!q || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await client.post<DebugResponse>('/debug/search', {
        query: q, scene_type: sceneType, channel,
      })
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const trace = data?.trace
  const verdictByIndex = new Map<number, RerankVerdict>()
  trace?.rerank?.verdicts?.forEach(v => verdictByIndex.set(v.index, v))
  const doubleInject = !!data && data.chat_path.would_search &&
    ['recall', 'plot_recall', 'emotion'].includes(data.auto_inject_path.rule)

  return (
    <div style={{
      position: 'fixed', inset: 0, top: 48, zIndex: 60,
      background: P.bg, color: P.ink, overflowY: 'auto',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12,
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* 头 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Search size={14} strokeWidth={1.6} style={{ color: P.amber }} />
          <span style={{ color: P.amber, letterSpacing: 1 }}>memory · search debug</span>
          <span style={{ color: P.faint, fontSize: 11 }}>输一句话，看晨会浮现什么、为什么</span>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: `1px solid ${P.borderDim}`,
            color: P.muted, borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}><X size={12} strokeWidth={1.6} /></button>
        </div>

        {/* 输入行 */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          border: `1px solid ${P.border}`, borderRadius: 6, padding: '8px 10px', background: P.bg2,
        }}>
          <span style={{ color: P.amber }}>{'>'}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') run() }}
            placeholder="还记得我们上次聊到…"
            style={{
              flex: 1, minWidth: 200, background: 'none', border: 'none', outline: 'none',
              color: P.ink, fontFamily: 'inherit', fontSize: 13,
            }}
          />
          <select value={sceneType} onChange={e => setSceneType(e.target.value)} style={selStyle}>
            <option value="daily">daily</option>
            <option value="plot">plot</option>
          </select>
          <select value={channel} onChange={e => setChannel(e.target.value)} style={selStyle}>
            <option value="claude">claude</option>
            <option value="deepseek">deepseek</option>
          </select>
          <button onClick={run} disabled={loading || !query.trim()} style={{
            background: 'none', border: `1px solid ${P.border}`, color: P.amber,
            borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, opacity: loading || !query.trim() ? 0.4 : 1,
          }}>
            {loading ? <Loader2 size={12} className="rv-spin" /> : <CornerDownLeft size={12} strokeWidth={1.6} />}
            run
          </button>
        </div>

        {error && (
          <div style={{ color: P.warn, marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertTriangle size={12} /> {error}
          </div>
        )}

        {data && trace && (
          <>
            {/* ── 两条注入路径 ── */}
            <Section title="注入路径判定">
              <Row>
                <Chip label="聊天路径" />
                {data.chat_path.would_search ? (
                  <span>会检索 · 意图 <b style={{ color: P.amber }}>{data.chat_path.intent}</b> · 取 top {data.chat_path.search_limit}</span>
                ) : (
                  <span style={{ color: P.muted }}>跳过 — {data.chat_path.skip_reason}</span>
                )}
              </Row>
              <Row>
                <Chip label="auto_inject" />
                <span>
                  规则 <b style={{ color: data.auto_inject_path.rule === 'default' ? P.muted : P.plum }}>{data.auto_inject_path.rule}</b>
                  <span style={{ color: P.muted }}> · {data.auto_inject_path.note}</span>
                </span>
              </Row>
              {doubleInject && (
                <Row>
                  <AlertTriangle size={12} style={{ color: P.warn, flexShrink: 0 }} />
                  <span style={{ color: P.warn }}>双重注入：这条消息会触发两次独立检索，分别注入两处</span>
                </Row>
              )}
            </Section>

            {/* ── 召回概况 ── */}
            <Section title="召回">
              <Row><Key>扩展词</Key><span>{trace.expanded_terms?.join(' / ') || '—'}</span></Row>
              <Row><Key>搜索面</Key><span style={{ color: P.dim }}>{trace.tables?.join(', ')} · 层 {trace.layers?.join('/')}</span></Row>
              <Row>
                <Key>三路结果</Key>
                <span>
                  关键词 <b>{trace.recall?.keyword ?? 0}</b> · 向量 <b>{trace.recall?.vector ?? 0}</b> · 时间 <b>{trace.recall?.time_range ?? 0}</b>
                  {trace.time_scale != null && <span style={{ color: P.dim }}>（时间词命中，scale={trace.time_scale}天）</span>}
                  {trace.timing && <span style={{ color: P.faint }}>　耗时 搜索{trace.timing.search_s}s / rerank {trace.timing.rerank_s}s</span>}
                </span>
              </Row>
              {trace.timeout && <Row><span style={{ color: P.warn }}>⚠ 超时（10s），真实对话中这次检索会返回空</span></Row>}
              {!!trace.recall?.errors?.length && <Row><span style={{ color: P.warn }}>召回异常: {trace.recall.errors.join('; ')}</span></Row>}
            </Section>

            {/* ── 候选全表（rerank 判决）── */}
            <Section title={`候选 ${trace.candidates?.length ?? 0} 条 → rerank ${trace.rerank?.mode === 'api' ? `判决（阈值 ${trace.rerank.threshold}）` : `（${trace.rerank?.mode ?? '—'}${trace.rerank?.reason ? ': ' + trace.rerank.reason : ''}）`}`}>
              {(trace.candidates ?? []).map((c, i) => {
                const v = verdictByIndex.get(i)
                const kept = trace.rerank?.mode === 'api' ? (v?.kept ?? false) : true
                return (
                  <div key={`${c.source}-${c.id}-${i}`} style={{
                    display: 'flex', gap: 8, padding: '5px 0', alignItems: 'baseline',
                    borderBottom: `1px solid ${P.borderDim}`, opacity: kept ? 1 : 0.45,
                  }}>
                    <span style={{ color: P.faint, width: 20, textAlign: 'right', flexShrink: 0 }}>{i}</span>
                    <SourceBadge source={c.source} layer={c.layer} />
                    <span style={{ flex: 1, color: kept ? P.ink : P.muted, wordBreak: 'break-all' }}>
                      {c.snippet}
                      <span style={{ color: P.faint }}>　{ageOf(c.created_at)} · {c.match_type}</span>
                    </span>
                    <span style={{ flexShrink: 0, color: kept ? P.ok : P.muted, minWidth: 90, textAlign: 'right' }}>
                      {v ? (v.score != null ? fmtScore(v.score) : '') : ''}
                      {v && !v.kept && <span style={{ color: P.faint }}> {v.reason}</span>}
                      {v && v.kept && ' ✓'}
                    </span>
                  </div>
                )
              })}
              {!trace.candidates?.length && <Row><span style={{ color: P.muted }}>没有召回任何候选</span></Row>}
            </Section>

            {/* ── 最终结果 + 得分解释 ── */}
            <Section title={`最终注入 ${trace.final?.length ?? 0} 条（按 final_score 排序）`}>
              {(trace.final ?? []).map((f, i) => (
                <div key={`${f.source}-${f.id}`} style={{
                  border: `1px solid ${P.borderDim}`, borderRadius: 6,
                  padding: '8px 10px', marginBottom: 8, background: P.bg2,
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ color: P.amber }}>#{i + 1}</span>
                    <SourceBadge source={f.source} layer={f.layer} />
                    <span style={{ color: P.faint }}>{ageOf(f.created_at)}</span>
                    <span style={{ marginLeft: 'auto', color: P.amber }}>{fmtScore(f.final_score)}</span>
                  </div>
                  <div style={{ color: P.dim, marginBottom: 6, wordBreak: 'break-all' }}>{f.snippet}</div>
                  <div style={{ color: P.faint, fontSize: 11 }}>
                    {f.base_from === 'rerank' ? 'rerank' : '兜底'} {fmtScore(f.base_score)}
                    {f.hits_boost !== 0 && <span style={{ color: P.ok }}>　热度 {boostText(f.hits_boost)}</span>}
                    {f.time_boost !== 0 && <span style={{ color: f.time_boost > 0 ? P.ok : P.plum }}>　时间 {boostText(f.time_boost)}</span>}
                    {f.entity_boost !== 0 && <span style={{ color: P.ok }}>　实体 {boostText(f.entity_boost)}</span>}
                    <span>　= {fmtScore(f.final_score)}</span>
                  </div>
                </div>
              ))}
              {!trace.final?.length && <Row><span style={{ color: P.muted }}>这句话不会浮现任何记忆</span></Row>}
            </Section>

            {/* ── 锚点共振 ── */}
            <Section title="锚点共振">
              {data.anchors.filter(a => !a.error).map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 8, padding: '5px 0', alignItems: 'baseline', borderBottom: `1px solid ${P.borderDim}` }}>
                  <span style={{ color: a.would_surface ? P.amber : P.faint, flexShrink: 0 }}>
                    {a.would_surface ? '● 会浮现' : '○ 近失'}
                  </span>
                  <span style={{ flex: 1, color: a.would_surface ? P.ink : P.muted }}>{a.summary}</span>
                  <span style={{ color: P.dim, flexShrink: 0 }}>{fmtScore(a.score)}</span>
                </div>
              ))}
              {data.anchors.some(a => a.error) && <Row><span style={{ color: P.warn }}>锚点查询异常: {data.anchors.find(a => a.error)?.error}</span></Row>}
              {!data.anchors.length && <Row><span style={{ color: P.muted }}>没有共振候选（score ≥ 0.5 的都没有）</span></Row>}
              <div style={{ color: P.faint, fontSize: 11, marginTop: 6 }}>{data.anchor_note}</div>
            </Section>
          </>
        )}

        {!data && !loading && !error && (
          <div style={{ color: P.faint, marginTop: 40, textAlign: 'center', lineHeight: 2 }}>
            试试：还记得我们聊过 StackChan 吗 / 我今天好累 / 上周做了什么
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 小件 ────────────────────────────────────────────────────────────────────

const selStyle: React.CSSProperties = {
  background: 'none', border: `1px solid ${P.borderDim}`, color: P.dim,
  borderRadius: 4, padding: '3px 6px', fontFamily: 'inherit', fontSize: 11, outline: 'none',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        color: P.muted, letterSpacing: 1, fontSize: 11, marginBottom: 8,
        borderBottom: `1px solid ${P.border}`, paddingBottom: 4,
      }}>── {title}</div>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, padding: '3px 0', alignItems: 'baseline', lineHeight: 1.6 }}>{children}</div>
}

function Key({ children }: { children: React.ReactNode }) {
  return <span style={{ color: P.muted, width: 64, flexShrink: 0 }}>{children}</span>
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{
      border: `1px solid ${P.border}`, borderRadius: 3, padding: '1px 6px',
      color: P.dim, fontSize: 11, flexShrink: 0,
    }}>{label}</span>
  )
}

function SourceBadge({ source, layer }: { source: string; layer: string }) {
  const color = SOURCE_COLORS[source] || P.dim
  return (
    <span style={{ color, flexShrink: 0, fontSize: 11, border: `1px solid ${P.borderDim}`, borderRadius: 3, padding: '1px 5px' }}>
      {SOURCE_LABELS[source] || source}{layer ? ` · ${LAYER_LABELS[layer] || layer}` : ''}
    </span>
  )
}
