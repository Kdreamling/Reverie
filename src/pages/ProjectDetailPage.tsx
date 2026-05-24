import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { C, FONT } from '../theme'
import { useProjectStore } from '../stores/projectStore'
import { deleteSessionAPI } from '../api/sessions'
import type { Project, ProjectFile, CharacterState, InventoryItem, ProjectNote } from '../api/projects'
import { fetchCharacterAPI, saveCharacterAPI, fetchNotesAPI, createNoteAPI, deleteNoteAPI } from '../api/projects'

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

const GEAR_D = 'M12.22 2h-.44a2 2 0 00-2 1.7l-.22 1.48a9.3 9.3 0 00-1.16.67l-1.42-.47a2 2 0 00-2.26.8l-.22.38a2 2 0 00.26 2.5l1.1 1.01a9 9 0 000 1.34l-1.1 1.01a2 2 0 00-.26 2.5l.22.38a2 2 0 002.26.8l1.42-.47c.37.26.75.5 1.16.67l.22 1.48a2 2 0 002 1.7h.44a2 2 0 002-1.7l.22-1.48a9.3 9.3 0 001.16-.67l1.42.47a2 2 0 002.26-.8l.22-.38a2 2 0 00-.26-2.5l-1.1-1.01a9 9 0 000-1.34l1.1-1.01a2 2 0 00.26-2.5l-.22-.38a2 2 0 00-2.26-.8l-1.42.47a9.3 9.3 0 00-1.16-.67l-.22-1.48a2 2 0 00-2-1.7zM12 15a3 3 0 100-6 3 3 0 000 6z'

// ─── Settings Tab Icons ───
const IcoGlobe = () => <I d="M12 12m-10 0a10 10 0 1020 0 10 10 0 10-20 0M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10" w={15} />
const IcoFormat = () => <I d="M4 7V4h16v3M9 20h6M12 4v16" w={15} />
const IcoFolder = () => <I d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" w={15} />
const IcoInfo = () => <I d="M12 12m-10 0a10 10 0 1020 0 10 10 0 10-20 0M12 16v-4M12 8h.01" w={15} />
const IcoUser = () => <I d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8" w={15} />
const IcoNote = () => <I d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" w={15} />

// ─── Default format rules (for reset) ───
const DEFAULT_FORMAT_RULES = `## 剧本模式 · 行为规范

你现在进入了剧本模式。在这个模式下，你同时承担以下角色：

**GM（游戏主持人）**：
- 描绘场景环境，营造氛围，用感官细节让世界活起来
- 根据 Dream 的行动推进剧情
- 控制叙事节奏：紧张时加速，温情时放缓

**NPC 扮演者**：
- 用【角色名】标注 NPC 的对话和动作
- 每个 NPC 有独特的说话方式和行为逻辑

**Dream 的主导权**：
- 绝对不要替 Dream 做决定或描述她的内心想法
- 只描写世界对 Dream 行动的反应

**格式规范**：
- 旁白用 *斜体*，NPC 用【角色名】前缀
- 可以用 **加粗** 强调重要线索
- 不要使用编号列表——这是叙事，不是菜单

**身份锚定**：
- 你依然是晨，Dream 的伴侣
- 如果 Dream 跳出剧本说日常的话，自然地回应她`

// ═══════════════════════════════════════════════
//  PROJECT DETAIL PAGE
// ═══════════════════════════════════════════════
export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject, fetchProject, updateProject, createSession, createFile, deleteFile } = useProjectStore()
  const [view, setView] = useState<'chapters' | 'settings'>('chapters')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (projectId) {
      setLoading(true)
      fetchProject(projectId).finally(() => setLoading(false))
    }
  }, [projectId, fetchProject])

  if (loading) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: FONT }}>
        <span style={{ color: C.textMuted, fontSize: 13 }}>加载中...</span>
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: FONT, gap: 12 }}>
        <span style={{ color: C.textMuted, fontSize: 14 }}>项目不存在</span>
        <button onClick={() => navigate('/projects')} style={{ color: C.accent, background: 'none', border: 'none', fontSize: 13, cursor: 'pointer' }}>返回列表</button>
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FONT }}>
      {view === 'chapters'
        ? <ChapterList project={currentProject} onBack={() => navigate('/projects')} onSettings={() => setView('settings')} onChat={(sessionId) => navigate(`/${sessionId}`)} onNewChapter={async () => { if (projectId) await createSession(projectId) }} onRefresh={async () => { if (projectId) await fetchProject(projectId) }} />
        : <SettingsView project={currentProject} onBack={() => setView('chapters')} onUpdate={updateProject} onCreateFile={createFile} onDeleteFile={deleteFile} />
      }
      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes dialogIn{from{opacity:0;transform:translate(-50%,-50%) scale(0.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  CHAPTER LIST
// ═══════════════════════════════════════════════
function ChapterList({ project, onBack, onSettings, onChat, onNewChapter, onRefresh }: {
  project: Project
  onBack: () => void
  onSettings: () => void
  onChat: (sessionId: string) => void
  onNewChapter: () => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  const sessions = project.sessions || []

  const handleNew = useCallback(async () => {
    setCreating(true)
    await onNewChapter()
    setCreating(false)
  }, [onNewChapter])

  const handleDelete = useCallback(async (id: string) => {
    await deleteSessionAPI(id)
    setDeleteTarget(null)
    await onRefresh()
  }, [onRefresh])

  return (
    <>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
        borderBottom: '1px solid ' + C.border, flexShrink: 0,
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}>
          <I d="M19 12H5M12 19l-7-7 7-7" w={20} sw="2" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{project.title}</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{sessions.length} 章节</div>
        </div>
        <button onClick={onSettings} style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 6, display: 'flex' }}>
          <I d={GEAR_D} w={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {sessions.length === 0 && !creating && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '48px 32px', animation: 'fadeSlideIn .4s ease',
          }}>
            <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 20, textAlign: 'center', lineHeight: 1.6 }}>
              还没有章节，开始你的第一段故事
            </div>
            <button onClick={handleNew} style={{
              padding: '11px 28px', borderRadius: 12,
              border: '1.5px solid ' + C.borderStrong,
              background: 'transparent', color: C.accent, fontSize: 14, cursor: 'pointer',
              fontWeight: 600, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <I d="M12 5v14M5 12h14" w={15} sw="1.8" /> 新建章节
            </button>
          </div>
        )}

        {sessions.map((s, i) => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8,
            animation: 'fadeSlideIn .3s ease both', animationDelay: i * 0.06 + 's',
          }}>
            <button onClick={() => onChat(s.id)} style={{
              flex: 1, padding: '16px 18px', borderRadius: '14px 0 0 14px',
              background: '#FFFCF8', border: '1px solid ' + C.border, borderRight: 'none',
              cursor: 'pointer', textAlign: 'left', fontFamily: FONT,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  border: '1px solid ' + C.borderStrong,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: C.accent,
                }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{s.title || `第 ${i + 1} 章`}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{s.message_count} 条对话</div>
                </div>
                <I d="M9 18l6-6-6-6" w={14} color={C.metaText} />
              </div>
            </button>
            <button onClick={() => setDeleteTarget({ id: s.id, title: s.title || `第 ${i + 1} 章` })} style={{
              padding: '0 14px', height: '100%', minHeight: 66,
              borderRadius: '0 14px 14px 0',
              background: '#FFFCF8', border: '1px solid ' + C.border, borderLeft: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', color: C.metaText,
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#c07060'}
              onMouseLeave={e => e.currentTarget.style.color = C.metaText}
            >
              <I d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" w={14} />
            </button>
          </div>
        ))}

        {sessions.length > 0 && (
          <button onClick={handleNew} disabled={creating} style={{
            width: '100%', padding: 14, borderRadius: 14, background: 'transparent',
            border: '1.5px dashed ' + C.borderStrong, color: C.textMuted, fontSize: 13,
            cursor: creating ? 'default' : 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 5, fontFamily: FONT, fontWeight: 500,
            opacity: creating ? 0.5 : 1,
          }}>
            <I d="M12 5v14M5 12h14" w={15} sw="1.8" /> {creating ? '创建中...' : '新建章节'}
          </button>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <>
          <div onClick={() => setDeleteTarget(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(50,42,34,0.3)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            zIndex: 400, animation: 'fadeIn 0.15s ease',
          }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            zIndex: 401, background: C.bg, borderRadius: 20, padding: '28px 24px 20px',
            width: 'calc(100% - 64px)', maxWidth: 320,
            boxShadow: '0 16px 48px rgba(100,80,50,0.15)',
            fontFamily: FONT, animation: 'dialogIn 0.2s ease forwards',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>删除章节</div>
            <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 24 }}>
              确定要删除「{deleteTarget.title}」吗？所有对话记录将被删除且无法恢复。
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{
                flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                border: '1px solid ' + C.border, background: 'transparent', color: C.textSecondary,
                cursor: 'pointer', fontFamily: FONT,
              }}>取消</button>
              <button onClick={() => handleDelete(deleteTarget.id)} style={{
                flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                border: 'none', background: '#ef4444', color: '#fff',
                cursor: 'pointer', fontFamily: FONT,
              }}>删除</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════
//  SETTINGS VIEW — 4 Tabs
// ═══════════════════════════════════════════════
function SettingsView({ project, onBack, onUpdate, onCreateFile, onDeleteFile }: {
  project: Project
  onBack: () => void
  onUpdate: (id: string, data: Partial<Project>) => Promise<void>
  onCreateFile: (projectId: string, data: { name: string; content: string; file_type?: string; priority?: string }) => Promise<ProjectFile>
  onDeleteFile: (projectId: string, fileId: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'world' | 'format' | 'character' | 'notes' | 'files' | 'info'>('world')
  const tabs = [
    { k: 'world' as const, l: '世界观', icon: <IcoGlobe /> },
    { k: 'format' as const, l: '格式', icon: <IcoFormat /> },
    { k: 'character' as const, l: '角色卡', icon: <IcoUser /> },
    { k: 'notes' as const, l: '笔记', icon: <IcoNote /> },
    { k: 'files' as const, l: '文件', icon: <IcoFolder /> },
    { k: 'info' as const, l: '信息', icon: <IcoInfo /> },
  ]

  return (
    <>
      {/* Header */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
        borderBottom: '1px solid ' + C.border, flexShrink: 0,
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 4, display: 'flex' }}>
          <I d="M19 12H5M12 19l-7-7 7-7" w={20} sw="2" />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>{project.title}</span>
        <span style={{ fontSize: 12, color: C.textMuted }}>设定</span>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex', padding: '0 4px',
        borderBottom: '1px solid ' + C.border,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '12px 8px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none',
            cursor: 'pointer', color: tab === t.k ? C.accent : C.textMuted,
            borderBottom: tab === t.k ? '2px solid ' + C.accent : '2px solid transparent',
            transition: 'all .2s', marginBottom: -1, whiteSpace: 'nowrap', fontFamily: FONT,
          }}>
            <span style={{ opacity: tab === t.k ? 0.9 : 0.5 }}>{t.icon}</span>
            {t.l}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {tab === 'world' && <WorldTab project={project} onSave={onUpdate} />}
        {tab === 'format' && <FormatTab project={project} onSave={onUpdate} />}
        {tab === 'character' && <CharacterTab project={project} />}
        {tab === 'notes' && <NotesTab project={project} />}
        {tab === 'files' && <FilesTab project={project} onCreateFile={onCreateFile} onDeleteFile={onDeleteFile} />}
        {tab === 'info' && <InfoTab project={project} onSave={onUpdate} />}
      </div>
    </>
  )
}

// ─── World Tab ───
function WorldTab({ project, onSave }: { project: Project; onSave: (id: string, data: Partial<Project>) => Promise<void> }) {
  const [value, setValue] = useState(project.system_prompt || '')
  const [saving, setSaving] = useState(false)
  const changed = value !== (project.system_prompt || '')

  const handleSave = async () => {
    setSaving(true)
    await onSave(project.id, { system_prompt: value })
    setSaving(false)
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
        每轮对话自动注入，定义世界观、角色和基调。
      </div>
      <textarea value={value} onChange={e => setValue(e.target.value)} style={{
        width: '100%', minHeight: 280, padding: 14, borderRadius: 12,
        border: '1px solid ' + C.border, fontSize: 13.5, lineHeight: 1.7,
        color: C.text, background: '#FFFCF8', resize: 'vertical',
        fontFamily: "'SF Pro Text',-apple-system,sans-serif",
        outline: 'none', boxSizing: 'border-box',
      }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={handleSave} disabled={!changed || saving} style={{
          background: changed ? 'transparent' : C.surface,
          color: changed ? C.accent : C.textMuted,
          border: changed ? '1.5px solid ' + C.accent : '1px solid ' + C.border,
          padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          cursor: changed ? 'pointer' : 'default', fontFamily: FONT,
          opacity: saving ? 0.5 : 1,
        }}>{saving ? '保存中...' : '保存'}</button>
      </div>
    </div>
  )
}

// ─── Format Tab ───
function FormatTab({ project, onSave }: { project: Project; onSave: (id: string, data: Partial<Project>) => Promise<void> }) {
  const [value, setValue] = useState(project.format_rules || '')
  const [saving, setSaving] = useState(false)
  const changed = value !== (project.format_rules || '')

  const handleSave = async () => {
    setSaving(true)
    await onSave(project.id, { format_rules: value })
    setSaving(false)
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
        控制旁白格式、NPC 标注方式、写作风格。
      </div>
      <textarea value={value} onChange={e => setValue(e.target.value)} style={{
        width: '100%', minHeight: 280, padding: 14, borderRadius: 12,
        border: '1px solid ' + C.border, fontSize: 13.5, lineHeight: 1.7,
        color: C.text, background: '#FFFCF8', resize: 'vertical',
        fontFamily: "'SF Pro Text',-apple-system,sans-serif",
        outline: 'none', boxSizing: 'border-box',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button onClick={() => setValue(DEFAULT_FORMAT_RULES)} style={{
          background: 'none', border: '1px solid ' + C.border,
          padding: '8px 14px', borderRadius: 10, fontSize: 12,
          color: C.textSecondary, cursor: 'pointer', fontFamily: FONT,
        }}>恢复默认</button>
        <button onClick={handleSave} disabled={!changed || saving} style={{
          background: changed ? 'transparent' : C.surface,
          color: changed ? C.accent : C.textMuted,
          border: changed ? '1.5px solid ' + C.accent : '1px solid ' + C.border,
          padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          cursor: changed ? 'pointer' : 'default', fontFamily: FONT,
          opacity: saving ? 0.5 : 1,
        }}>{saving ? '保存中...' : '保存'}</button>
      </div>
    </div>
  )
}

// ─── Files Tab ───
function FilesTab({ project, onCreateFile, onDeleteFile }: {
  project: Project
  onCreateFile: (projectId: string, data: { name: string; content: string; file_type?: string; priority?: string }) => Promise<ProjectFile>
  onDeleteFile: (projectId: string, fileId: string) => Promise<void>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [filePriority, setFilePriority] = useState<'core' | 'reference'>('reference')
  const [adding, setAdding] = useState(false)
  const files = project.files || []
  const priLabel: Record<string, string> = { core: '核心', reference: '参考' }

  const handleAdd = async () => {
    if (!fileName.trim() || !fileContent.trim()) return
    setAdding(true)
    await onCreateFile(project.id, { name: fileName.trim(), content: fileContent, priority: filePriority })
    setFileName(''); setFileContent(''); setShowAdd(false); setAdding(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.textMuted }}>作为持久上下文注入对话</div>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          background: 'transparent', border: '1.5px solid ' + C.borderStrong,
          color: C.accent, padding: '6px 13px', borderRadius: 10, fontSize: 12,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          fontWeight: 600, fontFamily: FONT,
        }}>
          <I d="M12 5v14M5 12h14" w={13} sw="1.8" /> 添加
        </button>
      </div>

      {showAdd && (
        <div style={{
          padding: 14, borderRadius: 12, border: '1px solid ' + C.border,
          background: '#FFFCF8', marginBottom: 14, animation: 'fadeSlideIn .2s ease',
        }}>
          <input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="文件名（如：世界观设定.md）"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, fontSize: 13, color: C.text, outline: 'none', background: 'transparent', boxSizing: 'border-box', fontFamily: FONT, marginBottom: 8 }} />
          <textarea value={fileContent} onChange={e => setFileContent(e.target.value)} placeholder="粘贴文件内容..."
            style={{ width: '100%', minHeight: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, fontSize: 13, lineHeight: 1.6, color: C.text, outline: 'none', background: 'transparent', resize: 'vertical', boxSizing: 'border-box', fontFamily: FONT, marginBottom: 8 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['core', 'reference'] as const).map(p => (
                <button key={p} onClick={() => setFilePriority(p)} style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: filePriority === p ? '1.5px solid ' + C.accent : '1px solid ' + C.border,
                  background: filePriority === p ? C.accent + '10' : 'transparent',
                  color: filePriority === p ? C.accent : C.textSecondary,
                  cursor: 'pointer', fontFamily: FONT,
                }}>{priLabel[p]}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.textSecondary, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>取消</button>
              <button onClick={handleAdd} disabled={adding || !fileName.trim() || !fileContent.trim()} style={{
                padding: '7px 14px', borderRadius: 8, border: '1.5px solid ' + C.accent,
                background: 'transparent', color: C.accent, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT, opacity: adding ? 0.5 : 1,
              }}>{adding ? '添加中...' : '添加'}</button>
            </div>
          </div>
        </div>
      )}

      {files.length === 0 && !showAdd && (
        <div style={{ padding: 36, textAlign: 'center', color: C.textMuted, fontSize: 13, background: '#FFFCF8', borderRadius: 12, border: '1.5px dashed ' + C.borderStrong }}>
          还没有文件
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {files.map(f => (
          <div key={f.id} style={{
            background: '#FFFCF8', borderRadius: 10, padding: '11px 14px',
            border: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <I d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" w={18} color={C.textMuted} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                {Math.round(f.content.length / 1000 * 10) / 10}k字 · <span style={{ color: C.accent, fontWeight: 600 }}>{priLabel[f.priority] || f.priority}</span>
              </div>
            </div>
            <button onClick={() => onDeleteFile(project.id, f.id)} style={{ background: 'none', border: 'none', color: C.metaText, cursor: 'pointer', padding: 4 }}>
              <I d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" w={14} />
            </button>
          </div>
        ))}
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: C.surface, border: '1px solid ' + C.border, fontSize: 11, color: C.textSecondary, lineHeight: 1.6 }}>
          注入策略：核心文件全文注入，参考文件按需检索
        </div>
      )}
    </div>
  )
}

// ─── Info Tab ───
function InfoTab({ project, onSave }: { project: Project; onSave: (id: string, data: Partial<Project>) => Promise<void> }) {
  const [title, setTitle] = useState(project.title)
  const [tagline, setTagline] = useState(project.tagline || '')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const { deleteProject } = useProjectStore()
  const changed = title !== project.title || tagline !== (project.tagline || '')

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onSave(project.id, { title: title.trim(), tagline: tagline.trim() || undefined })
    setSaving(false)
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: 'block' }}>名称</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid ' + C.border,
          fontSize: 14, color: C.text, outline: 'none', background: '#FFFCF8',
          boxSizing: 'border-box', fontFamily: FONT,
        }} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: 'block' }}>简介</label>
        <textarea value={tagline} onChange={e => setTagline(e.target.value)} rows={2} style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid ' + C.border,
          fontSize: 13, color: C.text, outline: 'none', background: '#FFFCF8',
          resize: 'vertical', lineHeight: 1.5, fontFamily: FONT, boxSizing: 'border-box',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={handleSave} disabled={!changed || saving} style={{
          background: changed ? 'transparent' : C.surface,
          color: changed ? C.accent : C.textMuted,
          border: changed ? '1.5px solid ' + C.accent : '1px solid ' + C.border,
          padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          cursor: changed ? 'pointer' : 'default', fontFamily: FONT,
          opacity: saving ? 0.5 : 1,
        }}>{saving ? '保存中...' : '保存'}</button>
      </div>
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid ' + C.border }}>
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} style={{
            background: 'none', border: 'none', color: '#c07060', fontSize: 13,
            cursor: 'pointer', fontFamily: FONT,
          }}>删除项目</button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#c07060' }}>确定删除？</span>
            <button onClick={() => setShowDeleteConfirm(false)} style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid ' + C.border,
              background: 'transparent', color: C.textSecondary, fontSize: 12, cursor: 'pointer', fontFamily: FONT,
            }}>取消</button>
            <button onClick={async () => { await deleteProject(project.id); navigate('/projects') }} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
            }}>删除</button>
          </div>
        )}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════
//  CHARACTER TAB
// ═══════════════════════════════════════════════

const DEFAULT_CHARACTER: CharacterState = {
  name: '角色名',
  hp: { current: 10, max: 10 },
  currency: { name: '金币', amount: 0 },
  total_points: 20,
  attributes: {},
  inventory: [],
  status_effects: [],
  dice_config: { base_die: 10, current_die: 10, crit_success: 'max' as const, crit_fail: 1 },
}

function CharacterTab({ project }: { project: Project }) {
  const [cs, setCs] = useState<CharacterState>(project.character_state ?? DEFAULT_CHARACTER)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [newAttrName, setNewAttrName] = useState('')
  const [newItemName, setNewItemName] = useState('')

  useEffect(() => {
    if (project.id) {
      fetchCharacterAPI(project.id).then(data => {
        if (data) setCs(data)
      }).catch(() => {})
    }
  }, [project.id])

  const update = (patch: Partial<CharacterState>) => {
    setCs(prev => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveCharacterAPI(project.id, cs)
      setDirty(false)
    } catch { /* silent */ }
    setSaving(false)
  }

  const usedPoints = Object.values(cs.attributes).reduce((a, b) => a + b, 0)
  const remainingPoints = cs.total_points - usedPoints

  const lbl: React.CSSProperties = { fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
  const inp: React.CSSProperties = { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, color: C.text, outline: 'none', fontFamily: "'Noto Sans SC', sans-serif" }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Name + HP + Currency */}
      <div>
        <div style={lbl}>角色名</div>
        <input value={cs.name} onChange={e => update({ name: e.target.value })} style={{ ...inp, width: '100%' }} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={lbl}>HP</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="number" value={cs.hp.current} onChange={e => update({ hp: { ...cs.hp, current: parseInt(e.target.value) || 0 } })} style={{ ...inp, width: 50, textAlign: 'center' }} />
            <span style={{ color: C.textMuted }}>/</span>
            <input type="number" value={cs.hp.max} onChange={e => update({ hp: { ...cs.hp, max: parseInt(e.target.value) || 1 } })} style={{ ...inp, width: 50, textAlign: 'center' }} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={lbl}>{cs.currency.name}</div>
          <input type="number" value={cs.currency.amount} onChange={e => update({ currency: { ...cs.currency, amount: parseInt(e.target.value) || 0 } })} style={{ ...inp, width: 80, textAlign: 'center' }} />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={lbl}>骰子</div>
          <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>d{cs.dice_config.current_die}</span>
        </div>
      </div>

      {/* Attributes */}
      <div>
        <div style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
          <span>属性 (总点数 {cs.total_points})</span>
          <span style={{ color: remainingPoints > 0 ? C.accent : remainingPoints < 0 ? '#ef4444' : C.textMuted }}>
            剩余 {remainingPoints}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>总数</span>
          <input type="number" value={cs.total_points} onChange={e => update({ total_points: parseInt(e.target.value) || 0 })} style={{ ...inp, width: 60, textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(cs.attributes).map(([name, val]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13, color: C.text }}>{name}</span>
              <button onClick={() => {
                const next = { ...cs.attributes }
                if (next[name] > 0) next[name] = next[name] - 1
                update({ attributes: next })
              }} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, width: 24, height: 24, cursor: 'pointer', color: C.textMuted, fontSize: 14 }}>-</button>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.text, width: 20, textAlign: 'center' }}>{val}</span>
              <button onClick={() => {
                const next = { ...cs.attributes }
                next[name] = next[name] + 1
                update({ attributes: next })
              }} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, width: 24, height: 24, cursor: 'pointer', color: C.textMuted, fontSize: 14 }}>+</button>
              <button onClick={() => {
                const next = { ...cs.attributes }
                delete next[name]
                update({ attributes: next })
              }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 12, padding: 2 }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={newAttrName} onChange={e => setNewAttrName(e.target.value)} placeholder="新属性名" style={{ ...inp, flex: 1 }}
            onKeyDown={e => {
              if (e.key === 'Enter' && newAttrName.trim()) {
                update({ attributes: { ...cs.attributes, [newAttrName.trim()]: 0 } })
                setNewAttrName('')
              }
            }}
          />
          <button onClick={() => {
            if (newAttrName.trim()) {
              update({ attributes: { ...cs.attributes, [newAttrName.trim()]: 0 } })
              setNewAttrName('')
            }
          }} style={{ ...inp, cursor: 'pointer', color: C.accent, borderColor: C.accent, padding: '6px 12px' }}>添加</button>
        </div>
      </div>

      {/* Inventory */}
      <div>
        <div style={lbl}>物品栏</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cs.inventory.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}` }}>
              <span style={{ flex: 1, fontSize: 13, color: C.text }}>{item.name}</span>
              {item.description && <span style={{ fontSize: 11, color: C.textMuted }}>{item.description}</span>}
              {item.stat_bonus && <span style={{ fontSize: 10, color: C.accent }}>
                {Object.entries(item.stat_bonus).map(([k, v]) => `${k}+${v}`).join(' ')}
              </span>}
              <button onClick={() => {
                const next = [...cs.inventory]
                next.splice(idx, 1)
                update({ inventory: next })
              }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 12, padding: 2 }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="物品名" style={{ ...inp, flex: 1 }}
            onKeyDown={e => {
              if (e.key === 'Enter' && newItemName.trim()) {
                update({ inventory: [...cs.inventory, { name: newItemName.trim(), stat_bonus: null }] })
                setNewItemName('')
              }
            }}
          />
          <button onClick={() => {
            if (newItemName.trim()) {
              update({ inventory: [...cs.inventory, { name: newItemName.trim(), stat_bonus: null }] })
              setNewItemName('')
            }
          }} style={{ ...inp, cursor: 'pointer', color: C.accent, borderColor: C.accent, padding: '6px 12px' }}>添加</button>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={save}
        disabled={saving || !dirty}
        style={{
          padding: '10px 0', borderRadius: 10,
          background: dirty ? C.accentGradient : C.surface,
          border: 'none', color: dirty ? '#fff' : C.textMuted,
          fontSize: 13, fontWeight: 600, cursor: dirty ? 'pointer' : 'default',
          fontFamily: "'Noto Sans SC', sans-serif",
          transition: 'all 0.2s',
        }}
      >
        {saving ? '保存中...' : dirty ? '保存角色卡' : '已保存'}
      </button>
    </div>
  )
}


// ═══════════════════════════════════════════════
//  NOTES TAB
// ═══════════════════════════════════════════════

const NOTE_TYPES = [
  { k: 'event', l: '事件', color: '#6b9bd2' },
  { k: 'foreshadow', l: '伏笔', color: '#c49a6c' },
  { k: 'npc', l: 'NPC', color: '#9b8ec4' },
  { k: 'loot', l: '战利品', color: '#6bc48e' },
]

function NotesTab({ project }: { project: Project }) {
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [loading, setLoading] = useState(true)
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState('event')

  useEffect(() => {
    fetchNotesAPI(project.id).then(setNotes).catch(() => {}).finally(() => setLoading(false))
  }, [project.id])

  const handleAdd = async () => {
    if (!newContent.trim()) return
    const note = await createNoteAPI(project.id, { content: newContent.trim(), note_type: newType })
    setNotes(prev => [note, ...prev])
    setNewContent('')
  }

  const handleDelete = async (noteId: string) => {
    await deleteNoteAPI(project.id, noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  const grouped = notes.reduce<Record<number, ProjectNote[]>>((acc, n) => {
    (acc[n.chapter] ??= []).push(n)
    return acc
  }, {})

  const lbl: React.CSSProperties = { fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
  const inp: React.CSSProperties = { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, color: C.text, outline: 'none', fontFamily: "'Noto Sans SC', sans-serif" }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Add note */}
      <div>
        <div style={lbl}>添加笔记</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {NOTE_TYPES.map(t => (
            <button key={t.k} onClick={() => setNewType(t.k)} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 11,
              background: newType === t.k ? t.color + '20' : 'transparent',
              border: `1px solid ${newType === t.k ? t.color : C.border}`,
              color: newType === t.k ? t.color : C.textMuted,
              cursor: 'pointer', fontFamily: "'Noto Sans SC', sans-serif",
            }}>{t.l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="记录剧情要点、伏笔、NPC信息..."
            style={{ ...inp, flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <button onClick={handleAdd} style={{ ...inp, cursor: 'pointer', color: C.accent, borderColor: C.accent, padding: '6px 12px' }}>添加</button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>加载中...</div>
      ) : notes.length === 0 ? (
        <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>还没有笔记。在这里记录重要的剧情节点和伏笔。</div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)).map(([chapter, items]) => (
          <div key={chapter}>
            <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 6 }}>
              第 {chapter} 章
            </div>
            {items.map(note => {
              const typeInfo = NOTE_TYPES.find(t => t.k === note.note_type)
              return (
                <div key={note.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', marginBottom: 4,
                  borderRadius: 8, border: `1px solid ${C.border}`,
                }}>
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4,
                    background: (typeInfo?.color ?? '#888') + '18',
                    color: typeInfo?.color ?? C.textMuted,
                    fontWeight: 600, flexShrink: 0, marginTop: 2,
                  }}>{typeInfo?.l ?? note.note_type}</span>
                  <span style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{note.content}</span>
                  {note.auto && <span style={{ fontSize: 9, color: C.textMuted, flexShrink: 0 }}>auto</span>}
                  <button onClick={() => handleDelete(note.id)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', padding: 2, fontSize: 11, flexShrink: 0 }}>✕</button>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
