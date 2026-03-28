import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, FONT } from '../theme'
import { useProjectStore } from '../stores/projectStore'
import type { Project } from '../api/projects'

// ─── Poster Themes ───
const POSTERS: Record<string, { grad: string; textOnDark: string; particle: string }> = {
  cyber: { grad: 'linear-gradient(135deg, #1a1035 0%, #2d1b69 40%, #0f3460 100%)', textOnDark: '#e2d5f0', particle: '#a78bfa' },
  kyoto: { grad: 'linear-gradient(135deg, #3d2017 0%, #6b3a2a 40%, #4a2c20 100%)', textOnDark: '#fde8d8', particle: '#fca5a5' },
  ocean: { grad: 'linear-gradient(135deg, #0a192f 0%, #0d2847 40%, #062033 100%)', textOnDark: '#cffafe', particle: '#06b6d4' },
}

// ─── Icons ───
function I({ d, w, sw, color }: { d: string; w?: number; sw?: string; color?: string }) {
  return (
    <svg width={w || 16} height={w || 16} viewBox="0 0 24 24" fill="none"
      stroke={color || 'currentColor'} strokeWidth={sw || '1.6'}
      strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

// ─── Film Holes ───
function FilmHoles({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }} />
      ))}
    </div>
  )
}

// ─── Particles ───
function Particles({ color, count = 6 }: { color: string; count?: number }) {
  const dots = useRef(
    Array.from({ length: count }).map(() => ({
      size: 2 + Math.random() * 3, op: 0.15 + Math.random() * 0.25,
      x: 10 + Math.random() * 80, y: 10 + Math.random() * 80,
      dur: 2 + Math.random() * 3, delay: Math.random() * 2,
    }))
  ).current
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {dots.map((d, i) => (
        <div key={i} style={{
          position: 'absolute', width: d.size, height: d.size, borderRadius: '50%',
          background: color, opacity: d.op, left: d.x + '%', top: d.y + '%',
          animation: `twinkle ${d.dur}s ease-in-out infinite`, animationDelay: d.delay + 's',
        }} />
      ))}
    </div>
  )
}

// ─── Create Modal ───
function CreateModal({ open, onClose, onCreate }: {
  open: boolean
  onClose: () => void
  onCreate: (title: string, tagline: string, theme: string) => void
}) {
  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [theme, setTheme] = useState('cyber')

  if (!open) return null

  const themes = [
    { k: 'cyber', label: '赛博朋克', color: '#a78bfa' },
    { k: 'kyoto', label: '京都物语', color: '#fca5a5' },
    { k: 'ocean', label: '深海探索', color: '#06b6d4' },
  ]

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(50,42,34,0.3)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        zIndex: 300, animation: 'fadeIn 0.2s ease',
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: C.bg, borderRadius: '24px 24px 0 0',
        boxShadow: '0 -8px 40px rgba(100,80,50,0.12)',
        padding: '20px 20px max(20px, env(safe-area-inset-bottom))',
        animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
        fontFamily: FONT,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.borderStrong }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 20 }}>创建新世界</div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: 'block' }}>名称</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="给你的故事起个名字"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid ' + C.border, fontSize: 14, color: C.text, outline: 'none', background: '#FFFCF8', boxSizing: 'border-box', fontFamily: FONT }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: 'block' }}>简介</label>
          <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="一句话描述你的世界"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid ' + C.border, fontSize: 14, color: C.text, outline: 'none', background: '#FFFCF8', boxSizing: 'border-box', fontFamily: FONT }} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, display: 'block' }}>主题</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {themes.map(t => (
              <button key={t.k} onClick={() => setTheme(t.k)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: theme === t.k ? '2px solid ' + t.color : '1px solid ' + C.border,
                background: theme === t.k ? t.color + '14' : 'transparent',
                color: theme === t.k ? t.color : C.textSecondary,
                cursor: 'pointer', fontFamily: FONT,
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        <button onClick={() => { if (title.trim()) onCreate(title.trim(), tagline.trim(), theme) }}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            background: title.trim() ? C.accentGradient : C.surface,
            color: title.trim() ? '#fff' : C.textMuted,
            fontSize: 15, fontWeight: 700, cursor: title.trim() ? 'pointer' : 'default',
            fontFamily: FONT, boxShadow: title.trim() ? '0 2px 12px rgba(160,120,90,0.2)' : 'none',
          }}>
          开始冒险
        </button>
      </div>
    </>
  )
}

// ─── Main Page ───
export default function ProjectsPage() {
  const navigate = useNavigate()
  const { projects, loading, fetchProjects, createProject } = useProjectStore()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const handleCreate = useCallback(async (title: string, tagline: string, theme: string) => {
    const p = await createProject(title, tagline, theme)
    setShowCreate(false)
    navigate(`/projects/${p.id}`)
  }, [createProject, navigate])

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT }}>
      {/* Header */}
      <div style={{
        padding: '0 14px', height: 52, display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid ' + C.border, flexShrink: 0,
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}>
          <I d="M19 12H5M12 19l-7-7 7-7" w={20} sw="2" />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }}>剧本世界</span>
        <button onClick={() => setShowCreate(true)} style={{
          background: C.accentGradient, border: 'none', borderRadius: 10,
          padding: '7px 14px', color: '#fff', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
          boxShadow: '0 2px 12px rgba(160,120,90,0.2)',
        }}>
          <I d="M12 5v14M5 12h14" w={14} sw="2.5" /> 新剧本
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading && projects.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: C.textMuted, fontSize: 13 }}>加载中...</div>
        )}

        {!loading && projects.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 16 }}>还没有剧本，创建你的第一个世界吧</div>
            <button onClick={() => setShowCreate(true)} style={{
              padding: '12px 24px', borderRadius: 12, border: '2px dashed ' + C.borderStrong,
              background: 'transparent', color: C.accent, fontSize: 14, cursor: 'pointer',
              fontWeight: 600, fontFamily: FONT,
            }}>
              <I d="M12 5v14M5 12h14" w={18} sw="2" /> 创建新世界
            </button>
          </div>
        )}

        {projects.map((p, i) => (
          <ProjectCard key={p.id} project={p} index={i} onClick={() => navigate(`/projects/${p.id}`)} />
        ))}

        {projects.length > 0 && (
          <button onClick={() => setShowCreate(true)} style={{
            width: '100%', padding: 20, borderRadius: 18, background: 'transparent',
            border: '2px dashed ' + C.borderStrong, color: C.accent, fontSize: 14,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, fontFamily: FONT, fontWeight: 600, marginTop: 4,
          }}>
            <I d="M12 5v14M5 12h14" w={18} sw="2" /> 创建新世界
          </button>
        )}
      </div>

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />

      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
        @keyframes twinkle{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:.6;transform:scale(1.2)}}
      `}</style>
    </div>
  )
}

// ─── Project Card ───
function ProjectCard({ project, index, onClick }: { project: Project; index: number; onClick: () => void }) {
  const pst = POSTERS[project.poster_theme] || POSTERS.cyber
  const fileCount = project.files?.length || 0

  return (
    <button onClick={onClick} style={{
      width: '100%', border: 'none', cursor: 'pointer', fontFamily: FONT,
      borderRadius: 18, overflow: 'hidden', marginBottom: 14, textAlign: 'left',
      boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
      animation: 'fadeSlideIn .4s ease both', animationDelay: index * 0.08 + 's',
    }}>
      <div style={{ background: pst.grad, padding: '22px 20px 18px', position: 'relative', overflow: 'hidden' }}>
        <Particles color={pst.particle} count={7} />
        <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
          <FilmHoles count={5} />
        </div>
        <div style={{ position: 'relative', zIndex: 1, paddingLeft: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>{project.title}</div>
          {project.tagline && (
            <div style={{ fontSize: 13, color: pst.textOnDark, opacity: 0.85, lineHeight: 1.5, marginTop: 8 }}>{project.tagline}</div>
          )}
        </div>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 80, height: 80, borderRadius: '50%', background: pst.particle, opacity: 0.06, filter: 'blur(25px)' }} />
      </div>
      <div style={{
        padding: '11px 20px', background: '#FFFCF8',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid ' + C.border,
      }}>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: C.textMuted }}>
          <span>{project.chapter_count} 章节</span>
          <span style={{ width: 1, height: 12, background: C.border, display: 'inline-block' }} />
          <span>{fileCount} 文件</span>
        </div>
        <div style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: C.surface, color: C.accent, fontWeight: 600 }}>
          {project.chapter_count > 0 ? '继续' : '开始'} →
        </div>
      </div>
    </button>
  )
}
