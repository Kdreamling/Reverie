import { memo, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronRight, Copy, Trash2, Check, RotateCcw, Brain, FileText, File as FileIcon } from 'lucide-react'
import type { ChatMessage, MessageAttachment, MemoryOperation } from '../api/chat'
// ContextDebugPanel import removed (unused)
import { C } from '../theme'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${month}/${day} ${time}`
}

function formatElapsed(seconds: number): string {
  return seconds.toFixed(1) + 's'
}

// ─── Sub-components (all memo'd) ─────────────────────────────────────────────

const MemoryRefBlock = memo(function MemoryRefBlock({ query, found, content, elapsed }: { query: string; found: number; content: string; elapsed?: number | null }) {
  const [open, setOpen] = useState(false)
  const isActive = found === undefined || found === null
  return (
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: C.toolBg }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer" style={{ color: C.textSecondary, minWidth: 0 }}>
        {isActive ? <span className="tool-spinner" /> : <span style={{ fontSize: 11 }}>◎</span>}
        <span className="text-xs font-medium" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: 0 }}>
          {query || 'Memory search'}{found != null && ` · found ${found}`}
          {elapsed != null && <span style={{ color: C.textMuted, marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {!isActive && (open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />)}
      </button>
      {open && content && (
        <p className="px-3.5 pb-2.5 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: C.textMuted, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
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
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: C.toolBg }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer" style={{ color: C.textSecondary }}>
        <span style={{ fontSize: 11 }}>◑</span>
        <span className="text-xs font-medium">
          Memory ops · {ops.length}
          {elapsed != null && <span style={{ color: C.textMuted, marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />}
      </button>
      {open && (
        <div className="px-3.5 pb-2.5 space-y-1.5">
          {ops.map((op, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: C.textSecondary }}>
              <span className="flex-shrink-0" style={{ color: colors[op.type], fontSize: 10 }}>
                {symbols[op.type]} {labels[op.type]}
              </span>
              <span className="leading-relaxed" style={{ color: C.textMuted }}>
                {op.type === 'deleted' ? `ID: ${op.memory_id?.slice(0, 8)}... ${op.reason ? `(${op.reason})` : ''}` : (op.content || '（内容为空）')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

const ThinkingBlock = memo(function ThinkingBlock({ text, thinkingTime }: { text: string; thinkingTime?: number | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: C.thinkingBg, border: `1px solid ${C.border}` }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer" style={{ color: C.textMuted }}>
        <span style={{ fontSize: 11 }}>✦</span>
        <span className="text-xs font-medium">
          思考了
          {thinkingTime != null && thinkingTime > 0 && <span style={{ marginLeft: 4 }}>{formatElapsed(thinkingTime)}</span>}
        </span>
        {open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />}
      </button>
      {open && (
        <p className="px-3.5 pb-2.5 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: C.textSecondary, fontStyle: 'italic', borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 0 }}>
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
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { parseArtifacts } from './artifact/parseArtifacts'
import ArtifactCard from './artifact/ArtifactCard'

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  // 将 HTML <br/> / <br> 替换为 Markdown 换行
  const normalized = content.replace(/<br\s*\/?>/gi, '\n')
  const { artifacts, cleanContent } = parseArtifacts(normalized)

  if (artifacts.length === 0) {
    return (
      <div className="md-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{normalized}</ReactMarkdown>
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
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{part}</ReactMarkdown>
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
    // 用户消息：右对齐气泡
    return (
      <div className="flex gap-2.5 mb-6 flex-row-reverse msg-fade-in">
        <UserAvatar />
        <div className="flex flex-col items-end min-w-0" style={{ maxWidth: '78%' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs" style={{ color: C.metaText }}>{formatMsgTime(msg.created_at)}</span>
            <span className="text-sm font-semibold" style={{ color: C.text }}>Dream</span>
          </div>
          {msg.attachments && msg.attachments.length > 0 && (
            <AttachmentsBlock attachments={msg.attachments} />
          )}
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{
              padding: '11px 16px',
              borderRadius: '20px 20px 4px 20px',
              background: C.userBubble,
              border: `1px solid ${C.userBubbleBorder}`,
              color: C.text,
              boxShadow: '0 1px 6px rgba(180,160,130,0.08)',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            {msg.content}
          </div>
          <div className="flex gap-1.5 items-center mt-1.5">
            {msg.silentRead && (
              <span className="text-xs italic mr-1" style={{ color: C.textMuted, fontSize: 10 }}>已读</span>
            )}
            <button onClick={() => onCopy(msg.id, msg.content)} className="flex items-center justify-center transition-colors cursor-pointer p-1" style={{ color: isCopied ? C.success : C.btnDefault }} title="复制">
              {isCopied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.8} />}
            </button>
            {msg.conversationId && (
              <button onClick={() => onDelete(msg.conversationId!)} className="flex items-center justify-center transition-colors cursor-pointer p-1" style={{ color: C.btnDefault }} onMouseEnter={e => (e.currentTarget.style.color = C.btnDanger)} onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)} title="删除">
                <Trash2 size={13} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // AI 消息
  const isKeepalive = msg.source === 'keepalive'
  return (
    <div className="flex gap-2.5 mb-7 msg-fade-in" style={isKeepalive ? { opacity: 0.75 } : undefined}>
      <AiAvatar />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold" style={{ color: C.text }}>Claude</span>
          {isKeepalive && (
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 6, background: `${C.accent}18`, color: C.accent, fontWeight: 600, letterSpacing: '0.04em' }}>自由时间</span>
          )}
          {modelLabel && !isKeepalive && (
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 6, background: C.surface, color: C.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>{modelLabel}</span>
          )}
          <span className="text-xs" style={{ color: C.metaText }}>{formatMsgTime(msg.created_at)}</span>
        </div>
        {(msg.thinking || msg.thinking_summary) && (
          <ThinkingBlock text={(msg.thinking ?? msg.thinking_summary)!} thinkingTime={msg.thinkingTime} />
        )}
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
        <div style={{ fontSize: 15, color: C.text, lineHeight: 1.75 }}>
          <MarkdownContent content={msg.content} />
        </div>
        {/* Action row */}
        <div className="flex items-center justify-between mt-2.5" style={{ minHeight: 24 }}>
          <span className="flex items-center gap-1 text-xs" style={{ color: C.metaText, fontSize: 11 }}>
            {msg.tokens && (
              <>
                <span>{msg.tokens.input.toLocaleString()} tokens</span>
                {(msg.tokens.cached ?? 0) > 0 && (
                  <>
                    <span style={{ margin: '0 2px' }}>·</span>
                    <span style={{ color: C.accentWarm, fontWeight: 500 }}>✦ 缓存 {(msg.tokens.cached ?? 0).toLocaleString()}/{msg.tokens.input.toLocaleString()}</span>
                  </>
                )}
              </>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            {msg.debugInfo && (
              <button onClick={onToggleDebug} className="flex items-center justify-center transition-colors cursor-pointer p-1" style={{ color: isDebugOpen ? C.accent : C.btnDefault }} onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => { if (!isDebugOpen) e.currentTarget.style.color = C.btnDefault }} title="上下文详情">
                <Brain size={14} strokeWidth={1.8} />
              </button>
            )}
            <button onClick={() => onCopy(msg.id, msg.content)} className="flex items-center justify-center transition-colors cursor-pointer p-1" style={{ color: isCopied ? C.success : C.btnDefault }} title="复制">
              {isCopied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.8} />}
            </button>
            <button onClick={() => onRetry(msg.id)} className="flex items-center justify-center transition-colors cursor-pointer p-1" style={{ color: C.btnDefault }} onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)} title="重发">
              <RotateCcw size={14} strokeWidth={1.8} />
            </button>
            {msg.conversationId && (
              <button onClick={() => onDelete(msg.conversationId!)} className="flex items-center justify-center transition-colors cursor-pointer p-1" style={{ color: C.btnDefault }} onMouseEnter={e => (e.currentTarget.style.color = C.btnDanger)} onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)} title="删除">
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
        {/* ContextDebugPanel is now shown as a sheet overlay from ChatPage */}
      </div>
    </div>
  )
})

export default MessageItem
export { MarkdownContent, AiAvatar, UserAvatar }
