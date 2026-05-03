import { memo, useEffect, useSyncExternalStore } from 'react'
import { useState } from 'react'
import { useChatStore, type StreamBlock } from '../stores/chatStore'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { C } from '../theme'
import { ChatImage } from './MessageItem'
import ProcessTrace, { type TraceItem } from './ProcessTrace'

const streamMdComponents: Components = { img: ChatImage as Components['img'] }

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

function blockToTraceItem(block: StreamBlock, idx: number): TraceItem | null {
  switch (block.kind) {
    case 'thinking':
      return {
        kind: 'thinking', id: `thinking-${idx}`,
        text: block.text, elapsed: block.elapsed,
        live: block.elapsed === null, startTime: block.startTime,
      }
    case 'tool_searching':
      return {
        kind: 'memory_search', id: `search-${idx}`,
        query: block.query, live: true, startTime: block.startTime,
      }
    case 'tool_result':
      return {
        kind: 'memory_search', id: `search-${idx}`,
        query: block.query, found: block.found, content: block.content,
        elapsed: block.elapsed, live: false,
      }
    case 'memory_op':
      return {
        kind: 'memory_op', id: `op-${idx}`,
        op: block.op, elapsed: block.elapsed,
      }
    default:
      return null
  }
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
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={streamMdComponents}>
          {displayText}
        </ReactMarkdown>
      </div>
      {hasPartialArtifact && <ArtifactGeneratingCard title={artifactTitle} />}
    </div>
  )
}

const ROOM_FONT = "'EB Garamond', 'Noto Serif SC', 'Cormorant Garamond', Georgia, serif"

// ─── Image generating placeholder (细线方框 · 呼吸点 · "绘制中") ──

function ImageGeneratingCard({ prompt, startTime }: { prompt: string; startTime: number }) {
  const liveElapsed = useElapsedTimer(startTime)
  return (
    <div
      className="my-3"
      style={{
        position: 'relative',
        maxWidth: 'min(420px, 100%)',
        aspectRatio: '1 / 1',
        borderRadius: 14,
        border: `1px dashed ${C.borderStrong}`,
        background: 'rgba(196,154,120,0.03)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
      }}
    >
      <span
        style={{
          fontFamily: ROOM_FONT,
          fontSize: 11,
          letterSpacing: '0.28em',
          color: C.textSecondary,
          textTransform: 'uppercase' as const,
        }}
      >
        绘制中
      </span>
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 4, height: 4, borderRadius: '50%',
              background: C.textMuted,
              animation: 'image-breath 1.6s ease-in-out infinite',
              animationDelay: `${i * 0.22}s`,
            }}
          />
        ))}
      </span>
      {prompt && (
        <span
          style={{
            fontFamily: ROOM_FONT,
            fontSize: 10.5,
            color: C.textMuted,
            maxWidth: '80%',
            textAlign: 'center' as const,
            lineHeight: 1.6,
            padding: '0 16px',
          }}
        >
          {prompt}
        </span>
      )}
      <span style={{ fontSize: 10, color: C.textFaint, fontFamily: ROOM_FONT, letterSpacing: '0.08em' }}>
        {formatElapsed(liveElapsed)}
      </span>
      <style>{`@keyframes image-breath { 0%, 100% { opacity: 0.2; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  )
}

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

function renderStreamBlocks(blocks: StreamBlock[]): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let traceBuffer: TraceItem[] = []
  let traceKey = 0

  const flushTrace = () => {
    if (traceBuffer.length > 0) {
      out.push(<ProcessTrace key={`trace-${traceKey}`} items={traceBuffer} defaultOpenLast />)
      traceBuffer = []
      traceKey += 1
    }
  }

  blocks.forEach((block, i) => {
    if (block.kind === 'text') {
      flushTrace()
      if (block.text) out.push(<StreamingTextBlock key={`text-${i}`} text={block.text} />)
    } else if (block.kind === 'tool_searching' && block.query.startsWith('绘制 · ')) {
      flushTrace()
      out.push(<ImageGeneratingCard key={`img-${i}`} prompt={block.query.slice('绘制 · '.length)} startTime={block.startTime} />)
    } else {
      const item = blockToTraceItem(block, i)
      if (item) traceBuffer.push(item)
    }
  })
  flushTrace()

  return out
}

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
        fontWeight: 500,
        lineHeight: 2,
        color: C.text,
        letterSpacing: '0.01em',
      }}>
        {renderStreamBlocks(streamBlocks)}
      </div>
    </div>
  )
}
