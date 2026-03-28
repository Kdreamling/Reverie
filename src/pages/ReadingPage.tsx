import { useEffect, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ApiError } from '../api/client'
import { useReadingStore } from '../stores/readingStore'
import { useSessionStore } from '../stores/sessionStore'
import ReaderView from '../components/reading/ReaderView'
import ReadingUpload from '../components/reading/ReadingUpload'
import { C } from '../theme'

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
  const readProgress = useReadingStore(s => s.readProgress)

  const currentSession = useSessionStore(s => s.currentSession)
  const selectSession = useSessionStore(s => s.selectSession)

  const progressPct = sections.length > 0
    ? Math.round((readProgress.current_section / sections.length) * 100)
    : 0

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
        if (error.status === 401) { navigate('/login'); return }
        if (error.status === 404) { setMissingContent(true); return }
        setLoadError(error.message); return
      }
      setLoadError(error instanceof Error ? error.message : '加载失败，请稍后重试')
    })

    return () => {
      isActive = false
      saveProgress(sessionId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, selectSession, loadContent, saveProgress, navigate, reloadNonce])

  useEffect(() => {
    if (!sessionId) return
    const handleSave = () => saveProgress(sessionId)
    const handleVisibility = () => { if (document.visibilityState === 'hidden') handleSave() }
    window.addEventListener('beforeunload', handleSave)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('beforeunload', handleSave)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [sessionId, saveProgress])

  useEffect(() => { return () => reset() }, [sessionId, reset])

  const handleBack = useCallback(() => {
    navigate('/bookshelf')
  }, [navigate])

  const handleUploaded = useCallback(() => {
    setLoadError(null)
    setMissingContent(false)
  }, [])

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: C.bg }}>
        <p style={{ color: C.textMuted }}>无效的会话</p>
      </div>
    )
  }

  const hasContent = sections.length > 0 && !missingContent

  return (
    <div className="flex flex-col h-screen" style={{ background: C.bg }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 shrink-0"
        style={{
          height: 52,
          paddingTop: 'env(safe-area-inset-top)',
          borderBottom: `1px solid ${C.border}`,
          background: C.bg,
          position: 'sticky', top: 0, zIndex: 10,
        }}
      >
        <button
          onClick={handleBack}
          className="p-1 cursor-pointer"
          style={{ color: C.text, display: 'flex', background: 'none', border: 'none' }}
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 min-w-0">
          <h3 style={{
            fontSize: 15, fontWeight: 600, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: C.text,
          }}>
            {title || '共读'}
          </h3>
        </div>

        {hasContent && (
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>{progressPct}%</span>
            <div style={{ width: 48, height: 3, borderRadius: 2, background: '#E8DFD3', marginTop: 4 }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: `linear-gradient(90deg, ${C.accentWarm}, ${C.accent})`,
                width: `${progressPct}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {isLoadingContent ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: C.accent, borderTopColor: 'transparent' }}
          />
          <p style={{ color: C.textMuted, fontSize: '0.85rem' }}>加载中...</p>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6">
          <p style={{ color: C.textSecondary, fontSize: '0.9rem', textAlign: 'center', lineHeight: 1.7 }}>
            {loadError}
          </p>
          <button
            onClick={() => setReloadNonce(value => value + 1)}
            className="px-5 py-2 rounded-full text-sm font-medium cursor-pointer"
            style={{ background: C.accentGradient, color: '#fff', border: 'none' }}
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
