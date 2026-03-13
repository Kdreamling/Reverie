import { useState } from 'react'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { client } from '../api/client'
import { useSessionStore } from '../stores/sessionStore'

interface DebugContextResponse {
  session_id: string
  model_channel: string
  system_prompt: string
  token_estimate: number
}

interface Props {
  onBack: () => void
}

export default function DebugPanel({ onBack }: Props) {
  const currentSession = useSessionStore(s => s.currentSession)
  const [data, setData] = useState<DebugContextResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const model = currentSession?.model ?? 'deepseek-chat'

  async function fetchContext() {
    if (!currentSession) {
      setError('请先选择一个会话')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await client.get<DebugContextResponse>(
        `/debug/context?session_id=${currentSession.id}&model=${encodeURIComponent(model)}`
      )
      setData(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="absolute inset-0 flex flex-col z-10"
      style={{ background: '#0a1a3a', color: '#c8d4e8' }}
    >
      {/* Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-4 w-full text-left transition-colors duration-150 cursor-pointer"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#c8d4e8' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <ChevronLeft size={16} strokeWidth={1.8} />
        <span className="text-sm font-medium select-none" style={{ letterSpacing: '0.05em' }}>
          Context Debug
        </span>
      </button>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {/* Session info */}
        <div className="text-xs" style={{ color: 'rgba(200,212,232,0.5)' }}>
          {currentSession
            ? <>会话：{currentSession.title || '未命名'} &nbsp;·&nbsp; 模型：{model}</>
            : '未选择会话'}
        </div>

        {/* Fetch button */}
        <button
          onClick={fetchContext}
          disabled={loading || !currentSession}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#002FA7', color: '#fff' }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#0038cc' }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#002FA7' }}
        >
          <RefreshCw size={14} strokeWidth={1.8} className={loading ? 'animate-spin' : ''} />
          {loading ? '加载中…' : '查看当前注入的 Context'}
        </button>

        {error && (
          <p className="text-xs px-1" style={{ color: '#e88' }}>{error}</p>
        )}

        {data && (
          <>
            {/* Stats */}
            <div className="flex gap-3 text-xs" style={{ color: 'rgba(200,212,232,0.6)' }}>
              <span>通道：<span style={{ color: '#7cb9ff' }}>{data.model_channel}</span></span>
              <span>预估 tokens：<span style={{ color: '#7cb9ff' }}>{data.token_estimate}</span></span>
            </div>

            {/* System prompt content */}
            <div
              className="flex-1 rounded-lg p-3 text-xs whitespace-pre-wrap overflow-y-auto"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: '#c8d4e8',
                lineHeight: '1.6',
                maxHeight: '60vh',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {data.system_prompt || '（无内容）'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
