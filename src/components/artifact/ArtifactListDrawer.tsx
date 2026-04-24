import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { C, FONT } from '../../theme'
import { listSessionArtifacts, type Artifact } from '../../api/artifacts'
import { useArtifactStore } from '../../stores/artifactStore'

const typeIcons: Record<string, string> = {
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  html: 'M12 12m-10 0a10 10 0 1020 0 10 10 0 10-20 0M2 12h20',
  svg: 'M12 2L2 7l10 5 10-5-10-5z',
  markdown: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  csv: 'M12 3v18M3 12h18M3 3h18v18H3z',
  mermaid: 'M5 2h14v4H5zM10 18h4v4h-4z',
}

const typeColors: Record<string, string> = {
  code: '#8A7A6A', html: '#7A9A70', svg: '#9A7AB0',
  markdown: '#B08A60', csv: '#6A8A9A', mermaid: '#7A7AB0',
}

const typeLabels: Record<string, string> = {
  code: '代码', html: '网页', svg: '图形',
  markdown: '文档', csv: '表格', mermaid: '流程图',
}

interface ArtifactListDrawerProps {
  open: boolean
  onClose: () => void
  sessionId: string
}

export default function ArtifactListDrawer({ open, onClose, sessionId }: ArtifactListDrawerProps) {
  const [items, setItems] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(false)
  const openArtifact = useArtifactStore(s => s.openArtifact)

  useEffect(() => {
    if (!open || !sessionId) return
    setLoading(true)
    listSessionArtifacts(sessionId)
      .then(res => setItems(res.artifacts || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [open, sessionId])

  // 按 title 分组，只留每组的最新版本
  const latest = new Map<string, Artifact>()
  for (const item of items) {
    const k = item.title.toLowerCase()
    const prev = latest.get(k)
    if (!prev || item.version > prev.version) latest.set(k, item)
  }
  const grouped = Array.from(latest.values()).sort(
    (a, b) => (b.created_at || '').localeCompare(a.created_at || '')
  )

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(40,30,20,0.08)' }}
        />
      )}
      <aside
        aria-hidden={!open}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 41,
          width: 'min(320px, 85vw)',
          background: 'rgba(253, 250, 245, 0.75)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderLeft: `1px solid ${C.border}`,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex', flexDirection: 'column',
          fontFamily: FONT,
          boxShadow: open ? '-8px 0 40px rgba(160,120,90,0.08)' : 'none',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: '0.02em' }}>
              本次会话 Artifacts
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              {grouped.length} 个文件
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, border: 'none', background: 'transparent',
              color: C.textMuted, cursor: 'pointer', borderRadius: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent + '12' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {loading && (
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: 24 }}>
              正在加载…
            </div>
          )}
          {!loading && grouped.length === 0 && (
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: '40px 20px', lineHeight: 1.7 }}>
              这次会话里还没有 artifact
              <br />
              <span style={{ opacity: 0.7 }}>晨写代码、文档、图形时会自动归档到这里</span>
            </div>
          )}
          {!loading && grouped.map(a => {
            const color = typeColors[a.type] || '#8A7A6A'
            return (
              <button
                key={a.id}
                onClick={() => { openArtifact(a); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 12px',
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', borderRadius: 10, textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.accent + '08' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <svg
                  width={15} height={15} viewBox="0 0 24 24"
                  fill="none" stroke={color} strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d={typeIcons[a.type] || typeIcons.code} />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{a.title}</div>
                  <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 1.5, letterSpacing: '0.03em' }}>
                    {typeLabels[a.type] || a.type}{a.language ? ` · ${a.language}` : ''}
                  </div>
                </div>
                {a.version > 1 && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: '2px 7px', borderRadius: 5,
                    background: color + '15', color: color,
                    flexShrink: 0,
                  }}>v{a.version}</span>
                )}
              </button>
            )
          })}
        </div>
      </aside>
    </>
  )
}
