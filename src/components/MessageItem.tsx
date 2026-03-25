import { memo, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronRight, Copy, Trash2, Check, RotateCcw, Brain, FileText, File as FileIcon } from 'lucide-react'
import type { ChatMessage, MessageAttachment, MemoryOperation } from '../api/chat'
import ContextDebugPanel from './ContextDebugPanel'

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
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer" style={{ color: '#5a6a8a' }}>
        {isActive ? <span className="tool-spinner" /> : <span style={{ fontSize: 11 }}>◎</span>}
        <span className="text-xs font-medium">
          Memory search「{query}」{found != null && ` · found ${found}`}
          {elapsed != null && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {!isActive && (open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />)}
      </button>
      {open && content && (
        <p className="px-3.5 pb-2.5 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#8a9ab5' }}>
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
  const colors: Record<string, string> = { saved: '#5a6a8a', updated: '#5a6a8a', deleted: '#c05050' }
  return (
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer" style={{ color: '#5a6a8a' }}>
        <span style={{ fontSize: 11 }}>◑</span>
        <span className="text-xs font-medium">
          Memory ops · {ops.length}
          {elapsed != null && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(elapsed)})</span>}
        </span>
        {open ? <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={12} strokeWidth={2} style={{ marginLeft: 'auto' }} />}
      </button>
      {open && (
        <div className="px-3.5 pb-2.5 space-y-1.5">
          {ops.map((op, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: '#5a6a8a' }}>
              <span className="flex-shrink-0" style={{ color: colors[op.type], fontSize: 10 }}>
                {symbols[op.type]} {labels[op.type]}
              </span>
              <span className="leading-relaxed" style={{ color: '#8a9ab5' }}>
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
    <div className="mb-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,47,167,0.05)' }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left cursor-pointer" style={{ color: '#5a6a8a' }}>
        <span style={{ fontSize: 11 }}>⊘</span>
        <span className="text-xs font-medium">
          Thinking
          {thinkingTime != null && thinkingTime > 0 && <span style={{ color: '#8a9ab5', marginLeft: 4 }}>({formatElapsed(thinkingTime)})</span>}
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
              style={{ background: '#f0f2f8', border: '1px solid #e2e6f0' }}
            >
              {att.file_type === 'pdf' ? (
                <FileText size={14} style={{ color: '#e74c3c', flexShrink: 0 }} />
              ) : (
                <FileIcon size={14} style={{ color: '#7a8399', flexShrink: 0 }} />
              )}
              <span className="text-xs" style={{ color: '#5a6a8a' }}>
                {att.original_filename}
              </span>
              <span className="text-xs" style={{ color: '#aab2c8' }}>
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
import { parseArtifacts } from './artifact/parseArtifacts'
import ArtifactCard from './artifact/ArtifactCard'

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const { artifacts, cleanContent } = parseArtifacts(content)

  if (artifacts.length === 0) {
    return (
      <div className="md-content">
        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
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
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{part}</ReactMarkdown>
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
    <img src={src} alt="D" className="flex-shrink-0 rounded-full object-cover" style={{ width: 28, height: 28 }} />
  ) : (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-semibold select-none"
      style={{ width: 28, height: 28, background: '#eef1f8', color: '#002FA7' }}
    >
      D
    </div>
  )
}

function AiAvatar() {
  useSyncExternalStore(subscribeAvatar, getAvatarSnapshot)
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

// ─── Main MessageItem ────────────────────────────────────────────────────────

interface MessageItemProps {
  msg: ChatMessage
  isDebugOpen: boolean
  isCopied: boolean
  onToggleDebug: () => void
  onCopy: (id: string, content: string) => void
  onDelete: (conversationId: string) => void
  onRetry: (id: string) => void
}

const MessageItem = memo(function MessageItem({ msg, isDebugOpen, isCopied, onToggleDebug, onCopy, onDelete, onRetry }: MessageItemProps) {
  return (
    <div className="flex gap-3 mb-6 msg-fade-in">
      {msg.role === 'user' ? <UserAvatar /> : <AiAvatar />}
      <div className="flex-1 min-w-0 pt-0.5">
        {msg.role === 'assistant' && (msg.thinking || msg.thinking_summary) && (
          <ThinkingBlock text={(msg.thinking ?? msg.thinking_summary)!} thinkingTime={msg.thinkingTime} />
        )}
        {msg.role === 'assistant' && msg.memoryRef && (
          <MemoryRefBlock query={msg.memoryRef.query} found={msg.memoryRef.found} content={msg.memoryRef.content} />
        )}
        {msg.role === 'assistant' && msg.memoryOps && msg.memoryOps.length > 0 && (
          <MemoryOpsBlock ops={msg.memoryOps} />
        )}
        {msg.role === 'assistant' ? (
          <MarkdownContent content={msg.content} />
        ) : (
          <>
            {msg.attachments && msg.attachments.length > 0 && (
              <AttachmentsBlock attachments={msg.attachments} />
            )}
            <p className="text-sm leading-7 whitespace-pre-wrap" style={{ color: '#1a1f2e' }}>
              {msg.content}
            </p>
          </>
        )}
        {/* Action row */}
        <div className="flex items-center justify-between mt-1.5" style={{ minHeight: 24 }}>
          {msg.role === 'assistant' ? (
            <>
              <span className="flex items-center gap-1 text-xs" style={{ color: '#9aa3b8', fontSize: 12 }}>
                {formatMsgTime(msg.created_at)}
                {msg.tokens && (
                  <>
                    <span style={{ margin: '0 2px' }}>·</span>
                    <span>⏱</span>
                    <span>{msg.tokens.input.toLocaleString()} in</span>
                    <span style={{ margin: '0 2px' }}>·</span>
                    <span>{msg.tokens.output.toLocaleString()} out</span>
                  </>
                )}
              </span>
              <div className="flex items-center gap-2">
                {msg.debugInfo && (
                  <button onClick={onToggleDebug} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: isDebugOpen ? '#002FA7' : '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#002FA7')} onMouseLeave={e => { if (!isDebugOpen) e.currentTarget.style.color = '#c0c8d8' }} title="上下文详情">
                    <Brain size={14} strokeWidth={1.8} />
                  </button>
                )}
                <button onClick={() => onCopy(msg.id, msg.content)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: isCopied ? '#22c55e' : '#c0c8d8' }} title="复制">
                  {isCopied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.8} />}
                </button>
                {msg.conversationId && (
                  <button onClick={() => onDelete(msg.conversationId!)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')} title="删除">
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                )}
                <button onClick={() => onRetry(msg.id)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#002FA7')} onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')} title="重发">
                  <RotateCcw size={14} strokeWidth={1.8} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => onCopy(msg.id, msg.content)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: isCopied ? '#22c55e' : '#c0c8d8' }} title="复制">
                  {isCopied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.8} />}
                </button>
                {msg.conversationId && (
                  <button onClick={() => onDelete(msg.conversationId!)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')} title="删除">
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                )}
                <button onClick={() => onRetry(msg.id)} className="flex items-center justify-center transition-colors cursor-pointer" style={{ color: '#c0c8d8' }} onMouseEnter={e => (e.currentTarget.style.color = '#002FA7')} onMouseLeave={e => (e.currentTarget.style.color = '#c0c8d8')} title="重发">
                  <RotateCcw size={14} strokeWidth={1.8} />
                </button>
              </div>
              <span className="text-xs" style={{ color: '#9aa3b8', fontSize: 12 }}>
                {formatMsgTime(msg.created_at)}
              </span>
            </>
          )}
        </div>
        {msg.role === 'assistant' && msg.debugInfo && isDebugOpen && (
          <ContextDebugPanel debugInfo={msg.debugInfo} />
        )}
      </div>
    </div>
  )
})

export default MessageItem
export { MarkdownContent, AiAvatar, UserAvatar }
