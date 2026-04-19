import { memo, useEffect, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useChatStore, type StreamBlock } from '../stores/chatStore'
import type { MemoryOperation } from '../api/chat'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { C } from '../theme'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  return seconds.toFixed(1) + 's'
}

function useElapsedTimer(startTime: number | null): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) { setElapsed(0); return }
    setElapsed((Date.now() - startTime) / 1000)
    const id = setInterval(() => setElapsed((Date.now() - startTime) / 1000), 100)
    return () => clearInterval(id)
  }, [startTime])
  return elapsed
}

// ─── Artifact streaming helpers ──────────────────────────────────────────────

/** Strip artifact blocks from streaming text and return clean text + whether an artifact is in progress */
function stripArtifacts(text: string): { clean: string; hasPartialArtifact: boolean; artifactTitle?: string } {
  let clean = text
  let hasPartialArtifact = false
  let artifactTitle: string | undefined

  // Loop: remove all complete <artifact...>...</artifact> blocks
  while (true) {
    const openIdx = clean.indexOf('<artifact')
    if (openIdx === -1) break

    const closeTag = '</artifact>'
    const closeIdx = clean.indexOf(closeTag, openIdx)
    if (closeIdx !== -1) {
      // Complete block — remove it entirely
      clean = clean.slice(0, openIdx) + clean.slice(closeIdx + closeTag.length)
    } else {
      // Partial block — no closing tag yet, strip from <artifact to end
      const fragment = clean.slice(openIdx)
      const titleMatch = fragment.match(/title="([^"]*)"/)
      artifactTitle = titleMatch?.[1]
      clean = clean.slice(0, openIdx)
      hasPartialArtifact = true
      break
    }
  }

  return { clean: clean.trim(), hasPartialArtifact, artifactTitle }
}

function ArtifactGeneratingCard({ title }: { title?: string }) {
  return (
    <div
      className="my-3 rounded-xl p-4"
      style={{ background: C.bg, border: `1px solid ${C.border}`, maxWidth: 400 }}
    >
      <div className="flex items-center gap-2">
        <span className="tool-spinner" />
        <span className="text-sm font-medium" style={{ color: C.textSecondary }}>
          {title ? `正在生成「${title}」...` : '正在生成 artifact...'}
        </span>
      </div>
    </div>
  )
}

// ─── Streaming text: real-time markdown rendering with incomplete syntax cleanup

/** Remove trailing incomplete markdown syntax to prevent flickering */
function cleanIncompleteMarkdown(text: string): string {
  let s = text
  // Trailing unclosed bold/italic: remove trailing *, **, ***, _ etc.
  s = s.replace(/(\*{1,3}|\_{1,3})(?=[^*_]*$)/, (match) => {
    // Only strip if it looks like an opening marker (preceded by space/start or after newline)
    const idx = s.lastIndexOf(match)
    if (idx >= 0) {
      const before = idx > 0 ? s[idx - 1] : ' '
      if (before === ' ' || before === '\n' || idx === 0) {
        return ''
      }
    }
    return match
  })
  // Trailing unclosed inline code
  const backtickCount = (s.match(/`/g) || []).length
  if (backtickCount % 2 !== 0) {
    const lastIdx = s.lastIndexOf('`')
    s = s.slice(0, lastIdx) + s.slice(lastIdx + 1)
  }
  return s
}

function StreamingTextBlock({ text }: { text: string }) {
  const { clean, hasPartialArtifact, artifactTitle } = stripArtifacts(text)
  const displayText = cleanIncompleteMarkdown(clean)

  return (
    <div>
      <div className="md-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {displayText}
        </ReactMarkdown>
      </div>
      {hasPartialArtifact && <ArtifactGeneratingCard title={artifactTitle} />}
    </div>
  )
}

const ROOM_FONT = "'EB Garamond', 'Noto Serif SC', 'Cormorant Garamond', Georgia, serif"
const READABLE_FONT = "'Iowan Old Style', 'Charter', 'Palatino Linotype', 'Palatino', 'Noto Serif SC', Georgia, serif"

// ─── Live thinking block with elapsed timer

function LiveThinkingBlock({ text, startTime, elapsed }: { text: string; startTime: number; elapsed: number | null }) {
  const [open, setOpen] = useState(true)
  const isActive = elapsed === null
  const liveElapsed = useElapsedTimer(isActive ? startTime : null)
  const displayTime = elapsed ?? liveElapsed

  return (
    <div className="mb-3 cursor-pointer" onClick={() => setOpen(o => !o)}
      style={{ padding: '12px 18px', borderLeft: '2px solid rgba(196,154,120,0.25)', fontFamily: READABLE_FONT, fontSize: 14.5, color: C.textMuted, lineHeight: 1.8 }}>
      <div className="flex items-center gap-2" style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: open ? 8 : 0 }}>
        {isActive ? <span className="tool-spinner" style={{ width: 10, height: 10 }} /> :
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(196,154,120,0.5)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
        thinking{displayTime != null && displayTime > 0 ? ` · ${formatElapsed(displayTime)}` : ''}
        {open ? <ChevronDown size={10} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={10} strokeWidth={2} style={{ marginLeft: 'auto' }} />}
      </div>
      {open && <p className="whitespace-pre-wrap" style={{ fontStyle: 'italic', fontFamily: READABLE_FONT, fontSize: 14.5, lineHeight: 1.85, color: C.textSecondary }}>{text}</p>}
    </div>
  )
}

// ─── Live tool searching block

function LiveToolSearchBlock({ query, startTime }: { query: string; startTime: number }) {
  const liveElapsed = useElapsedTimer(startTime)
  return (
    <div className="mb-3" style={{ padding: '8px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderRadius: 20, border: '1px dashed rgba(196,154,120,0.25)', background: 'rgba(196,154,120,0.04)', maxWidth: '100%', minWidth: 0 }}>
      <span className="tool-spinner" style={{ width: 10, height: 10, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: ROOM_FONT, overflowWrap: 'break-word', minWidth: 0 }}>
        {query || 'searching'} <span style={{ color: C.textMuted }}>({formatElapsed(liveElapsed)})</span>
      </span>
    </div>
  )
}

// ─── Tool result block (collapsed)

function ToolResultBlock({ query, found, content, elapsed }: { query: string; found: number; content: string; elapsed: number | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3 cursor-pointer" onClick={() => setOpen(o => !o)}
      style={{ display: 'flex', flexDirection: 'column' as const, padding: '8px 14px', borderRadius: 20, border: '1px dashed rgba(196,154,120,0.25)', background: 'rgba(196,154,120,0.04)', maxWidth: '100%', minWidth: 0 }}>
      <div className="flex items-center gap-2 flex-wrap" style={{ minWidth: 0 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.accent, opacity: 0.5, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: ROOM_FONT, overflowWrap: 'break-word', minWidth: 0, flex: '1 1 auto' }}>
          {query || 'search'} · {found} found
          {elapsed != null && <span style={{ color: C.textMuted, marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {open ? <ChevronDown size={9} strokeWidth={2} style={{ color: C.textMuted, flexShrink: 0 }} /> : <ChevronRight size={9} strokeWidth={2} style={{ color: C.textMuted, flexShrink: 0 }} />}
      </div>
      {open && content && <p className="text-xs leading-relaxed whitespace-pre-wrap mt-2" style={{ color: C.textMuted, fontFamily: ROOM_FONT, overflowWrap: 'break-word' }}>{content}</p>}
    </div>
  )
}

// ─── Memory op block

function MemoryOpBlock({ op, elapsed }: { op: MemoryOperation; elapsed: number | null }) {
  return (
    <div className="mb-3" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 20, border: '1px dashed rgba(196,154,120,0.2)', background: 'rgba(196,154,120,0.03)', maxWidth: '100%', minWidth: 0 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.accent, opacity: 0.4, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: ROOM_FONT, overflowWrap: 'break-word', minWidth: 0 }}>
        memory {op.type}
        {elapsed != null && <span style={{ color: C.textMuted, marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
      </span>
    </div>
  )
}

// ─── Individual block renderer (memo'd to prevent re-rendering stable blocks)

const StreamBlockRenderer = memo(function StreamBlockRenderer({ block }: { block: StreamBlock }) {
  switch (block.kind) {
    case 'thinking':
      return <LiveThinkingBlock text={block.text} startTime={block.startTime} elapsed={block.elapsed} />
    case 'text':
      return <StreamingTextBlock text={block.text} />
    case 'tool_searching':
      return <LiveToolSearchBlock query={block.query} startTime={block.startTime} />
    case 'tool_result':
      return <ToolResultBlock query={block.query} found={block.found} content={block.content} elapsed={block.elapsed} />
    case 'memory_op':
      return <MemoryOpBlock op={block.op} elapsed={block.elapsed} />
    default:
      return null
  }
})

// ─── AiAvatar (duplicated to avoid circular import)
let _avVer = 0
function _subAv(cb: () => void) {
  const h = () => { _avVer++; cb() }
  window.addEventListener('avatar:changed', h); window.addEventListener('storage', h)
  return () => { window.removeEventListener('avatar:changed', h); window.removeEventListener('storage', h) }
}
function _snapAv() { return _avVer }

function AiAvatar() {
  useSyncExternalStore(_subAv, _snapAv)
  const src = localStorage.getItem('avatar_claude')
  return src ? (
    <img src={src} alt="晨" className="flex-shrink-0 rounded-full object-cover" style={{ width: 34, height: 34, boxShadow: `0 2px 8px ${C.accent}25` }} />
  ) : (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full select-none"
      style={{ width: 34, height: 34, background: C.accentGradient, color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: '-0.02em' }}
    >
      Claude
    </div>
  )
}

// ─── Main StreamingMessage ───────────────────────────────────────────────────

export default function StreamingMessage() {
  const isStreaming = useChatStore(s => s.isStreaming)
  const streamBlocks = useChatStore(s => s.streamBlocks)

  if (!isStreaming || streamBlocks.length === 0) return null

  return (
    <div className="mb-10 room-msg-enter">
      {/* Meta line */}
      <div className="flex items-center gap-2 mb-3">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, opacity: 0.6, flexShrink: 0 }} />
        <span style={{ fontFamily: "'EB Garamond', 'Noto Serif SC', serif", fontSize: 13, fontWeight: 500, color: C.accent, letterSpacing: '0.06em' }}>
          Claude
        </span>
      </div>
      <div style={{
        fontFamily: "'EB Garamond', 'Noto Serif SC', 'Cormorant Garamond', Georgia, serif",
        fontSize: 16.5,
        lineHeight: 2,
        color: C.text,
        letterSpacing: '0.01em',
      }}>
        {streamBlocks.map((block, i) => (
          <StreamBlockRenderer key={`sb-${i}`} block={block} />
        ))}
      </div>
    </div>
  )
}
