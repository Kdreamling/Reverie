import { useEffect, useState } from 'react'
import './rp.css'
import { fetchNotesAPI, type CharacterState, type ProjectNote } from '../../api/projects'
import { NpcSeal } from './RpBlocks'

interface RpStatusStripProps {
  state: CharacterState
  projectId: string
  mode: 'ttrpg' | 'novel'
  onToggleMode: () => void
}

const NOTE_LABEL: Record<string, string> = { event: '事件', foreshadow: '伏笔' }

function splitNpc(content: string): { name: string; bio: string } {
  const i = content.indexOf('｜')
  if (i < 0) return { name: content, bio: '' }
  return { name: content.slice(0, i), bio: content.slice(i + 1) }
}

export default function RpStatusStrip({ state, projectId, mode, onToggleMode }: RpStatusStripProps) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<ProjectNote[] | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchNotesAPI(projectId)
      .then(list => { if (!cancelled) setNotes(list) })
      .catch(() => { if (!cancelled) setNotes([]) })
    return () => { cancelled = true }
  }, [open, projectId])

  const hpPct = state.hp.max > 0
    ? Math.max(0, Math.min(100, (state.hp.current / state.hp.max) * 100))
    : 0
  const attrs = Object.entries(state.attributes)
  const attrMax = Math.max(10, ...attrs.map(([, v]) => v))

  const loaded = notes ?? []
  const npcs = loaded.filter(n => n.note_type === 'npc').map(n => ({ id: n.id, ...splitNpc(n.content) }))
  const goals = loaded.filter(n => n.note_type === 'goal')
  const journal = loaded.filter(n => n.note_type === 'event' || n.note_type === 'foreshadow').slice(0, 8)

  return (
    <div className={`rp-strip${open ? ' open' : ''}`}>
      <div className="rp-strip-inner" onClick={() => setOpen(v => !v)}>
        <span className="rp-strip-name">{state.name}</span>
        <div className="rp-hp-block">
          <div className="rp-hp-label"><span>HP</span><span>{state.hp.current} / {state.hp.max}</span></div>
          <div className="rp-hp-track"><div className="rp-hp-fill" style={{ width: `${hpPct}%` }} /></div>
        </div>
        <span className="rp-stat-item">{state.currency.name}<b>{state.currency.amount}</b></span>
        <span className="rp-stat-item"><b>d{state.dice_config.current_die}</b></span>
        <button
          className="rp-mode-btn"
          title={mode === 'ttrpg' ? '隐藏检定与状态注记，只看故事' : '显示检定与状态注记'}
          onClick={e => { e.stopPropagation(); onToggleMode() }}
        >
          {mode === 'ttrpg' ? '跑团' : '叙事'}
        </button>
        <svg className="rp-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="rp-char-drawer">
        <div className="rp-char-inner" onClick={e => e.stopPropagation()}>

          <div className="rp-char-section">
            <div className="rp-sec-label">属 性</div>
            {attrs.map(([k, v]) => (
              <div className="rp-attr-row" key={k}>
                <span className="k">{k}</span>
                <div className="track"><div className="fill" style={{ width: `${(v / attrMax) * 100}%` }} /></div>
                <span className="v">{v}</span>
              </div>
            ))}
            {state.status_effects.length > 0 && (
              <div className="rp-inv-chips" style={{ marginTop: 10 }}>
                {state.status_effects.map((s, i) => <span key={i} className="rp-inv-chip cursed">{s}</span>)}
              </div>
            )}
          </div>

          {state.inventory.length > 0 && (
            <div className="rp-char-section">
              <div className="rp-sec-label">随 身</div>
              <div className="rp-inv-chips">
                {state.inventory.map((it, i) => (
                  <span key={i} className="rp-inv-chip" title={it.description || undefined}>
                    {it.name}
                    {it.stat_bonus && Object.entries(it.stat_bonus).map(([k, v]) => ` ${k}+${v}`).join('')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {goals.length > 0 && (
            <div className="rp-char-section">
              <div className="rp-sec-label">目 标</div>
              {goals.map(g => <div key={g.id} className="rp-note-row">{g.content}</div>)}
            </div>
          )}

          {npcs.length > 0 && (
            <div className="rp-char-section">
              <div className="rp-sec-label">名 册</div>
              {npcs.map(n => (
                <div key={n.id} className="rp-roster-row">
                  <NpcSeal name={n.name} size={18} />
                  <span className="rp-roster-name">{n.name}</span>
                  <span className="rp-roster-bio">{n.bio}</span>
                </div>
              ))}
            </div>
          )}

          {journal.length > 0 && (
            <div className="rp-char-section">
              <div className="rp-sec-label">笔 记</div>
              {journal.map(n => (
                <div key={n.id} className="rp-note-row">
                  <span className="rp-note-tag">{NOTE_LABEL[n.note_type] ?? n.note_type}</span>
                  {n.content}
                </div>
              ))}
            </div>
          )}

          {open && notes === null && <div className="rp-drawer-hint">读取中…</div>}
          {notes !== null && goals.length + npcs.length + journal.length === 0 && (
            <div className="rp-drawer-hint">故事刚开始，名册和笔记还是空的</div>
          )}
        </div>
      </div>
    </div>
  )
}
