import { useEffect, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ApiError } from '../api/client'
import { useReadingStore } from '../stores/readingStore'
import { useSessionStore } from '../stores/sessionStore'
import ReaderView from '../components/reading/ReaderView'
import ReadingUpload from '../components/reading/ReadingUpload'

export default function ReadingPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [loadError, setLoadError] = useState<string | null>(null)
  const [missingContent, setMissingContent] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  const sections = useReadingStore(s => s.sections)
  const title = useReadingStore(s => s.title)
  const isLoadingContent = useReadingStore(s => s.isLoadingContent)
  const loadContent = useReadingStore(s => s.loadContent)
  const saveProgress = useReadingStore(s => s.saveProgress)
  const reset = useReadingStore(s => s.reset)

  const currentSession = useSessionStore(s => s.currentSession)
  const selectSession = useSessionStore(s => s.selectSession)

  useEffect(() => {
    if (!sessionId) return
    let isActive = true

    setLoadError(null)
    setMissingContent(false)

    if (!currentSession || currentSession.id !== sessionId) {
      selectSession(sessionId)
    }

    loadContent(sessionId).catch((error) => {
      if (!isActive) return

      if (error instanceof ApiError) {
        if (error.status === 401) {
          navigate('/login')
          return
        }
        if (error.status === 404) {
          setMissingContent(true)
          return
        }
        setLoadError(error.message)
        return
      }

      setLoadError(error instanceof Error ? error.message : '加载失败，请稍后重试')
    })

    return () => {
      isActive = false
      saveProgress(sessionId)
    }
  }, [sessionId, currentSession, selectSession, loadContent, saveProgress, navigate, reloadNonce])

  useEffect(() => {
    if (!sessionId) return

    const handleSave = () => saveProgress(sessionId)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleSave()
    }
    window.addEventListener('beforeunload', handleSave)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('beforeunload', handleSave)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [sessionId, saveProgress])

  useEffect(() => {
    return () => reset()
  }, [sessionId, reset])

  const handleBack = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleUploaded = useCallback(() => {
    setLoadError(null)
    setMissingContent(false)
  }, [])

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#faf9f7' }}>
        <p style={{ color: '#8a95aa' }}>无效的会话</p>
      </div>
    )
  }

  const hasContent = sections.length > 0 && !missingContent

  return (
    <div className="flex flex-col h-screen" style={{ background: '#faf9f7' }}>
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          background: 'rgba(250,249,247,0.95)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <button
          onClick={handleBack}
          className="p-1.5 rounded-lg transition-colors duration-150 cursor-pointer"
          style={{ color: '#8a95aa' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span style={{ fontSize: 14, color: '#002FA7', opacity: 0.5 }}>·</span>
          <span
            className="truncate"
            style={{
              fontSize: '0.9rem',
              color: '#5a6477',
              fontWeight: 500,
            }}
          >
            {title || '共读'}
          </span>
        </div>

        {hasContent && (
          <span style={{ fontSize: '0.75rem', color: '#a0aac0' }}>
            {sections.length} 段
          </span>
        )}
      </div>

      {isLoadingContent ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#002FA7', borderTopColor: 'transparent' }}
          />
          <p style={{ color: '#8a95aa', fontSize: '0.85rem' }}>加载中...</p>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6">
          <p style={{ color: '#8a95aa', fontSize: '0.9rem', textAlign: 'center', lineHeight: 1.7 }}>
            {loadError}
          </p>
          <button
            onClick={() => setReloadNonce(value => value + 1)}
            className="px-5 py-2 rounded-full text-sm font-medium cursor-pointer"
            style={{ background: '#002FA7', color: '#fff', border: 'none' }}
          >
            重试
          </button>
        </div>
      ) : hasContent ? (
        <ReaderView sessionId={sessionId} />
      ) : (
        <ReadingUpload sessionId={sessionId} onUploaded={handleUploaded} />
      )}
    </div>
  )
}
