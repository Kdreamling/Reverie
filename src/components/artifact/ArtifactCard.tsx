import { memo, useEffect } from 'react'
import { useArtifactStore } from '../../stores/artifactStore'
import type { ParsedArtifact } from './parseArtifacts'

const typeConfig: Record<string, { icon: string; color: string }> = {
  code: { icon: '📄', color: '#002FA7' },
  html: { icon: '🌐', color: '#22c55e' },
  svg: { icon: '🎨', color: '#8b5cf6' },
  markdown: { icon: '📝', color: '#f59e0b' },
  csv: { icon: '📊', color: '#06b6d4' },
  mermaid: { icon: '📐', color: '#6366f1' },
}

interface ArtifactCardProps {
  artifact: ParsedArtifact
  index: number
}

const ArtifactCard = memo(function ArtifactCard({ artifact, index }: ArtifactCardProps) {
  const openArtifact = useArtifactStore(s => s.openArtifact)
  const registerArtifact = useArtifactStore(s => s.registerArtifact)
  const config = typeConfig[artifact.type] || typeConfig.code
  const isUpdate = !!artifact.ref || (artifact.version && artifact.version > 1)

  const artObj = {
    id: `inline-${index}-${artifact.title}`,
    session_id: '',
    type: artifact.type as any,
    title: artifact.title,
    language: artifact.language,
    content: artifact.content,
    version: artifact.version || 1,
    created_at: new Date().toISOString(),
  }

  // Register artifact on mount for version tracking
  useEffect(() => {
    registerArtifact(artObj)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.content])

  return (
    <div
      onClick={() => openArtifact(artObj)}
      className="my-3 rounded-xl p-4 cursor-pointer transition-all duration-150"
      style={{
        background: '#fff',
        border: `1px solid ${isUpdate ? config.color + '40' : '#e8ecf5'}`,
        maxWidth: 400,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
        e.currentTarget.style.borderColor = config.color
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = isUpdate ? config.color + '40' : '#e8ecf5'
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: 18 }}>{config.icon}</span>
        <span className="font-medium text-sm" style={{ color: '#1a1f2e' }}>{artifact.title}</span>
        {isUpdate && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: config.color + '15', color: config.color, fontSize: 10 }}
          >
            已更新
          </span>
        )}
      </div>
      <span className="text-xs" style={{ color: '#9aa3b8' }}>
        {artifact.language && `${artifact.language} · `}
        {artifact.type}
        {artifact.version && artifact.version > 1 && ` · v${artifact.version}`}
        {' · 点击查看 →'}
      </span>
    </div>
  )
})

export default ArtifactCard
