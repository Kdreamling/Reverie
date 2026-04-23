import { memo, useState, useCallback, useEffect, useRef as useReactRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Copy, Trash2, Check, RotateCcw, Brain, FileText, File as FileIcon, Search, BookOpen, Wrench, Sparkles } from 'lucide-react'
import type { ChatMessage, MessageAttachment, MemoryOperation, DevToolOp } from '../api/chat'
// ContextDebugPanel import removed (unused)
import { C } from '../theme'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (isToday) return time
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}/${day} ${time}`
}

function formatElapsed(seconds: number): string {
  return seconds.toFixed(1) + 's'
}

// ─── Sub-components (all memo'd) ─────────────────────────────────────────────

const ROOM_FONT = "'EB Garamond', 'Noto Serif SC', 'Cormorant Garamond', Georgia, serif"

const MemoryRefBlock = memo(function MemoryRefBlock({ query, found, content, elapsed }: { query: string; found: number; content: string; elapsed?: number | null }) {
  const [open, setOpen] = useState(false)
  const isActive = found === undefined || found === null
  return (
    <div className="mb-3" style={{ padding: '8px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderRadius: 12, border: '1px dashed rgba(196,154,120,0.22)', background: 'rgba(122,142,152,0.04)', cursor: 'pointer', maxWidth: '100%', minWidth: 0 }} onClick={() => setOpen(o => !o)}>
      {isActive ? <span className="tool-spinner" /> : <Search size={13} strokeWidth={1.8} style={{ color: C.memoryRefAccent, flexShrink: 0 }} />}
      <span style={{ fontSize: 11, color: C.memoryRefAccent, fontFamily: ROOM_FONT, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
        {query || 'Memory search'}{found != null && ` · ${found} found`}
        {elapsed != null && <span style={{ color: C.textMuted, marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
      </span>
      {!isActive && (open ? <ChevronDown size={10} strokeWidth={2} style={{ marginLeft: 4, color: C.textMuted }} /> : <ChevronRight size={10} strokeWidth={2} style={{ marginLeft: 4, color: C.textMuted }} />)}
      {open && content && (
        <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: C.textMuted, wordBreak: 'break-word', overflowWrap: 'anywhere', marginTop: 4, fontFamily: ROOM_FONT }}>
          {content || '（无内容）'}
        </p>
      )}
    </div>
  )
})

const MemoryOpsBlock = memo(function MemoryOpsBlock({ ops, elapsed }: { ops: MemoryOperation[]; elapsed?: number | null }) {
  const [open, setOpen] = useState(false)
  const symbols: Record<string, string> = { saved: '◉', updated: '◎', deleted: '⊗' }
  const labels: Record<string, string> = { saved: 'saved', updated: 'updated', deleted: 'deleted' }
  const colors: Record<string, string> = { saved: C.textSecondary, updated: C.textSecondary, deleted: '#c05050' }
  return (
    <div className="mb-3" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 14px', borderRadius: 12, border: '1px dashed rgba(196,154,120,0.22)', background: 'rgba(138,150,119,0.04)', cursor: 'pointer', maxWidth: '100%', minWidth: 0 }} onClick={() => setOpen(o => !o)}>
      <div className="flex items-center gap-2" style={{ color: C.memoryOpsAccent }}>
        <BookOpen size={13} strokeWidth={1.8} style={{ color: C.memoryOpsAccent, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontFamily: ROOM_FONT }}>
          Memory · {ops.length}
          {elapsed != null && <span style={{ color: C.textMuted, marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {open ? <ChevronDown size={10} strokeWidth={2} style={{ color: C.textMuted }} /> : <ChevronRight size={10} strokeWidth={2} style={{ color: C.textMuted }} />}
      </div>
      {open && (
        <div className="space-y-1.5 mt-1">
          {ops.map((op, i) => (
            <div key={i} className="flex items-start gap-2" style={{ fontSize: 11, color: C.textSecondary, fontFamily: ROOM_FONT }}>
              <span className="flex-shrink-0" style={{ color: colors[op.type], fontSize: 10 }}>
                {symbols[op.type]} {labels[op.type]}
              </span>
              <span className="leading-relaxed" style={{ color: C.textMuted }}>
                {op.type === 'deleted' ? `ID: ${op.memory_id?.slice(0, 8)}...` : (op.content || '（内容为空）')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

const DevToolItem = memo(function DevToolItem({ op }: { op: DevToolOp }) {
  const [showResult, setShowResult] = useState(false)
  const hasResult = !!(op.result && op.result.trim())
  const argsText = op.args ? op.args.trim() : ''
  const argsTruncated = argsText.length > 80 ? argsText.slice(0, 80) + '…' : argsText
  return (
    <div style={{ fontFamily: ROOM_FONT, fontSize: 11, color: C.textSecondary }}>
      <div
        className={hasResult ? 'flex items-start gap-2 cursor-pointer' : 'flex items-start gap-2'}
        onClick={e => { if (hasResult) { e.stopPropagation(); setShowResult(r => !r) } }}
      >
        <span style={{ color: C.accent, opacity: 0.7, flexShrink: 0, fontSize: 10 }}>
          {hasResult ? (showResult ? '▾' : '▸') : '·'}
        </span>
        <span className="flex-1 min-w-0" style={{ wordBreak: 'break-word' }}>
          <span style={{ color: C.textSecondary, fontWeight: 500 }}>{op.tool || '?'}</span>
          {argsText && (
            <span style={{ color: C.textMuted, marginLeft: 6 }}>
              ({argsTruncated})
            </span>
          )}
        </span>
      </div>
      {showResult && hasResult && (
        <pre
          className="whitespace-pre-wrap mt-1 ml-5"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 10.5,
            color: C.textMuted,
            background: 'rgba(196,154,120,0.05)',
            padding: '6px 10px',
            borderRadius: 6,
            maxHeight: 320,
            overflowY: 'auto',
            wordBreak: 'break-word',
          }}
          onClick={e => e.stopPropagation()}
        >
          {op.result}
        </pre>
      )}
    </div>
  )
})

const DevToolOpsBlock = memo(function DevToolOpsBlock({ ops }: { ops: DevToolOp[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="mb-3"
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '8px 14px', borderRadius: 12,
        border: '1px dashed rgba(196,154,120,0.22)',
        background: 'rgba(160,120,90,0.04)',
        cursor: 'pointer', maxWidth: '100%', minWidth: 0,
      }}
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center gap-2" style={{ color: C.toolsAccent }}>
        <Wrench size={13} strokeWidth={1.8} style={{ color: C.toolsAccent, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontFamily: ROOM_FONT }}>
          Tools · {ops.length}
        </span>
        {open ? <ChevronDown size={10} strokeWidth={2} style={{ color: C.textMuted }} /> : <ChevronRight size={10} strokeWidth={2} style={{ color: C.textMuted }} />}
      </div>
      {open && (
        <div className="mt-1" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ops.map((op, i) => <DevToolItem key={i} op={op} />)}
        </div>
      )}
    </div>
  )
})

const READABLE_FONT = "'Iowan Old Style', 'Charter', 'Palatino Linotype', 'Palatino', 'Noto Serif SC', Georgia, serif"

const ThinkingBlock = memo(function ThinkingBlock({ text, thinkingTime }: { text: string; thinkingTime?: number | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="mb-3"
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '8px 14px', borderRadius: 12,
        border: '1px dashed rgba(196,154,120,0.22)',
        background: 'rgba(139,130,148,0.04)',
        cursor: 'pointer', maxWidth: '100%', minWidth: 0,
      }}
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center gap-2" style={{ color: C.thinkingAccent }}>
        <Sparkles size={13} strokeWidth={1.8} style={{ color: C.thinkingAccent, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontFamily: ROOM_FONT }}>
          Thought{thinkingTime != null && thinkingTime > 0 ? ` · ${formatElapsed(thinkingTime)}` : ''}
        </span>
        {open ? <ChevronDown size={10} strokeWidth={2} style={{ color: C.textMuted, marginLeft: 'auto' }} /> : <ChevronRight size={10} strokeWidth={2} style={{ color: C.textMuted, marginLeft: 'auto' }} />}
      </div>
      {open && (
        <p
          className="whitespace-pre-wrap"
          style={{
            color: C.textSecondary,
            fontStyle: 'italic',
            fontFamily: READABLE_FONT,
            fontSize: 14,
            lineHeight: 1.85,
            marginTop: 4,
          }}
        >
          {text}
        </p>
      )}
    </div>
  )
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

const AttachmentsBlock = memo(function AttachmentsBlock({ attachments }: { attachments: MessageAttachment[] }) {
  return (
    <div className="flex gap-2 mb-2 flex-wrap">
      {attachments.map(att => (
        <div key={att.id}>
          {att.file_type === 'image' && att.preview ? (
            <img
              src={att.preview}
              alt={att.original_filename}
              className="rounded-lg object-cover"
              style={{ maxWidth: 200, maxHeight: 200 }}
            />
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: C.surfaceSolid, border: `1px solid ${C.border}` }}
            >
              {att.file_type === 'pdf' ? (
                <FileText size={14} style={{ color: '#e74c3c', flexShrink: 0 }} />
              ) : (
                <FileIcon size={14} style={{ color: C.textSecondary, flexShrink: 0 }} />
              )}
              <span className="text-xs" style={{ color: C.textSecondary }}>
                {att.original_filename}
              </span>
              <span className="text-xs" style={{ color: C.textMuted }}>
                {formatFileSize(att.file_size)}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
})

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { parseArtifacts } from './artifact/parseArtifacts'
import ArtifactCard from './artifact/ArtifactCard'

function CodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  const preRef = useReactRef<HTMLPreElement>(null)

  const handleCopy = useCallback(() => {
    const text = preRef.current?.textContent
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [])

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <pre ref={preRef} {...props}>
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="flex items-center justify-center rounded-md transition-opacity cursor-pointer"
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 28, height: 28,
          opacity: hovered || copied ? 1 : 0,
          background: 'rgba(180,150,120,0.18)',
          border: '1px solid rgba(180,150,120,0.2)',
          color: copied ? '#6B8E5A' : '#8A7A6A',
        }}
        title="复制代码"
      >
        {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.8} />}
      </button>
    </div>
  )
}

// ─── ChatImage: markdown img renderer with lightbox + load-in fade ──────────

function ChatImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { src, alt } = props
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!src) return null

  if (errored) {
    return (
      <span className="inline-block my-2 rounded-xl px-3 py-2 text-xs" style={{ border: `1px dashed ${C.borderStrong}`, color: C.textMuted, background: 'rgba(196,154,120,0.04)' }}>
        图片加载失败 · {alt || 'image'}
      </span>
    )
  }

  return (
    <>
      <span
        className="block my-3"
        style={{
          position: 'relative',
          borderRadius: 14,
          overflow: 'hidden',
          maxWidth: 'min(520px, 100%)',
          background: loaded ? 'transparent' : 'rgba(196,154,120,0.06)',
          border: loaded ? `1px solid ${C.border}` : `1px dashed ${C.borderStrong}`,
          cursor: 'zoom-in',
          transition: 'background 300ms ease, border-color 300ms ease',
        }}
        onClick={() => loaded && setOpen(true)}
      >
        {!loaded && (
          <span
            className="flex items-center justify-center"
            style={{ width: '100%', aspectRatio: '1 / 1', color: C.textMuted, fontSize: 11, letterSpacing: '0.12em', fontFamily: ROOM_FONT }}
          >
            <span className="tool-spinner" style={{ marginRight: 8 }} />
            载入中
          </span>
        )}
        <img
          src={src}
          alt={alt || ''}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{
            display: loaded ? 'block' : 'none',
            width: '100%',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      </span>
      {open && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(20,15,10,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'zoom-out',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <img
            src={src}
            alt={alt || ''}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 12px 48px rgba(0,0,0,0.4)' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  )
}

const mdComponents: Components = { pre: CodeBlock, img: ChatImage as Components['img'] }

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  // 将 HTML <br/> / <br> 替换为 Markdown 换行
  const normalized = content.replace(/<br\s*\/?>/gi, '\n')
  const { artifacts, cleanContent } = parseArtifacts(normalized)

  if (artifacts.length === 0) {
    return (
      <div className="md-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents}>{normalized}</ReactMarkdown>
      </div>
    )
  }

  // Split content by artifact placeholders and render inline
  const parts = cleanContent.split(/\{\{ARTIFACT_(\d+)\}\}/)
  return (
    <div>
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          // Text part
          return part.trim() ? (
            <div key={i} className="md-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents}>{part}</ReactMarkdown>
            </div>
          ) : null
        }
        // Artifact placeholder
        const artIndex = parseInt(part)
        const artifact = artifacts[artIndex]
        return artifact ? <ArtifactCard key={`art-${i}`} artifact={artifact} index={artIndex} /> : null
      })}
    </div>
  )
})

// 监听 localStorage 头像变化
let _avatarVersion = 0
function subscribeAvatar(cb: () => void) {
  const handler = () => { _avatarVersion++; cb() }
  window.addEventListener('avatar:changed', handler)
  window.addEventListener('storage', handler)
  return () => { window.removeEventListener('avatar:changed', handler); window.removeEventListener('storage', handler) }
}
function getAvatarSnapshot() { return _avatarVersion }

function UserAvatar() {
  useSyncExternalStore(subscribeAvatar, getAvatarSnapshot)
  const src = localStorage.getItem('avatar_dream')
  return src ? (
    <img src={src} alt="D" className="flex-shrink-0 rounded-full object-cover" style={{ width: 34, height: 34, boxShadow: '0 2px 8px rgba(180,160,130,0.15)' }} />
  ) : (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-semibold select-none"
      style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #E8DDD0, #D4C8B8)', color: '#6B5D50' }}
    >
      D
    </div>
  )
}

function AiAvatar() {
  useSyncExternalStore(subscribeAvatar, getAvatarSnapshot)
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

// ─── Main MessageItem ────────────────────────────────────────────────────────

interface MessageItemProps {
  msg: ChatMessage
  modelLabel?: string
  isDebugOpen: boolean
  isCopied: boolean
  onToggleDebug: () => void
  onCopy: (id: string, content: string) => void
  onDelete: (conversationId: string) => void
  onRetry: (id: string) => void
}

const MessageItem = memo(function MessageItem({ msg, modelLabel, isDebugOpen, isCopied, onToggleDebug, onCopy, onDelete, onRetry }: MessageItemProps) {
  if (msg.role === 'user') {
    // 用户消息：右侧轻气泡（书页旁注风格）
    return (
      <div className="room-msg-group flex justify-end mb-10 room-msg-enter-right" style={{ paddingLeft: 'clamp(40px, 12vw, 120px)' }}>
        <div style={{ maxWidth: 'min(85%, 480px)', minWidth: 0 }}>
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex justify-end mb-2">
              <AttachmentsBlock attachments={msg.attachments} />
            </div>
          )}
          <div
            className="whitespace-pre-wrap user-bubble"
            style={{
              padding: '14px 20px',
              borderRadius: '20px 20px 4px 20px',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              fontSize: 14.5,
              lineHeight: 1.75,
              overflowWrap: 'break-word',
              wordBreak: 'normal',
            }}
          >
            {msg.content}
          </div>
          <div className="flex items-center justify-end gap-2 mt-1.5 pr-1">
            {msg.silentRead && (
              <span style={{ fontSize: 10, color: C.textMuted, fontStyle: 'italic' }}>已读</span>
            )}
            <span style={{ fontSize: 11, color: C.textMuted }}>{formatMsgTime(msg.created_at)}</span>
            <div className="room-msg-actions flex gap-1">
              <button onClick={() => onCopy(msg.id, msg.content)} className="p-1 cursor-pointer transition-colors" style={{ color: isCopied ? C.success : C.btnDefault }} title="复制">
                {isCopied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.8} />}
              </button>
              {msg.conversationId && (
                <button onClick={() => onDelete(msg.conversationId!)} className="p-1 cursor-pointer transition-colors" style={{ color: C.btnDefault }} onMouseEnter={e => (e.currentTarget.style.color = C.btnDanger)} onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)} title="删除">
                  <Trash2 size={12} strokeWidth={1.8} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // AI 消息：书页段落风格
  const isKeepalive = msg.source === 'keepalive'
  return (
    <div className="room-msg-group mb-10 room-msg-enter" style={isKeepalive ? { opacity: 0.75 } : undefined}>
      {/* Meta line */}
      <div className="flex items-center gap-2 mb-3">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, opacity: 0.6, flexShrink: 0 }} />
        <span style={{ fontFamily: "'EB Garamond', 'Noto Serif SC', serif", fontSize: 13, fontWeight: 500, color: C.accent, letterSpacing: '0.06em' }}>
          Claude
        </span>
        {isKeepalive && (
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 6, background: `${C.accent}18`, color: C.accent, fontWeight: 600, letterSpacing: '0.04em' }}>keepalive</span>
        )}
        <span style={{ fontSize: 11, color: C.textMuted }}>{formatMsgTime(msg.created_at)}</span>
      </div>

      {/* Thinking — margin note style */}
      {(msg.thinking || msg.thinking_summary) && (
        <ThinkingBlock text={(msg.thinking ?? msg.thinking_summary)!} thinkingTime={msg.thinkingTime} />
      )}

      {/* Memory refs */}
      {msg.memoryRefs && msg.memoryRefs.length > 0 ? (
        msg.memoryRefs.map((ref, i) => (
          <MemoryRefBlock key={i} query={ref.query} found={ref.found} content={ref.content} />
        ))
      ) : msg.memoryRef ? (
        <MemoryRefBlock query={msg.memoryRef.query} found={msg.memoryRef.found} content={msg.memoryRef.content} />
      ) : null}
      {msg.memoryOps && msg.memoryOps.length > 0 && (
        <MemoryOpsBlock ops={msg.memoryOps} />
      )}
      {msg.devToolOps && msg.devToolOps.length > 0 && (
        <DevToolOpsBlock ops={msg.devToolOps} />
      )}

      {/* Body — serif book paragraph */}
      <div style={{
        fontFamily: "'EB Garamond', 'Noto Serif SC', 'Cormorant Garamond', Georgia, serif",
        fontSize: 16.5,
        lineHeight: 2,
        color: C.text,
        letterSpacing: '0.01em',
      }}>
        <MarkdownContent content={msg.content} />
      </div>

      {/* Action row — only on hover */}
      <div className="room-msg-actions flex items-center justify-between mt-2" style={{ minHeight: 20 }}>
        <span className="flex items-center gap-1" style={{ fontSize: 11, color: C.metaText }}>
          {msg.tokens && (
            <>
              <span>{msg.tokens.input.toLocaleString()} tokens</span>
              {(msg.tokens.cached ?? 0) > 0 && (
                <>
                  <span style={{ margin: '0 2px' }}>·</span>
                  <span style={{ color: C.accentWarm, fontWeight: 500 }}>cache {(msg.tokens.cached ?? 0).toLocaleString()}</span>
                </>
              )}
            </>
          )}
        </span>
        <div className="flex items-center gap-1">
          {msg.debugInfo && (
            <button onClick={onToggleDebug} className="p-1 cursor-pointer transition-colors" style={{ color: isDebugOpen ? C.accent : C.btnDefault }} title="上下文详情">
              <Brain size={13} strokeWidth={1.8} />
            </button>
          )}
          <button onClick={() => onCopy(msg.id, msg.content)} className="p-1 cursor-pointer transition-colors" style={{ color: isCopied ? C.success : C.btnDefault }} title="复制">
            {isCopied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.8} />}
          </button>
          <button onClick={() => onRetry(msg.id)} className="p-1 cursor-pointer transition-colors" style={{ color: C.btnDefault }} onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)} title="重发">
            <RotateCcw size={13} strokeWidth={1.8} />
          </button>
          {msg.conversationId && (
            <button onClick={() => onDelete(msg.conversationId!)} className="p-1 cursor-pointer transition-colors" style={{ color: C.btnDefault }} onMouseEnter={e => (e.currentTarget.style.color = C.btnDanger)} onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)} title="删除">
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

export default MessageItem
export { MarkdownContent, AiAvatar, UserAvatar, ChatImage }
