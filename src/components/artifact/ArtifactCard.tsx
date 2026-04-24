import { memo, useEffect } from 'react'
import { useArtifactStore } from '../../stores/artifactStore'
import { C, FONT } from '../../theme'
import type { ParsedArtifact } from './parseArtifacts'

const typeConfig: Record<string, { label: string; color: string; iconD: string; bgGrad: string }> = {
  code:     { label: '代码',   color: '#8A7A6A', iconD: 'M16 18l6-6-6-6M8 6l-6 6 6 6', bgGrad: 'linear-gradient(135deg, rgba(138,122,106,0.06), rgba(138,122,106,0.12))' },
  html:     { label: '网页',   color: '#7A9A70', iconD: 'M12 12m-10 0a10 10 0 1020 0 10 10 0 10-20 0M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10', bgGrad: 'linear-gradient(135deg, rgba(122,154,112,0.06), rgba(122,154,112,0.12))' },
  svg:      { label: '图形',   color: '#9A7AB0', iconD: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', bgGrad: 'linear-gradient(135deg, rgba(154,122,176,0.06), rgba(154,122,176,0.12))' },
  markdown: { label: '文档',   color: '#B08A60', iconD: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8', bgGrad: 'linear-gradient(135deg, rgba(176,138,96,0.06), rgba(176,138,96,0.12))' },
  csv:      { label: '表格',   color: '#6A8A9A', iconD: 'M12 3v18M3 12h18M3 3h18v18H3z', bgGrad: 'linear-gradient(135deg, rgba(106,138,154,0.06), rgba(106,138,154,0.12))' },
  mermaid:  { label: '流程图', color: '#7A7AB0', iconD: 'M5 2h14v4H5zM10 18h4v4h-4zM12 6v6M12 14v4M6 12h12', bgGrad: 'linear-gradient(135deg, rgba(122,122,176,0.06), rgba(122,122,176,0.12))' },
}

interface ArtifactCardProps {
  artifact: ParsedArtifact
  index: number
  /** 真 id（后端 SSE done.artifacts 回带），有就走 /versions 拉跨轮历史 */
  savedId?: string
  savedVersion?: number
}

const ArtifactCard = memo(function ArtifactCard({ artifact, index, savedId, savedVersion }: ArtifactCardProps) {
  const openArtifact = useArtifactStore(s => s.openArtifact)
  const registerArtifact = useArtifactStore(s => s.registerArtifact)
  const config = typeConfig[artifact.type] || typeConfig.code
  const effectiveVersion = savedVersion || artifact.version || 1
  const isUpdate = !!artifact.ref || effectiveVersion > 1

  const artObj = {
    id: savedId || `inline-${index}-${artifact.title}`,
    session_id: '',
    type: artifact.type as any,
    title: artifact.title,
    language: artifact.language,
    content: artifact.content,
    version: effectiveVersion,
    created_at: new Date().toISOString(),
  }

  useEffect(() => {
    registerArtifact(artObj)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.content])

  // 代码预览片段
  const preview = artifact.content.split('\n').slice(0, 3).join('\n')

  return (
    <div
      onClick={() => openArtifact(artObj)}
      style={{
        margin: '12px 0',
        borderRadius: 16,
        overflow: 'hidden',
        maxWidth: 400,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: FONT,
        boxShadow: '0 1px 4px rgba(160,120,90,0.06)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(160,120,90,0.12)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(160,120,90,0.06)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* 代码预览区 — 深色条 */}
      <div style={{
        padding: '12px 16px 10px',
        background: '#2A2520',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <pre style={{
          margin: 0, fontSize: 10.5, lineHeight: 1.5,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          overflow: 'hidden', maxHeight: 42, whiteSpace: 'pre',
          textOverflow: 'ellipsis',
        }}>{preview}</pre>
        {/* 渐变遮罩 */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 20,
          background: 'linear-gradient(transparent, #2A2520)',
        }} />
        {/* 左侧彩色竖线 */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: config.color,
        }} />
      </div>

      {/* 信息栏 */}
      <div style={{
        padding: '10px 16px',
        background: config.bgGrad,
        display: 'flex', alignItems: 'center', gap: 10,
        borderTop: '1px solid ' + C.border,
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d={config.iconD} />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {artifact.title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isUpdate && (
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 5,
              background: config.color + '15', color: config.color, fontWeight: 600,
            }}>
              v{effectiveVersion}
            </span>
          )}
          <span style={{ fontSize: 11, color: C.textMuted }}>{config.label}</span>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>
    </div>
  )
})

export default ArtifactCard
