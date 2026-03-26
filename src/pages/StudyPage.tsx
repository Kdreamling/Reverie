import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUp, BookOpen, Upload, Loader2 } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { generateTestPrompt } from '../api/study'
import { uploadAttachment } from '../api/attachments'
import type { MessageAttachment } from '../api/chat'
import MessageItem from '../components/MessageItem'
import StreamingMessage from '../components/StreamingMessage'

const QUESTION_TYPES = [
  { key: 'choice', label: '选择题', icon: '🔤' },
  { key: 'fill', label: '填空题', icon: '✏️' },
  { key: 'reading', label: '阅读理解', icon: '📖' },
  { key: 'translation', label: '翻译题', icon: '🔄' },
]

const COUNT_OPTIONS = [5, 10, 15, 20]

const MODELS = [
  { value: 'deepseek-chat', label: 'DeepSeek' },
  { value: '[0.1]claude-opus-4-6-thinking', label: 'Claude Opus' },
]

const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/gif,image/webp'
const MAX_FILE_SIZE = 5 * 1024 * 1024

export default function StudyPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const { currentSession, selectSession } = useSessionStore()
  const { messages, isStreaming, loadMessages, sendMessage, clearMessages, stopStreaming } = useChatStore()

  // Setup state
  const [step, setStep] = useState<'setup' | 'studying'>('setup')
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['choice'])
  const [count, setCount] = useState(10)
  const [includeErrors, setIncludeErrors] = useState(true)
  const [model, setModel] = useState(MODELS[0].value)
  const [generating, setGenerating] = useState(false)

  // Chat state
  const [input, setInput] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [debugOpenMsgId, setDebugOpenMsgId] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load session
  useEffect(() => {
    if (sessionId) {
      if (!currentSession || currentSession.id !== sessionId) {
        selectSession(sessionId)
      }
      loadMessages(sessionId)
    }
    return () => clearMessages()
  }, [sessionId])

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  // Auto resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '22px'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [input])

  const toggleType = (key: string) => {
    setSelectedTypes(prev =>
      prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
    )
  }

  const handleGenerate = async () => {
    if (!sessionId || selectedTypes.length === 0) return
    setGenerating(true)
    try {
      const { prompt } = await generateTestPrompt({
        question_types: selectedTypes,
        count,
        include_errors: includeErrors,
      })
      setStep('studying')
      await sendMessage(sessionId, model, prompt)
    } catch (e) {
      console.error('Failed:', e)
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = async () => {
    if (!sessionId || !input.trim() || isStreaming) return
    const text = input.trim()
    setInput('')
    await sendMessage(sessionId, model, text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionId || !token) return
    if (file.size > MAX_FILE_SIZE) return

    setIsUploading(true)
    try {
      const info = await uploadAttachment(file, sessionId)
      const gradePrompt = '请根据我上传的手写答案进行批改。逐题标注对错，错误的给出正确答案和详细讲解（用中文），最后给出总分和鼓励。'

      const attachments: MessageAttachment[] = [{
        id: info.id,
        original_filename: info.original_filename,
        file_type: info.file_type,
        mime_type: info.mime_type || '',
        file_size: info.file_size,
        preview: info.file_type === 'image' ? URL.createObjectURL(file) : undefined,
      }]

      await sendMessage(sessionId, model, gradePrompt, { attachments, attachmentIds: [info.id] })
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedMsgId(id)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopiedMsgId(null), 2000)
  }, [])

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#fafbfd' }}>
        <p style={{ color: '#8a95aa' }}>无效的会话</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: '#fafbfd' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid #e8ecf5', background: 'rgba(250,251,253,0.95)', backdropFilter: 'blur(10px)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{ color: '#8a95aa' }}
        >
          <ArrowLeft size={18} />
        </button>
        <BookOpen size={18} style={{ color: '#002FA7' }} />
        <span className="text-sm font-medium" style={{ color: '#1a1f2e' }}>英语练习</span>

        {step === 'studying' && (
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="ml-auto text-xs rounded-lg px-2 py-1 cursor-pointer"
            style={{ border: '1px solid #e8ecf5', color: '#5a6a8a', background: '#fff' }}
          >
            {MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        )}
      </div>

      {step === 'setup' ? (
        /* ── Setup Panel ── */
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <span style={{ fontSize: 40 }}>📝</span>
              <h2 className="text-lg font-semibold mt-3" style={{ color: '#1a1f2e' }}>开始英语练习</h2>
              <p className="text-sm mt-1" style={{ color: '#9aa3b8' }}>选择题型和数量，AI 会为你出题</p>
            </div>

            {/* 题型 */}
            <p className="text-xs font-medium mb-2" style={{ color: '#5a6a8a' }}>题型</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {QUESTION_TYPES.map(qt => {
                const selected = selectedTypes.includes(qt.key)
                return (
                  <button
                    key={qt.key}
                    onClick={() => toggleType(qt.key)}
                    className="flex items-center gap-2 px-3 py-3 rounded-xl text-sm transition-all cursor-pointer"
                    style={{
                      background: selected ? 'rgba(0,47,167,0.08)' : '#fff',
                      border: selected ? '1.5px solid rgba(0,47,167,0.3)' : '1px solid #e8ecf5',
                      color: selected ? '#002FA7' : '#7a8399',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{qt.icon}</span>
                    <span className="font-medium">{qt.label}</span>
                  </button>
                )
              })}
            </div>

            {/* 数量 */}
            <p className="text-xs font-medium mb-2" style={{ color: '#5a6a8a' }}>数量</p>
            <div className="flex gap-2 mb-5">
              {COUNT_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                  style={{
                    background: count === n ? '#002FA7' : '#fff',
                    color: count === n ? '#fff' : '#7a8399',
                    border: count === n ? '1px solid #002FA7' : '1px solid #e8ecf5',
                  }}
                >
                  {n}题
                </button>
              ))}
            </div>

            {/* 模型 */}
            <p className="text-xs font-medium mb-2" style={{ color: '#5a6a8a' }}>模型</p>
            <div className="flex gap-2 mb-5">
              {MODELS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setModel(m.value)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                  style={{
                    background: model === m.value ? '#002FA7' : '#fff',
                    color: model === m.value ? '#fff' : '#7a8399',
                    border: model === m.value ? '1px solid #002FA7' : '1px solid #e8ecf5',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* 错题 */}
            <label className="flex items-center gap-2 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={includeErrors}
                onChange={e => setIncludeErrors(e.target.checked)}
                style={{ accentColor: '#002FA7' }}
              />
              <span className="text-sm" style={{ color: '#5a6a8a' }}>融入错题本知识点</span>
            </label>

            {/* 开始 */}
            <button
              onClick={handleGenerate}
              disabled={selectedTypes.length === 0 || generating}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-50"
              style={{ background: '#002FA7', color: '#fff' }}
            >
              {generating ? '出题中...' : '开始出题'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Study Chat Area ── */
        <>
          <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-6" style={{ overscrollBehavior: 'contain' }}>
            <div className="max-w-2xl mx-auto">
              {messages.map(msg => (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  isDebugOpen={debugOpenMsgId === msg.id}
                  isCopied={copiedMsgId === msg.id}
                  onToggleDebug={() => setDebugOpenMsgId(prev => prev === msg.id ? null : msg.id)}
                  onCopy={handleCopy}
                  onDelete={() => {}}
                  onRetry={() => {}}
                />
              ))}
              <StreamingMessage />
            </div>
          </div>

          {/* Input bar */}
          <div className="shrink-0 px-4 pb-4 pt-2">
            <div className="max-w-2xl mx-auto">
              <div
                className={`flex gap-3 px-4 transition-all duration-200 ${isFocused || input ? 'rounded-2xl items-end py-3' : 'rounded-full items-center py-2.5'}`}
                style={{ background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.07)' }}
              >
                {/* Upload photo button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || isUploading}
                  className="flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30"
                  style={{ width: 30, height: 30, color: '#7a8399' }}
                  title="上传答题照片"
                >
                  {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={1.8} />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  className="hidden"
                  onChange={handleUploadPhoto}
                />

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  disabled={isStreaming}
                  placeholder="输入答案或提问..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed disabled:opacity-40"
                  style={{ color: '#1a1f2e', minHeight: 22, maxHeight: 150 }}
                />

                <button
                  onClick={isStreaming ? stopStreaming : handleSend}
                  disabled={!isStreaming && !input.trim()}
                  className="flex-shrink-0 flex items-center justify-center rounded-full transition-all cursor-pointer disabled:cursor-not-allowed"
                  style={{
                    width: 30, height: 30,
                    background: isStreaming ? '#1a1f2e' : input.trim() ? '#002FA7' : '#e8ecf5',
                    color: isStreaming || input.trim() ? '#fff' : '#aab2c8',
                  }}
                >
                  <ArrowUp size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
