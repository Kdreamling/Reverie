import { memo, useRef, useEffect, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useChatStore, type StreamBlock } from '../stores/chatStore'
import type { MemoryOperation } from '../api/chat'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'

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

// ─── Streaming text: update DOM directly via ref, render markdown only when idle

function StreamingTextBlock({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastLenRef = useRef(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [renderMarkdown, setRenderMarkdown] = useState(false)

  useEffect(() => {
    // If text grew by a small delta, update DOM directly (skip React re-render of markdown)
    if (!renderMarkdown && containerRef.current) {
      containerRef.current.textContent = text
    }
    lastLenRef.current = text.length

    // Debounce: render markdown after 300ms of no updates
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      setRenderMarkdown(true)
    }, 300)

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [text, renderMarkdown])

  // Reset renderMarkdown when text changes after markdown was rendered
  useEffect(() => {
    if (renderMarkdown) {
      // If text keeps changing, switch back to plain text mode
      const timer = setTimeout(() => {}, 0)
      return () => clearTimeout(timer)
    }
  }, [text, renderMarkdown])

  if (renderMarkdown) {
    return (
      <div className="md-content">
        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
          {text}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="text-sm leading-7 whitespace-pre-wrap"
      style={{ color: '#1a1f2e' }}
    />
  )
}

// ─── Live thinking block with elapsed timer

function LiveThinkingBlock({ text, startTime, elapsed }: { text: string; startTime: number; elapsed: number | null }) {
  const [open, setOpen] = useState(true)
  const isActive = elapsed === null
  const liveElapsed = useElapsedTimer(isActive ? startTime : null)
  const displayTime = elapsed ?? liveElapsed

  return (
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer" style={{ color: '#5a6a8a' }}>
        {isActive ? <span className="tool-spinner" /> : <span style={{ fontSize: 11 }}>⊘</span>}
        <span className="text-xs font-medium">
          Thinking
          {displayTime != null && displayTime > 0 && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(displayTime)})</span>}
        </span>
        {open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />}
      </button>
      {open && (
        <p className="px-3.5 pb-2.5 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#8a9ab5' }}>
          {text}
        </p>
      )}
    </div>
  )
}

// ─── Live tool searching block

function LiveToolSearchBlock({ query, startTime }: { query: string; startTime: number }) {
  const liveElapsed = useElapsedTimer(startTime)
  return (
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
      <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ color: '#5a6a8a' }}>
        <span className="tool-spinner" />
        <span className="text-xs font-medium">
          Memory search{query ? `「${query}」` : ''}
          <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(liveElapsed)})</span>
        </span>
      </div>
    </div>
  )
}

// ─── Tool result block (collapsed)

function ToolResultBlock({ query, found, content, elapsed }: { query: string; found: number; content: string; elapsed: number | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer" style={{ color: '#5a6a8a' }}>
        <span style={{ fontSize: 11 }}>◎</span>
        <span className="text-xs font-medium">
          Memory search「{query}」 · found {found}
          {elapsed != null && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />}
      </button>
      {open && content && (
        <p className="px-3.5 pb-2.5 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#8a9ab5' }}>
          {content || '（无内容）'}
        </p>
      )}
    </div>
  )
}

// ─── Memory op block

function MemoryOpBlock({ op, elapsed }: { op: MemoryOperation; elapsed: number | null }) {
  return (
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
      <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ color: '#5a6a8a' }}>
        <span style={{ fontSize: 11 }}>{op.type === 'saved' ? '◉' : op.type === 'updated' ? '◎' : '⊗'}</span>
        <span className="text-xs font-medium">
          Memory {op.type}
          {elapsed != null && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
      </div>
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
    <img src={src} alt="✦" className="flex-shrink-0 rounded-full object-cover" style={{ width: 28, height: 28 }} />
  ) : (
    <div
      className="flex-shrink-0 flex items-center justify-center select-none"
      style={{ width: 28, height: 28, color: '#002FA7', fontSize: 16, lineHeight: 1 }}
    >
      ✦
    </div>
  )
}

// ─── Main StreamingMessage ───────────────────────────────────────────────────

export default function StreamingMessage() {
  const isStreaming = useChatStore(s => s.isStreaming)
  const streamBlocks = useChatStore(s => s.streamBlocks)

  if (!isStreaming || streamBlocks.length === 0) return null

  return (
    <div className="flex gap-3 mb-8">
      <AiAvatar />
      <div className="flex-1 min-w-0 pt-0.5">
        {streamBlocks.map((block, i) => (
          <StreamBlockRenderer key={`sb-${i}`} block={block} />
        ))}
      </div>
    </div>
  )
}
