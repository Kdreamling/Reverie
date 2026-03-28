import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Copy, Check, Download, Code, Eye, Edit3, ChevronLeft, ChevronRight } from 'lucide-react'
import { useArtifactStore } from '../../stores/artifactStore'
import { C, FONT } from '../../theme'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html as htmlLang } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json as jsonLang } from '@codemirror/lang-json'

// ─── Language extensions ─────────────────────────────────────────────────────

function getLangExtension(language?: string) {
  const lang = (language || '').toLowerCase()
  if (['javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx'].includes(lang)) return javascript({ typescript: lang.includes('ts') })
  if (['python', 'py'].includes(lang)) return python()
  if (['html', 'htm'].includes(lang)) return htmlLang()
  if (lang === 'css') return css()
  if (lang === 'json') return jsonLang()
  return []
}

// ─── Type config ─────────────────────────────────────────────────────────────

const typeConfig: Record<string, { label: string; color: string; iconD: string }> = {
  code:     { label: '代码',   color: '#8A7A6A', iconD: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
  html:     { label: '网页',   color: '#7A9A70', iconD: 'M12 12m-10 0a10 10 0 1020 0 10 10 0 10-20 0M2 12h20' },
  svg:      { label: '图形',   color: '#9A7AB0', iconD: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  markdown: { label: '文档',   color: '#B08A60', iconD: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6' },
  csv:      { label: '表格',   color: '#6A8A9A', iconD: 'M12 3v18M3 12h18M3 3h18v18H3z' },
  mermaid:  { label: '流程图', color: '#7A7AB0', iconD: 'M5 2h14v4H5zM10 18h4v4h-4zM12 6v6M12 14v4M6 12h12' },
}

// ─── Preview renderers ───────────────────────────────────────────────────────

function HTMLPreview({ content }: { content: string }) {
  return <iframe srcDoc={content} sandbox="allow-scripts allow-modals" className="w-full border-0" style={{ minHeight: '100%', height: '100%', background: '#fff', borderRadius: '0 0 20px 20px' }} />
}

function SVGPreview({ content }: { content: string }) {
  return <div className="flex items-center justify-center p-6" style={{ background: C.bg, minHeight: 300 }} dangerouslySetInnerHTML={{ __html: content }} />
}

function MarkdownPreview({ content }: { content: string }) {
  return <div className="p-6 md-content" style={{ background: C.bg, fontFamily: FONT }}><ReactMarkdown rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown></div>
}

function CSVPreview({ content }: { content: string }) {
  const rows = content.trim().split('\n').map(row => row.split(','))
  const headers = rows[0] || []
  const body = rows.slice(1)
  return (
    <div className="overflow-auto p-5" style={{ background: C.bg }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
                color: C.textSecondary, borderBottom: '2px solid ' + C.borderStrong,
                fontFamily: FONT, letterSpacing: '0.03em', textTransform: 'uppercase',
              }}>{h.trim()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '10px 14px', borderBottom: '1px solid ' + C.border,
                  color: C.text, fontSize: 13,
                }}>{cell.trim()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MermaidPreview({ content }: { content: string }) {
  const [zoom, setZoom] = useState(100)
  const html = `<!DOCTYPE html><html><head>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>body{margin:0;display:flex;justify-content:center;padding:24px;background:${C.bg};overflow:auto;}</style>
</head><body><pre class="mermaid">${content.replace(/</g, '&lt;')}</pre>
<script>mermaid.initialize({startOnLoad:true,theme:'neutral'});<\/script></body></html>`

  return (
    <div className="flex flex-col h-full">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', background: C.bg }}>
        {[50, 75, 100, 125, 150].map(z => (
          <button key={z} onClick={() => setZoom(z)} style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 11, border: 'none',
            background: zoom === z ? C.accent + '12' : 'transparent',
            color: zoom === z ? C.accent : C.textMuted,
            fontWeight: zoom === z ? 600 : 400,
            cursor: 'pointer', fontFamily: FONT,
          }}>{z}%</button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <iframe srcDoc={html} sandbox="allow-scripts" className="border-0"
          style={{ width: `${zoom}%`, minHeight: 400, height: '100%', background: C.bg, transformOrigin: 'top left', transform: `scale(${zoom / 100})` }} />
      </div>
    </div>
  )
}

// ─── CodeMirror Editor ───────────────────────────────────────────────────────

function CodeMirrorView({ content, language, editable, onChange }: { content: string; language?: string; editable?: boolean; onChange?: (value: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const extensions = [basicSetup, oneDark, EditorView.lineWrapping, getLangExtension(language)]
    if (!editable) extensions.push(EditorState.readOnly.of(true))
    if (onChange) {
      extensions.push(EditorView.updateListener.of(update => {
        if (update.docChanged) onChange(update.state.doc.toString())
      }))
    }
    const state = EditorState.create({ doc: content, extensions })
    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
  }, [content, language, editable])

  return <div ref={containerRef} className="min-h-[300px]" style={{ borderRadius: '0 0 20px 20px', overflow: 'hidden' }} />
}

// ─── Writing Mode ────────────────────────────────────────────────────────────

function WritingMode({ content: initialContent }: { content: string }) {
  const [content, setContent] = useState(initialContent)
  return (
    <div className="flex h-full" style={{ borderRadius: '0 0 20px 20px', overflow: 'hidden' }}>
      <div className="w-1/2 overflow-auto" style={{ borderRight: '1px solid ' + C.border }}>
        <CodeMirrorView content={content} language="markdown" editable onChange={setContent} />
      </div>
      <div className="w-1/2 overflow-auto p-6 md-content" style={{ background: C.bg, fontFamily: FONT }}>
        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}

// ─── Version Navigator ──────────────────────────────────────────────────────

function VersionNavigator() {
  const { currentArtifact, viewingVersionIndex, viewVersion } = useArtifactStore()
  if (!currentArtifact?.history || currentArtifact.history.length < 2) return null

  const total = currentArtifact.history.length
  const idx = viewingVersionIndex

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 20px',
      background: C.accent + '06',
    }}>
      {/* 版本时间线点 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
        {currentArtifact.history.map((_, i) => (
          <button key={i} onClick={() => viewVersion(total - 1 - i)} style={{
            width: i === (total - 1 - idx) ? 18 : 6, height: 6, borderRadius: 3,
            background: i === (total - 1 - idx) ? C.accent : C.accent + '25',
            border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            padding: 0,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button onClick={() => viewVersion(idx + 1)} disabled={idx >= total - 1}
          style={{ display: 'flex', padding: 3, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', opacity: idx >= total - 1 ? 0.25 : 1, borderRadius: 6 }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 11, color: C.textSecondary, fontWeight: 600, minWidth: 32, textAlign: 'center', fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>
          v{total - idx}
        </span>
        <button onClick={() => viewVersion(idx - 1)} disabled={idx <= 0}
          style={{ display: 'flex', padding: 3, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', opacity: idx <= 0 ? 0.25 : 1, borderRadius: 6 }}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Main Panel — 全屏弹窗 Overlay ──────────────────────────────────────────

export default function ArtifactPanel() {
  const { currentArtifact, isOpen, closePanel } = useArtifactStore()
  const [activeTab, setActiveTab] = useState<'code' | 'preview' | 'writing'>('preview')
  const [copied, setCopied] = useState(false)

  const previewable = ['html', 'svg', 'mermaid', 'csv', 'markdown']
  const canPreview = currentArtifact ? previewable.includes(currentArtifact.type) : false
  const isMarkdown = currentArtifact?.type === 'markdown'

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
      html: '.html', svg: '.svg', markdown: '.md', csv: '.csv', mermaid: '.mmd',
    }
    const ext = extMap[currentArtifact.type] || '.txt'
    const blob = new Blob([currentArtifact.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${currentArtifact.title}${ext}`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [currentArtifact])

  if (!isOpen || !currentArtifact) return null

  const config = typeConfig[currentArtifact.type] || typeConfig.code

  const tabs: { k: 'code' | 'preview' | 'writing'; label: string; icon: React.ReactNode; show: boolean }[] = [
    { k: 'code', label: '代码', icon: <Code size={13} />, show: true },
    { k: 'preview', label: '预览', icon: <Eye size={13} />, show: canPreview },
    { k: 'writing', label: '写作间', icon: <Edit3 size={13} />, show: isMarkdown },
  ]

  return (
    <>
      {/* 背景遮罩 */}
      <div onClick={closePanel} style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(50,42,34,0.4)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        animation: 'artFadeIn 0.2s ease',
      }} />

      {/* 内容容器 */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 61,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'env(safe-area-inset-top) 12px env(safe-area-inset-bottom)',
        pointerEvents: 'none',
      }}>
        <div style={{
          width: '100%', maxWidth: 720, height: '85dvh', maxHeight: 680,
          background: C.bg,
          borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(50,42,34,0.2), 0 0 0 1px ' + C.border,
          display: 'flex', flexDirection: 'column',
          fontFamily: FONT, pointerEvents: 'auto',
          animation: 'artSlideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}>

          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 12px',
            flexShrink: 0,
          }}>
            {/* 类型图标 */}
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: config.color + '12',
              border: '1px solid ' + config.color + '20',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={config.iconD} />
              </svg>
            </div>

            {/* 标题 + 元信息 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentArtifact.title}
              </div>
              <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 2 }}>
                {currentArtifact.language && <span style={{ color: config.color, fontWeight: 600 }}>{currentArtifact.language}</span>}
                {currentArtifact.language && ' · '}
                {config.label}
                {currentArtifact.version > 1 && ` · v${currentArtifact.version}`}
              </div>
            </div>

            {/* 工具按钮 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {[
                { icon: copied ? <Check size={15} /> : <Copy size={15} />, onClick: handleCopy, tip: '复制', active: copied },
                { icon: <Download size={15} />, onClick: handleDownload, tip: '下载', active: false },
                { icon: <X size={16} />, onClick: closePanel, tip: '关闭', active: false },
              ].map((btn, i) => (
                <button key={i} onClick={btn.onClick} title={btn.tip} style={{
                  width: 32, height: 32, borderRadius: 10, border: 'none',
                  background: 'transparent', color: btn.active ? C.accent : C.textMuted,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.accent + '0A'; e.currentTarget.style.color = C.accent }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = btn.active ? C.accent : C.textMuted }}
                >
                  {btn.icon}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab 栏 — pill 风格 ── */}
          <div style={{
            display: 'flex', gap: 4, padding: '0 20px 12px',
            flexShrink: 0,
          }}>
            {tabs.filter(t => t.show).map(t => (
              <button key={t.k} onClick={() => setActiveTab(t.k)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500,
                border: activeTab === t.k ? '1.5px solid ' + C.accent + '30' : '1px solid transparent',
                background: activeTab === t.k ? C.accent + '08' : 'transparent',
                color: activeTab === t.k ? C.accent : C.textMuted,
                cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s',
              }}>{t.icon} {t.label}</button>
            ))}
          </div>

          {/* ── Version Navigator ── */}
          <VersionNavigator />

          {/* ── 分割线 ── */}
          <div style={{ height: 1, background: C.border, flexShrink: 0 }} />

          {/* ── Content ── */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {activeTab === 'writing' && isMarkdown ? (
              <WritingMode content={currentArtifact.content} />
            ) : activeTab === 'code' || !canPreview ? (
              <CodeMirrorView content={currentArtifact.content} language={currentArtifact.language} />
            ) : (
              <>
                {currentArtifact.type === 'html' && <HTMLPreview content={currentArtifact.content} />}
                {currentArtifact.type === 'svg' && <SVGPreview content={currentArtifact.content} />}
                {currentArtifact.type === 'markdown' && <MarkdownPreview content={currentArtifact.content} />}
                {currentArtifact.type === 'csv' && <CSVPreview content={currentArtifact.content} />}
                {currentArtifact.type === 'mermaid' && <MermaidPreview content={currentArtifact.content} />}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes artFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes artSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>
  )
}
