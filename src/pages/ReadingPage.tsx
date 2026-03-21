import { useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useReadingStore } from '../stores/readingStore'
import { useSessionStore } from '../stores/sessionStore'
import ReaderView from '../components/reading/ReaderView'
import ReadingUpload from '../components/reading/ReadingUpload'

export default function ReadingPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const sections = useReadingStore(s => s.sections)
  const title = useReadingStore(s => s.title)
  const isLoadingContent = useReadingStore(s => s.isLoadingContent)
  const loadContent = useReadingStore(s => s.loadContent)
  const saveProgress = useReadingStore(s => s.saveProgress)
  const reset = useReadingStore(s => s.reset)

  const currentSession = useSessionStore(s => s.currentSession)
  const selectSession = useSessionStore(s => s.selectSession)

  // Load content on mount
  useEffect(() => {
    if (!sessionId) return
    // Select session in sessionStore if not already
    if (!currentSession || currentSession.id !== sessionId) {
      selectSession(sessionId)
    }
    loadContent(sessionId).catch(() => {
      // No content yet — show upload screen
    })

    return () => {
      // Save progress on unmount
      if (sessionId) saveProgress(sessionId)
    }
  }, [sessionId])

  // Save progress on page hide / beforeunload
  useEffect(() => {
    if (!sessionId) return

    const handleSave = () => saveProgress(sessionId)
    window.addEventListener('beforeunload', handleSave)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleSave()
    })

    return () => {
      window.removeEventListener('beforeunload', handleSave)
    }
  }, [sessionId, saveProgress])

  // Cleanup on session change
  useEffect(() => {
    return () => reset()
  }, [sessionId])

  const handleBack = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleUploaded = useCallback(() => {
    // Content is now loaded in readingStore via uploadContent
  }, [])

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#faf9f7' }}>
        <p style={{ color: '#8a95aa' }}>无效的会话</p>
      </div>
    )
  }

  const hasContent = sections.length > 0

  return (
    <div className="flex flex-col h-screen" style={{ background: '#faf9f7' }}>
      {/* Header */}
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
          <span style={{ fontSize: 14, color: '#002FA7', opacity: 0.5 }}>✦</span>
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

      {/* Main content */}
      {isLoadingContent ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#002FA7', borderTopColor: 'transparent' }}
          />
          <p style={{ color: '#8a95aa', fontSize: '0.85rem' }}>加载中…</p>
        </div>
      ) : hasContent ? (
        <ReaderView sessionId={sessionId} />
      ) : (
        <ReadingUpload sessionId={sessionId} onUploaded={handleUploaded} />
      )}
    </div>
  )
}
