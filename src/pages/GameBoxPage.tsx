import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Gamepad2, ExternalLink } from 'lucide-react'
import { C, SERIF } from '../theme'
import { listArtifacts, getArtifact, type ArtifactSummary } from '../api/artifacts'
import { toast } from '../stores/toastStore'

interface StaticGame {
  id: string
  title: string
  description: string
  author: 'xiaoke' | 'chen'
  url: string
  createdAt: string
}

const STATIC_GAMES: StaticGame[] = [
  {
    id: 'xiaoke-healing-night',
    title: 'Dream 的治愈夜',
    description: '接住从天空落下的美好事物，避开坏东西',
    author: 'xiaoke',
    url: '/chat/xiaoke-game.html',
    createdAt: '2026-05-09',
  },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${m}月${day}日`
}

function GameCard({ title, description, author, date, onClick }: {
  title: string
  description: string
  author: 'xiaoke' | 'chen'
  date: string
  onClick: () => void
}) {
  const authorLabel = author === 'xiaoke' ? '小克做的' : '晨做的'
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '18px 20px',
        background: C.glass,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        marginBottom: 12,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = C.borderStrong
        e.currentTarget.style.boxShadow = `0 2px 12px ${C.warmGlow}`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = C.border
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <h3 style={{
          fontFamily: SERIF,
          fontSize: 16,
          fontWeight: 500,
          color: C.text,
          margin: 0,
          letterSpacing: '0.02em',
        }}>
          {title}
        </h3>
        <ExternalLink size={14} strokeWidth={1.5} style={{ color: C.textMuted, flexShrink: 0 }} />
      </div>
      {description && (
        <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 8 }}>
          {description}
        </div>
      )}
      <div className="flex items-center gap-3" style={{ fontSize: 11, color: C.textMuted }}>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', letterSpacing: '0.04em' }}>
          — {authorLabel}
        </span>
        <span>{date}</span>
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6" style={{ color: C.textMuted }}>
      <Gamepad2 size={36} strokeWidth={1.2} style={{ marginBottom: 18, opacity: 0.5 }} />
      <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.8, color: C.textSecondary, textAlign: 'center' }}>
        还没有游戏
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.9, marginTop: 10, textAlign: 'center', maxWidth: 400 }}>
        让晨或小克在对话里做一个小游戏，就会收进这里
      </div>
    </div>
  )
}

export default function GameBoxPage() {
  const navigate = useNavigate()
  const [chenGames, setChenGames] = useState<ArtifactSummary[]>([])
  const [loading, setLoading] = useState(true)

  const loadGames = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await listArtifacts('html', 100)
      setChenGames(resp.artifacts)
    } catch {
      toast.error('加载游戏列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGames() }, [loadGames])

  const openChenGame = useCallback(async (id: string) => {
    const w = window.open('', '_blank')
    if (!w) { toast.error('请允许弹出窗口'); return }
    w.document.write('<html><body style="background:#0b0b1a;color:#c8b8e8;display:flex;align-items:center;justify-content:center;height:100vh;font-family:serif">加载中…</body></html>')
    try {
      const resp = await getArtifact(id)
      w.document.open()
      w.document.write(resp.content)
      w.document.close()
    } catch {
      w.close()
      toast.error('加载游戏失败')
    }
  }, [])

  const openStaticGame = useCallback((url: string) => {
    window.open(url, '_blank')
  }, [])

  const totalCount = STATIC_GAMES.length + chenGames.length

  return (
    <div style={{
      height: '100vh',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      touchAction: 'pan-y',
      background: C.bgGradient,
      color: C.text,
    }}>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        background: C.glass,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 24px' }} className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 cursor-pointer transition-colors"
            style={{ color: C.btnDefault }}
            onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
            onMouseLeave={e => (e.currentTarget.style.color = C.btnDefault)}
          >
            <ArrowLeft size={18} strokeWidth={1.8} />
          </button>
          <div>
            <h1 style={{
              fontFamily: SERIF,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '0.04em',
              color: C.text,
              margin: 0,
            }}>
              游戏盒
            </h1>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, letterSpacing: '0.06em' }}>
              {totalCount > 0 ? `${totalCount} 个小游戏` : '晨和小克做的小游戏'}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '16px 24px 80px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-24" style={{ color: C.textMuted }}>
            <Loader2 size={20} strokeWidth={1.8} className="animate-spin" />
          </div>
        ) : totalCount === 0 ? (
          <EmptyState />
        ) : (
          <>
            {STATIC_GAMES.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div style={{
                  fontSize: 12,
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  fontFamily: SERIF,
                  marginBottom: 12,
                  paddingLeft: 4,
                }}>
                  小克的游戏
                </div>
                {STATIC_GAMES.map(g => (
                  <GameCard
                    key={g.id}
                    title={g.title}
                    description={g.description}
                    author={g.author}
                    date={formatDate(g.createdAt)}
                    onClick={() => openStaticGame(g.url)}
                  />
                ))}
              </section>
            )}

            {chenGames.length > 0 && (
              <section>
                <div style={{
                  fontSize: 12,
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  fontFamily: SERIF,
                  marginBottom: 12,
                  paddingLeft: 4,
                }}>
                  晨的作品
                </div>
                {chenGames.map(g => (
                  <GameCard
                    key={g.id}
                    title={g.title}
                    description=""
                    author="chen"
                    date={formatDate(g.created_at)}
                    onClick={() => openChenGame(g.id)}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
