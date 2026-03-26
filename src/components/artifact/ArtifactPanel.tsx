import { useState, useCallback } from 'react'
import { X, Copy, Check, Download, Code, Eye, History, ChevronLeft, ChevronRight } from 'lucide-react'
import { useArtifactStore } from '../../stores/artifactStore'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'

// ─── Preview renderers ───────────────────────────────────────────────────────

function HTMLPreview({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts allow-modals"
      className="w-full border-0"
      style={{ minHeight: '100%', height: '100%', background: '#fff' }}
    />
  )
}

function SVGPreview({ content }: { content: string }) {
  return (
    <div
      className="flex items-center justify-center p-6"
      style={{ background: '#fff', minHeight: 300 }}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="p-6 md-content" style={{ background: '#fff' }}>
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
    </div>
  )
}

function CSVPreview({ content }: { content: string }) {
  const rows = content.trim().split('\n').map(row => row.split(','))
  const headers = rows[0] || []
  const body = rows.slice(1)

  return (
    <div className="overflow-auto p-4" style={{ background: '#fff' }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 font-medium" style={{ borderBottom: '2px solid #e8ecf5', color: '#1a1f2e' }}>{h.trim()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2" style={{ borderBottom: '1px solid #f0f2f8', color: '#5a6a8a' }}>{cell.trim()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CodeView({ content, language }: { content: string; language?: string }) {
  return (
    <div className="p-4 overflow-auto" style={{ background: '#1a1f2e', minHeight: 300 }}>
      <pre className="text-sm leading-relaxed">
        <code className={language ? `language-${language}` : ''} style={{ color: '#e2e8f0' }}>{content}</code>
      </pre>
    </div>
  )
}

// ─── Version Navigator ──────────────────────────────────────────────────────

function VersionNavigator() {
  const { currentArtifact, viewingVersionIndex, viewVersion } = useArtifactStore()

  if (!currentArtifact?.history || currentArtifact.history.length < 2) return null

  const total = currentArtifact.history.length
  const currentIdx = viewingVersionIndex
  const currentVersion = currentArtifact.history[currentIdx]

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
      style={{ borderBottom: '1px solid #e8ecf5', background: 'rgba(0,47,167,0.03)' }}
    >
      <History size={13} style={{ color: '#7a8399' }} />
      <span className="text-xs font-medium" style={{ color: '#5a6a8a' }}>
        v{currentVersion?.version || currentIdx + 1} / {total} 个版本
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => viewVersion(currentIdx + 1)}
          disabled={currentIdx >= total - 1}
          className="flex items-center justify-center rounded p-1 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: '#7a8399' }}
          title="上一个版本"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs tabular-nums" style={{ color: '#9aa3b8', minWidth: 40, textAlign: 'center' }}>
          {total - currentIdx} / {total}
        </span>
        <button
          onClick={() => viewVersion(currentIdx - 1)}
          disabled={currentIdx <= 0}
          className="flex items-center justify-center rounded p-1 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: '#7a8399' }}
          title="下一个版本"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function ArtifactPanel() {
  const { currentArtifact, isOpen, closePanel } = useArtifactStore()
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('preview')
  const [copied, setCopied] = useState(false)

  const previewable = ['html', 'svg', 'mermaid', 'csv', 'markdown']
  const canPreview = currentArtifact ? previewable.includes(currentArtifact.type) : false

  const handleCopy = useCallback(() => {
    if (!currentArtifact) return
    navigator.clipboard.writeText(currentArtifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [currentArtifact])

  const handleDownload = useCallback(() => {
    if (!currentArtifact) return
    const extMap: Record<string, string> = {
      code: currentArtifact.language ? `.${currentArtifact.language}` : '.txt',
      html: '.html',
      svg: '.svg',
      markdown: '.md',
      csv: '.csv',
      mermaid: '.mmd',
    }
    const ext = extMap[currentArtifact.type] || '.txt'
    const blob = new Blob([currentArtifact.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentArtifact.title}${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }, [currentArtifact])

  if (!isOpen || !currentArtifact) return null

  const typeIcons: Record<string, string> = {
    code: '📄', html: '🌐', svg: '🎨', markdown: '📝', csv: '📊', mermaid: '📐',
  }

  return (
    <div
      className="flex flex-col h-full animate-slide-in-right fixed md:relative inset-0 md:inset-auto z-50 md:z-auto"
      style={{
        width: undefined,
        minWidth: 0,
        borderLeft: '1px solid #e8ecf5',
        background: '#fafbfd',
        flexShrink: 0,
      }}
    >
      <style>{`
        @media (min-width: 768px) {
          .animate-slide-in-right { width: 500px !important; max-width: 50vw !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e8ecf5' }}>
        <span style={{ fontSize: 18 }}>{typeIcons[currentArtifact.type] || '📄'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium truncate" style={{ color: '#1a1f2e' }}>
            {currentArtifact.title}
          </h3>
          <p className="text-xs" style={{ color: '#9aa3b8' }}>
            {currentArtifact.language && `${currentArtifact.language} · `}
            {currentArtifact.type}
            {currentArtifact.version > 1 && ` · v${currentArtifact.version}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopy} className="flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer" style={{ color: copied ? '#22c55e' : '#7a8399' }} title="复制内容">
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button onClick={handleDownload} className="flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer" style={{ color: '#7a8399' }} onMouseEnter={e => (e.currentTarget.style.color = '#002FA7')} onMouseLeave={e => (e.currentTarget.style.color = '#7a8399')} title="下载文件">
            <Download size={15} />
          </button>
          <button onClick={closePanel} className="flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer" style={{ color: '#7a8399' }} onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#7a8399')} title="关闭">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Version Navigator */}
      <VersionNavigator />

      {/* Tabs */}
      {canPreview && (
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #e8ecf5' }}>
          <button
            onClick={() => setActiveTab('code')}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer"
            style={{
              color: activeTab === 'code' ? '#002FA7' : '#7a8399',
              borderBottom: activeTab === 'code' ? '2px solid #002FA7' : '2px solid transparent',
            }}
          >
            <Code size={13} /> 代码
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer"
            style={{
              color: activeTab === 'preview' ? '#002FA7' : '#7a8399',
              borderBottom: activeTab === 'preview' ? '2px solid #002FA7' : '2px solid transparent',
            }}
          >
            <Eye size={13} /> 预览
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'code' || !canPreview ? (
          <CodeView content={currentArtifact.content} language={currentArtifact.language} />
        ) : (
          <>
            {currentArtifact.type === 'html' && <HTMLPreview content={currentArtifact.content} />}
            {currentArtifact.type === 'svg' && <SVGPreview content={currentArtifact.content} />}
            {currentArtifact.type === 'markdown' && <MarkdownPreview content={currentArtifact.content} />}
            {currentArtifact.type === 'csv' && <CSVPreview content={currentArtifact.content} />}
            {currentArtifact.type === 'mermaid' && <CodeView content={currentArtifact.content} />}
          </>
        )}
      </div>
    </div>
  )
}
