import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProjectStore } from '../stores/projectStore'
import { deleteSessionAPI } from '../api/sessions'
import type { Project, ProjectFile, CharacterState, ProjectNote } from '../api/projects'
import { fetchCharacterAPI, saveCharacterAPI, fetchNotesAPI, deleteNoteAPI } from '../api/projects'
import { NpcSeal } from '../components/rp/RpBlocks'
import { npcHue } from '../components/rp/rpEvents'
import { parseFileToText, UnsupportedFormatError } from '../utils/fileParser'
import './projectBook.css'

// ─── 小工具 ──────────────────────────────────────────────────────────────────

const CN = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
function cnNum(n: number): string {
  if (n <= 0) return CN[0]
  if (n < 10) return CN[n]
  if (n < 20) return '拾' + (n % 10 ? CN[n % 10] : '')
  return CN[Math.floor(n / 10)] + '拾' + (n % 10 ? CN[n % 10] : '')
}

function useInkDry(): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const t = useRef<number>(0)
  const trigger = useCallback(() => {
    setOn(true)
    window.clearTimeout(t.current)
    t.current = window.setTimeout(() => setOn(false), 1600)
  }, [])
  return [on, trigger]
}

// ─── 可书写区：非受控 contenteditable，失焦保存 ─────────────────────────────

function Editable({ value, onSave, className, placeholder, multiline, required }: {
  value: string
  onSave: (v: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
  required?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    if (el.innerText.replace(/\n+$/, '') !== value) el.innerText = value
    el.classList.toggle('bk-empty', value.trim() === '')
  }, [value])
  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={placeholder}
      onInput={() => {
        const el = ref.current
        if (el) el.classList.toggle('bk-empty', el.innerText.trim() === '')
      }}
      onPaste={e => {
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
      onKeyDown={multiline ? undefined : e => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
      }}
      onBlur={() => {
        const el = ref.current
        if (!el) return
        const text = el.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/, '')
        if (required && text.trim() === '') {
          el.innerText = value
          el.classList.remove('bk-empty')
          return
        }
        if (text !== value) onSave(text)
      }}
    />
  )
}

function EditNum({ value, onSave, min }: { value: number; onSave: (n: number) => void; min?: number }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.innerText !== String(value)) el.innerText = String(value)
  }, [value])
  return (
    <b
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      inputMode="numeric"
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
      onBlur={() => {
        const el = ref.current
        if (!el) return
        const n = parseInt(el.innerText.replace(/[^\d-]/g, ''), 10)
        if (isNaN(n) || n === value || (min !== undefined && n < min)) {
          el.innerText = String(value)
          return
        }
        onSave(n)
      }}
    />
  )
}

// 长文折叠：凡例/世界观动辄几千字，默认收拢，聚焦或点展开再放开
function CollapsibleProse({ value, onSave, placeholder }: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const long = value.length > 600
  return (
    <>
      <div
        className={'bk-prose-clip' + (open || !long ? ' open' : '')}
        onFocusCapture={() => setOpen(true)}
      >
        <Editable multiline className="bk-prose" value={value} placeholder={placeholder} onSave={onSave} />
      </div>
      {long && <div className="bk-add" onClick={() => setOpen(!open)}>{open ? '折起' : '展开全文'}</div>}
    </>
  )
}

// ─── 一叶（章节区块）─────────────────────────────────────────────────────────

function Leaf({ title, sub, inkDry, children }: {
  title: string
  sub?: string
  inkDry?: boolean
  children: ReactNode
}) {
  return (
    <section className="bk-leaf">
      <div className="bk-leaf-head">
        <span className="bk-leaf-title">{title}</span>
        {sub && <span className="bk-leaf-sub">{sub}</span>}
      </div>
      {children}
      {inkDry !== undefined && <span className={'bk-ink-dry' + (inkDry ? ' on' : '')}>墨迹阴干 · 已收入书页</span>}
    </section>
  )
}

// 添一笔：点开变成一根底线输入
function AddLine({ label, placeholder, onAdd }: {
  label: string
  placeholder: string
  onAdd: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const commit = () => {
    const name = v.trim()
    if (name) onAdd(name)
    setV('')
    setOpen(false)
  }
  if (!open) return <div className="bk-add" onClick={() => setOpen(true)}>{label}</div>
  return (
    <input
      className="bk-add-input"
      autoFocus
      value={v}
      placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setV(''); setOpen(false) }
      }}
      onBlur={commit}
    />
  )
}

// ─── 默认体例（恢复默认用）───────────────────────────────────────────────────

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

const DEFAULT_CHARACTER: CharacterState = {
  name: '',
  hp: { current: 10, max: 10 },
  currency: { name: '金币', amount: 0 },
  total_points: 20,
  attributes: {},
  inventory: [],
  status_effects: [],
  dice_config: { base_die: 10, current_die: 10, crit_success: 'max', crit_fail: 1 },
}

// ─── 目次 ────────────────────────────────────────────────────────────────────

function TocLeaf({ project, onDeleteChapter, onNewChapter, navigate }: {
  project: Project
  onDeleteChapter: (id: string, label: string) => void
  onNewChapter: () => void
  navigate: (path: string) => void
}) {
  // 后端 sessions 新在前，目次按旧在前排（第壹章在最上）
  const sessions = [...(project.sessions ?? [])].reverse()
  return (
    <Leaf title="目次" sub="章回">
      {sessions.length === 0 && <div className="bk-toc-empty">尚无章回 · 拉动丝带，自此开卷</div>}
      {sessions.map((s, i) => (
        <div className="bk-toc-row" key={s.id}>
          <button className="bk-toc-link" onClick={() => navigate(`/${s.id}`)}>
            <span className="bk-toc-ch">第{cnNum(i + 1)}章</span>
            <span className="bk-toc-title">{s.title || '未名之章'}</span>
            <span className="bk-toc-dots" />
            <span className="bk-toc-count">{s.message_count}</span>
          </button>
          <span className="bk-x" onClick={() => onDeleteChapter(s.id, s.title || `第${cnNum(i + 1)}章`)}>✕</span>
        </div>
      ))}
      <div className="bk-add" onClick={onNewChapter}>＋ 另起一章</div>
    </Leaf>
  )
}

// ─── 角色 ────────────────────────────────────────────────────────────────────

function CharacterLeaf({ projectId }: { projectId: string }) {
  const [cs, setCs] = useState<CharacterState | null>(null)
  const [dry, ink] = useInkDry()
  const timer = useRef<number>(0)

  useEffect(() => {
    fetchCharacterAPI(projectId)
      .then(s => setCs(s ?? DEFAULT_CHARACTER))
      .catch(() => setCs(DEFAULT_CHARACTER))
    return () => window.clearTimeout(timer.current)
  }, [projectId])

  const mutate = (patch: Partial<CharacterState>) => {
    setCs(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        saveCharacterAPI(projectId, next).then(ink).catch(() => {})
      }, 900)
      return next
    })
  }

  if (!cs) return <Leaf title="角色" sub="由你亲笔"><div className="bk-toc-empty">翻页中…</div></Leaf>

  const used = Object.values(cs.attributes).reduce((a, b) => a + b, 0)
  const left = cs.total_points - used
  const range = Math.max(4, ...Object.values(cs.attributes))

  return (
    <Leaf title="角色" sub="由你亲笔 · 故事亦会代记" inkDry={dry}>
      <Editable
        className="bk-char-name"
        value={cs.name}
        placeholder="角色名"
        onSave={name => mutate({ name })}
      />
      <div className="bk-char-vitals">
        <span>体力 <EditNum value={cs.hp.current} min={0} onSave={n => mutate({ hp: { ...cs.hp, current: n } })} />
          {' / '}<EditNum value={cs.hp.max} min={1} onSave={n => mutate({ hp: { ...cs.hp, max: n } })} /></span>
        <span>{cs.currency.name} <EditNum value={cs.currency.amount} onSave={n => mutate({ currency: { ...cs.currency, amount: n } })} /></span>
        <span>骰 <b style={{ cursor: 'default' }}>d{cs.dice_config.current_die}</b></span>
      </div>

      <div className="bk-points">
        点数 · 共 <EditNum value={cs.total_points} min={0} onSave={n => mutate({ total_points: n })} />
        {' · '}<span className={left < 0 ? 'over' : ''}>余 {left}</span>
      </div>

      <div className="bk-stats">
        {Object.entries(cs.attributes).map(([name, val]) => (
          <div className="bk-stat" key={name}>
            <span className="bk-stat-label">{name}</span>
            <span className="bk-stat-track">
              <span className="bk-stat-dot" style={{ left: `${(8 + (val / range) * 84).toFixed(1)}%` }} />
            </span>
            <span className="bk-stat-btn" onClick={() => {
              if (val > 0) mutate({ attributes: { ...cs.attributes, [name]: val - 1 } })
            }}>−</span>
            <span className="bk-stat-val">{val > 0 ? `+${val}` : val}</span>
            <span className="bk-stat-btn" onClick={() => mutate({ attributes: { ...cs.attributes, [name]: val + 1 } })}>＋</span>
            <span className="bk-x" onClick={() => {
              const next = { ...cs.attributes }
              delete next[name]
              mutate({ attributes: next })
            }}>✕</span>
          </div>
        ))}
      </div>
      <AddLine label="＋ 添一项属性" placeholder="属性名，回车落笔"
        onAdd={name => { if (!(name in cs.attributes)) mutate({ attributes: { ...cs.attributes, [name]: 0 } }) }} />

      <div className="bk-pack">
        <div className="bk-pack-title">行囊</div>
        {cs.inventory.map((item, idx) => (
          <div className="bk-pack-item" key={idx}>
            <span className="bk-pack-text">
              {item.name}
              {item.description && ` · ${item.description}`}
              {item.stat_bonus && Object.keys(item.stat_bonus).length > 0 && (
                <span className="bk-pack-bonus">
                  {Object.entries(item.stat_bonus).map(([k, v]) => `${k}+${v}`).join(' ')}
                </span>
              )}
            </span>
            <span className="bk-x" onClick={() => {
              const next = [...cs.inventory]
              next.splice(idx, 1)
              mutate({ inventory: next })
            }}>✕</span>
          </div>
        ))}
        <AddLine label="＋ 收入一物" placeholder="物品名，回车收入行囊"
          onAdd={name => mutate({ inventory: [...cs.inventory, { name, stat_bonus: null }] })} />
      </div>

      {cs.status_effects.length > 0 && (
        <div className="bk-char-note">状态 · {cs.status_effects.join('、')}</div>
      )}
      <div className="bk-char-note">此页可亲笔修改 · 故事进行时也会自动更新</div>
    </Leaf>
  )
}

// ─── 人物志 & 札记 ───────────────────────────────────────────────────────────

const NOTE_LABEL: Record<string, string> = {
  foreshadow: '伏笔', event: '节点', goal: '目标', scene: '场景', loot: '拾获',
}

function RosterLeaf({ notes, onDelete }: { notes: ProjectNote[]; onDelete: (id: string) => void }) {
  const npcs = notes.filter(n => n.note_type === 'npc')
  return (
    <Leaf title="人物志" sub="由故事自动收录">
      {npcs.length === 0 && <div className="bk-toc-empty">尚无人物登场</div>}
      {npcs.map(n => {
        const [name, ...rest] = n.content.split('｜')
        const bio = rest.join('｜')
        return (
          <div className="bk-npc" data-hue={npcHue(name)} key={n.id}>
            <NpcSeal name={name} size={24} />
            <div className="bk-npc-body">
              <span className="bk-npc-name">{name}</span>
              <span className="bk-npc-debut">初登场 · 第{cnNum(n.chapter)}章</span>
              {bio && <div className="bk-npc-bio">{bio}</div>}
            </div>
            <span className="bk-x" onClick={() => onDelete(n.id)}>✕</span>
          </div>
        )
      })}
      <div className="bk-roster-note">玩得越久，人物志越厚</div>
    </Leaf>
  )
}

function NotesLeaf({ notes, onDelete }: { notes: ProjectNote[]; onDelete: (id: string) => void }) {
  const rest = notes.filter(n => n.note_type !== 'npc')
  return (
    <Leaf title="札记" sub="书后批注 · 由故事落笔">
      {rest.length === 0 && <div className="bk-toc-empty">故事尚未落下批注</div>}
      {rest.map(n => (
        <div className={'bk-note' + (n.note_type === 'foreshadow' ? ' fore' : '')} key={n.id}>
          <span className="bk-note-type">{NOTE_LABEL[n.note_type] ?? '批注'}</span>
          <span className="bk-note-text">{n.content}</span>
          <span className="bk-note-ch">第{cnNum(n.chapter)}章</span>
          <span className="bk-x" onClick={() => onDelete(n.id)}>✕</span>
        </div>
      ))}
    </Leaf>
  )
}

// ─── 档案 ────────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = { core: '核心', reference: '参考' }

function FilesLeaf({ project, onCreate, onUpdate, onDelete, flash, ask }: {
  project: Project
  onCreate: (projectId: string, data: { name: string; content: string; file_type?: string }) => Promise<ProjectFile>
  onUpdate: (projectId: string, fileId: string, data: Partial<ProjectFile>) => Promise<void>
  onDelete: (projectId: string, fileId: string) => Promise<void>
  flash: (msg: string) => void
  ask: (text: string, act: () => void | Promise<void>) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [dry, ink] = useInkDry()
  const picker = useRef<HTMLInputElement>(null)
  const files = project.files ?? []

  const upload = async (f: File) => {
    try {
      const content = await parseFileToText(f)
      const ext = f.name.split('.').pop()?.toLowerCase() ?? 'txt'
      await onCreate(project.id, { name: f.name.replace(/\.[^.]+$/, ''), content, file_type: ext })
      flash('已夹入书页')
    } catch (err) {
      flash(err instanceof UnsupportedFormatError ? '这一页的格式，书认不得' : '夹入失败了')
    }
  }

  return (
    <Leaf title="档案" sub="夹存的散页 · 核心全文入卷，参考按需检索" inkDry={dry}>
      {files.map((f, i) => {
        if (openId === f.id) {
          return (
            <div className="bk-sheet open" key={f.id}>
              <Editable className="bk-sheet-name" value={f.name} placeholder="散页名" required
                onSave={name => onUpdate(project.id, f.id, { name }).then(ink)} />
              <div className="bk-sheet-meta">
                <span className={'pri' + (f.priority === 'core' ? ' on' : '')}
                  onClick={() => onUpdate(project.id, f.id, { priority: 'core' })}>核心</span>
                <span className={'pri' + (f.priority !== 'core' ? ' on' : '')}
                  onClick={() => onUpdate(project.id, f.id, { priority: 'reference' })}>参考</span>
                <span>{f.content.length} 字</span>
              </div>
              <Editable multiline className="bk-sheet-body" value={f.content} placeholder="此页尚空，可直接书写…"
                onSave={content => onUpdate(project.id, f.id, { content }).then(ink)} />
              <div className="bk-sheet-acts">
                <span onClick={() => setOpenId(null)}>合上此页</span>
                <span className="danger" onClick={() => ask(`将「${f.name}」从档案中撤下？`, async () => {
                  await onDelete(project.id, f.id)
                  setOpenId(null)
                })}>撤下此页</span>
              </div>
            </div>
          )
        }
        return (
          <div className={'bk-sheet ' + (i % 2 ? 'tilt-r' : 'tilt-l')} key={f.id} onClick={() => setOpenId(f.id)}>
            <div className="bk-sheet-name">{f.name}</div>
            <div className="bk-sheet-meta">
              <span>{PRIORITY_LABEL[f.priority] ?? f.priority} · {f.content.length} 字</span>
            </div>
          </div>
        )
      })}
      <div className="bk-add-row">
        <div className="bk-add" onClick={() => picker.current?.click()}>＋ 夹入一页 · 上传</div>
        <div className="bk-add" onClick={async () => {
          const nf = await onCreate(project.id, { name: '未名散页', content: '' })
          setOpenId(nf.id)
        }}>＋ 手书一页</div>
      </div>
      <input
        ref={picker} type="file" hidden
        accept=".txt,.md,.markdown,.csv,.pdf,.docx,.xlsx,.json"
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) upload(f)
        }}
      />
    </Leaf>
  )
}

// ─── 封面 ────────────────────────────────────────────────────────────────────

function Emblem() {
  return (
    <svg className="bk-emblem" viewBox="0 0 340 340" fill="none" stroke="currentColor" strokeWidth="0.6">
      <circle cx="170" cy="170" r="150" opacity="0.55" />
      <circle cx="170" cy="170" r="118" opacity="0.35" />
      <circle cx="170" cy="170" r="60" opacity="0.3" />
      <line x1="170" y1="14" x2="170" y2="46" opacity="0.5" />
      <line x1="170" y1="294" x2="170" y2="326" opacity="0.5" />
      <line x1="14" y1="170" x2="46" y2="170" opacity="0.5" />
      <line x1="294" y1="170" x2="326" y2="170" opacity="0.5" />
      <path d="M 170 52 A 118 118 0 0 1 288 170" opacity="0.5" strokeDasharray="1 7" />
      <circle cx="253" cy="87" r="2" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="105" cy="248" r="1.4" fill="currentColor" stroke="none" opacity="0.45" />
    </svg>
  )
}

// ─── 页面本体 ────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const {
    currentProject, fetchProject, updateProject, deleteProject,
    createSession, createFile, updateFile, deleteFile,
  } = useProjectStore()

  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [opened, setOpened] = useState(false)
  const [pulled, setPulled] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ text: string; act: () => void | Promise<void> } | null>(null)
  const [coverDry, coverInk] = useInkDry()
  const [ruleDry, ruleInk] = useInkDry()
  const [worldDry, worldInk] = useInkDry()
  const rootRef = useRef<HTMLDivElement>(null)
  const flashT = useRef<number>(0)

  const theme = localStorage.getItem('reverie_night') === '1' ? 'sea' : 'paper'

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      fetchProject(projectId),
      fetchNotesAPI(projectId).then(setNotes).catch(() => {}),
    ]).finally(() => setLoading(false))
    return () => window.clearTimeout(flashT.current)
  }, [projectId, fetchProject])

  useEffect(() => {
    if (!loading) requestAnimationFrame(() => requestAnimationFrame(() => setOpened(true)))
  }, [loading])

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(flashT.current)
    flashT.current = window.setTimeout(() => setToast(null), 1400)
  }, [])

  const ask = useCallback((text: string, act: () => void | Promise<void>) => {
    setConfirm({ text, act })
  }, [])

  if (loading) {
    return (
      <div className="book-root" data-book-theme={theme}>
        <div className="bk-toast on">开卷中…</div>
      </div>
    )
  }

  const project = currentProject
  if (!project || !projectId) {
    return (
      <div className="book-root" data-book-theme={theme}>
        <div className="bk-toast on" style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => navigate('/projects')}>
          此卷不存 · 回书架
        </div>
      </div>
    )
  }

  const sessions = project.sessions ?? []
  const archived = project.status === 'archived'

  const pullRibbon = async () => {
    if (pulled) return
    setPulled(true)
    setToast(sessions.length ? `回到故事 · 第${cnNum(sessions.length)}章` : '开卷 · 第壹章')
    try {
      // sessions 新在前，[0] 即最新一章
      const target = sessions.length
        ? sessions[0].id
        : await createSession(projectId)
      setTimeout(() => navigate(`/${target}`), 800)
    } catch {
      setPulled(false)
      flash('丝带断了，再试一次')
    }
  }

  const renameCover = () => {
    const el = rootRef.current?.querySelector<HTMLElement>('.bk-cover-title')
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    const r = document.createRange()
    r.selectNodeContents(el)
    sel?.removeAllRanges()
    sel?.addRange(r)
  }

  const deleteNote = async (noteId: string) => {
    try {
      await deleteNoteAPI(projectId, noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch { flash('勾销失败了') }
  }

  return (
    <div className={'book-root' + (opened ? ' opened' : '')} data-book-theme={theme} ref={rootRef}>
      <button className="bk-back" onClick={() => navigate('/projects')}>‹ 书架</button>

      <div className="bk-stage">
        {/* ═══ 封面 ═══ */}
        <section className="bk-cover">
          <Emblem />

          <div className={'bk-ribbon' + (pulled ? ' pulled' : '')} onClick={pullRibbon} title="回到故事">
            <div className="bk-ribbon-silk" />
            <div className="bk-ribbon-text">{sessions.length ? '继续冒险' : '自此开卷'}</div>
          </div>

          <div className="bk-vol bk-ink-in">{archived ? '藏卷 · 已归档' : '剧 本'}</div>
          <Editable
            className="bk-cover-title bk-ink-in"
            value={project.title}
            placeholder="无题"
            required
            onSave={title => updateProject(projectId, { title }).then(coverInk)}
          />
          <Editable
            className="bk-cover-tagline bk-ink-in"
            value={project.tagline ?? ''}
            placeholder="落一句题词"
            onSave={tagline => updateProject(projectId, { tagline }).then(coverInk)}
          />
          <div className="bk-cover-progress bk-ink-in">
            {sessions.length ? `已行至 · 第${cnNum(sessions.length)}章` : '尚未开卷'}
          </div>

          <span className={'bk-ink-dry bk-cover-dry' + (coverDry ? ' on' : '')}>墨迹阴干 · 已收入书页</span>
          <div className="bk-scroll-hint">翻开卷首</div>
          <div className="bk-margin-notes">
            <span onClick={renameCover}>重命名</span>
            <span onClick={async () => {
              await updateProject(projectId, { status: archived ? 'active' : 'archived' })
              flash(archived ? '已启封' : '已归档入藏')
            }}>{archived ? '启封' : '归档'}</span>
            <span className="danger" onClick={() => ask(`将「${project.title}」整卷删去？此举不可回返。`, async () => {
              await deleteProject(projectId)
              navigate('/projects')
            })}>删除</span>
          </div>
        </section>

        {/* ═══ 卷首 ═══ */}
        <div className="bk-front">
          <TocLeaf
            project={project}
            navigate={navigate}
            onNewChapter={async () => {
              await createSession(projectId)
              flash('已另起一章')
            }}
            onDeleteChapter={(id, label) => ask(`将「${label}」从目次中撕去？对话将一并散佚。`, async () => {
              await deleteSessionAPI(id)
              await fetchProject(projectId)
            })}
          />

          <Leaf title="凡例" sub="此卷之约 · 行为格式" inkDry={ruleDry}>
            <CollapsibleProse
              value={project.format_rules ?? ''}
              placeholder="此卷体例，可在此手书…"
              onSave={format_rules => updateProject(projectId, { format_rules }).then(ruleInk)}
            />
            <div className="bk-add" onClick={() => ask('以默认体例覆写此卷凡例？', async () => {
              await updateProject(projectId, { format_rules: DEFAULT_FORMAT_RULES })
              ruleInk()
            })}>恢复默认体例</div>
          </Leaf>

          <Leaf title="世界观" sub="序" inkDry={worldDry}>
            <CollapsibleProse
              value={project.system_prompt ?? ''}
              placeholder="写下这个世界的开端…"
              onSave={system_prompt => updateProject(projectId, { system_prompt }).then(worldInk)}
            />
          </Leaf>

          <CharacterLeaf projectId={projectId} />

          <RosterLeaf notes={notes} onDelete={id => ask('将这位人物从名册中勾销？', () => deleteNote(id))} />

          <NotesLeaf notes={notes} onDelete={id => ask('勾销这条批注？', () => deleteNote(id))} />

          <FilesLeaf
            project={project}
            onCreate={createFile}
            onUpdate={updateFile}
            onDelete={deleteFile}
            flash={flash}
            ask={ask}
          />

          <div className="bk-colophon">— 卷首毕 —</div>
        </div>
      </div>

      {toast && <div className="bk-toast on">{toast}</div>}

      {confirm && (
        <div className="bk-veil" onClick={() => setConfirm(null)}>
          <div className="bk-confirm" onClick={e => e.stopPropagation()}>
            <div className="bk-confirm-text">{confirm.text}</div>
            <div className="bk-confirm-acts">
              <span onClick={() => setConfirm(null)}>作罢</span>
              <span className="danger" onClick={async () => {
                try { await confirm.act() } catch { flash('这一笔没落成') }
                setConfirm(null)
              }}>照办</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
