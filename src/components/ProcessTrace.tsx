import { memo, useState, useEffect, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Lightbulb, Search, Bookmark, Wrench } from 'lucide-react'
import { C } from '../theme'
import type { MemoryOperation } from '../api/chat'

const ROOM_FONT = "'EB Garamond', 'Noto Serif SC', 'Cormorant Garamond', Georgia, serif"
const READABLE_FONT = "'Iowan Old Style', 'Charter', 'Palatino Linotype', 'Palatino', 'Noto Serif SC', Georgia, serif"
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export type TraceItem =
  | { kind: 'thinking'; id: string; text: string; elapsed?: number | null; live?: boolean; startTime?: number }
  | { kind: 'memory_search'; id: string; query: string; found?: number | null; content?: string; elapsed?: number | null; live?: boolean; startTime?: number }
  | { kind: 'memory_op'; id: string; op: MemoryOperation; elapsed?: number | null }
  | { kind: 'tool'; id: string; tool: string; args?: string; result?: string; live?: boolean; startTime?: number; elapsed?: number | null }

function formatElapsed(seconds: number): string {
  return seconds.toFixed(1) + 's'
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function useElapsedTimer(startTime: number | null | undefined, active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active || !startTime) { setElapsed(0); return }
    setElapsed((Date.now() - startTime) / 1000)
    const id = setInterval(() => setElapsed((Date.now() - startTime) / 1000), 100)
    return () => clearInterval(id)
  }, [startTime, active])
  return elapsed
}

const Spinner = () => <span className="tool-spinner" style={{ width: 13, height: 13, flexShrink: 0 }} />

function buildHeader(item: TraceItem, displayTime: number | null): { icon: ReactNode; title: string; expandable: boolean } {
  switch (item.kind) {
    case 'thinking': {
      const live = !!item.live
      const t = displayTime != null && displayTime > 0 ? ` ${formatElapsed(displayTime)}` : ''
      return {
        icon: live ? <Spinner /> : <Lightbulb size={13} strokeWidth={1.6} style={{ color: C.thinkingAccent, flexShrink: 0 }} />,
        title: live ? `Thinking${t}` : `Thought${t}`,
        expandable: !!item.text,
      }
    }
    case 'memory_search': {
      const live = !!item.live
      const t = displayTime != null && displayTime > 0 ? ` · ${formatElapsed(displayTime)}` : ''
      const q = item.query || (live ? 'searching' : 'search')
      return {
        icon: live ? <Spinner /> : <Search size={13} strokeWidth={1.6} style={{ color: C.memoryRefAccent, flexShrink: 0 }} />,
        title: live ? `Memory · ${q}${t}` : `Memory · ${q}${item.found != null ? ` · ${item.found} found` : ''}${t}`,
        expandable: !!item.content,
      }
    }
    case 'memory_op': {
      const summary = item.op.content ? ' · ' + truncate(item.op.content, 36) : ''
      return {
        icon: <Bookmark size={13} strokeWidth={1.6} style={{ color: C.memoryOpsAccent, flexShrink: 0 }} />,
        title: `Memory ${item.op.type}${summary}`,
        expandable: !!(item.op.content || item.op.reason),
      }
    }
    case 'tool': {
      const live = !!item.live
      const t = displayTime != null && displayTime > 0 ? ` · ${formatElapsed(displayTime)}` : ''
      return {
        icon: live ? <Spinner /> : <Wrench size={13} strokeWidth={1.6} style={{ color: C.toolsAccent, flexShrink: 0 }} />,
        title: `Tool: ${item.tool}${t}`,
        expandable: !!(item.args || item.result),
      }
    }
  }
}

function renderBody(item: TraceItem): ReactNode {
  switch (item.kind) {
    case 'thinking':
      return (
        <p className="whitespace-pre-wrap" style={{
          fontStyle: 'italic',
          fontFamily: READABLE_FONT,
          fontSize: 14,
          lineHeight: 1.85,
          color: C.textSecondary,
          wordBreak: 'break-word',
        }}>{item.text}</p>
      )
    case 'memory_search':
      return (
        <p className="whitespace-pre-wrap" style={{
          fontFamily: ROOM_FONT,
          fontSize: 12.5,
          lineHeight: 1.75,
          color: C.textMuted,
          wordBreak: 'break-word',
        }}>{item.content || '(empty)'}</p>
      )
    case 'memory_op':
      return (
        <div style={{ fontFamily: ROOM_FONT, fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>
          {item.op.content && <div className="whitespace-pre-wrap" style={{ marginBottom: item.op.reason ? 4 : 0 }}>{item.op.content}</div>}
          {item.op.reason && <div className="whitespace-pre-wrap" style={{ fontStyle: 'italic', opacity: 0.75 }}>— {item.op.reason}</div>}
        </div>
      )
    case 'tool':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {item.args && (
            <div>
              <div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: ROOM_FONT, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Parameters</div>
              <pre style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textSecondary, background: 'rgba(196,154,120,0.06)', padding: '8px 10px', borderRadius: 6, overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{item.args}</pre>
            </div>
          )}
          {item.result && (
            <div>
              <div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: ROOM_FONT, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Result</div>
              <pre style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textSecondary, background: 'rgba(196,154,120,0.04)', padding: '8px 10px', borderRadius: 6, overflow: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{item.result}</pre>
            </div>
          )}
        </div>
      )
  }
}

// Timeline geometry — icon column on the left with a vertical thread connecting all rows
const ICON_COL = 20
const ICON_SIZE = 14
const ROW_TOP_PAD = 6
const ICON_TOP = ROW_TOP_PAD + 4 // distance from row top to icon's top edge
const ICON_CENTER = ICON_TOP + ICON_SIZE / 2
const THREAD_COLOR = 'rgba(196,154,120,0.22)'

const TraceRow = memo(function TraceRow({ item, isFirst, isLast, defaultOpen }: { item: TraceItem; isFirst: boolean; isLast: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const isLive = 'live' in item && !!item.live
  const startTime = 'startTime' in item ? item.startTime : undefined
  const liveElapsed = useElapsedTimer(startTime, isLive)
  const elapsed = 'elapsed' in item ? (item.elapsed ?? null) : null
  const displayTime = elapsed != null ? elapsed : (isLive ? liveElapsed : null)

  const { icon, title, expandable } = buildHeader(item, displayTime)

  return (
    <div style={{ display: 'flex', position: 'relative', minWidth: 0 }}>
      {/* Icon + thread column */}
      <div style={{ flexShrink: 0, width: ICON_COL, position: 'relative', alignSelf: 'stretch' }}>
        {/* Upper thread (skip on first row) */}
        {!isFirst && (
          <div style={{
            position: 'absolute',
            left: '50%', transform: 'translateX(-50%)',
            top: 0, height: ICON_CENTER - ICON_SIZE / 2 - 2,
            width: 1, background: THREAD_COLOR,
          }} />
        )}
        {/* Icon node */}
        <div style={{
          position: 'absolute', top: ICON_TOP, left: '50%',
          transform: 'translateX(-50%)',
          width: ICON_SIZE, height: ICON_SIZE,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        {/* Lower thread (skip on last row) */}
        {!isLast && (
          <div style={{
            position: 'absolute',
            left: '50%', transform: 'translateX(-50%)',
            top: ICON_CENTER + ICON_SIZE / 2 + 2, bottom: 0,
            width: 1, background: THREAD_COLOR,
          }} />
        )}
      </div>

      {/* Content column */}
      <div style={{ flex: 1, minWidth: 0, padding: `${ROW_TOP_PAD}px 0 ${isLast ? 0 : 10}px 12px` }}>
        <div
          className="flex items-center gap-2"
          style={{ cursor: expandable ? 'pointer' : 'default', minHeight: 22 }}
          onClick={() => { if (expandable) setOpen(o => !o) }}
        >
          <span className="flex-1 min-w-0" style={{
            fontSize: 13.5,
            color: C.textSecondary,
            fontFamily: ROOM_FONT,
            letterSpacing: '0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{title}</span>
          {expandable && (
            open
              ? <ChevronDown size={12} strokeWidth={2} style={{ color: C.textMuted, flexShrink: 0 }} />
              : <ChevronRight size={12} strokeWidth={2} style={{ color: C.textMuted, flexShrink: 0 }} />
          )}
        </div>
        {open && expandable && (
          <div style={{ marginTop: 8 }}>
            {renderBody(item)}
          </div>
        )}
      </div>
    </div>
  )
})

export default function ProcessTrace({ items, defaultOpenLast }: { items: TraceItem[]; defaultOpenLast?: boolean }) {
  if (items.length === 0) return null
  const lastIdx = items.length - 1
  return (
    <div className="mb-4" style={{ maxWidth: '100%' }}>
      {items.map((item, i) => (
        <TraceRow
          key={item.id}
          item={item}
          isFirst={i === 0}
          isLast={i === lastIdx}
          defaultOpen={defaultOpenLast && i === lastIdx && (item.kind === 'thinking' && !!item.live)}
        />
      ))}
    </div>
  )
}
