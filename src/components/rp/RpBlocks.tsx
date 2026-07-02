import { useEffect, useState, type ReactNode } from 'react'
import './rp.css'
import {
  npcSealStrokes, npcHue,
  type RpEvent, type RpStateChange, type RpNpcEvent, type RpSceneEvent, type RpNoteEvent,
} from './rpEvents'

// ─── 行内强调：*斜体* / **加粗**（RP 叙事不走全量 markdown） ──────────────────

export function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>
    return p
  })
}

// ─── NPC 纹章 ────────────────────────────────────────────────────────────────

export function NpcSeal({ name, size }: { name: string; size: number }) {
  const { lines, dot } = npcSealStrokes(name)
  return (
    <svg
      className="rp-npc-seal" width={size} height={size} viewBox="0 0 18 18"
      fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round"
    >
      <circle cx="9" cy="9" r="8.1" opacity="0.45" />
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} />
      ))}
      {dot && <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />}
    </svg>
  )
}

// ─── NPC 台词块：登场版（带 bio 铭牌）/ 回归版（mini 铭牌） ────────────────────

export function NpcBlock({ name, speech, bio }: { name: string; speech?: string; bio?: string }) {
  return (
    <div className="rp-npc rp-node" data-hue={npcHue(name)}>
      {bio ? (
        <div className="rp-plate-full">
          <NpcSeal name={name} size={26} />
          <div className="rp-plate-text">
            <span className="rp-npc-name">{name}</span>
            <span className="rp-npc-desc">{bio}</span>
          </div>
        </div>
      ) : (
        <div className="rp-plate-mini">
          <NpcSeal name={name} size={15} />
          <span className="rp-npc-name">{name}</span>
        </div>
      )}
      {speech && <div className="rp-speech">{renderInline(speech)}</div>}
    </div>
  )
}

// ─── 旁白：无署名，点按浮现时间 ───────────────────────────────────────────────

export function Narration({ paragraphs, ts }: { paragraphs: string[]; ts?: string }) {
  const [tsOn, setTsOn] = useState(false)
  return (
    <div
      className={`rp-narration rp-node${tsOn ? ' ts-on' : ''}`}
      onClick={() => ts && setTsOn(v => !v)}
    >
      {paragraphs.map((p, i) => <p key={i}>{renderInline(p)}</p>)}
      {ts && <span className="rp-ts">{ts}</span>}
    </div>
  )
}

// ─── 场景铭牌：CRT 开机 ──────────────────────────────────────────────────────

const TIME_LABEL: Record<string, string> = { day: '昼', dusk: '暮', night: '夜' }

function PhaseIcon({ time }: { time: string }) {
  if (time === 'night') {
    return <svg className="rp-phase" width="11" height="11" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="currentColor" /></svg>
  }
  if (time === 'dusk') {
    return (
      <svg className="rp-phase" width="11" height="11" viewBox="0 0 12 12">
        <path d="M6 1a5 5 0 000 10z" fill="currentColor" />
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    )
  }
  if (time === 'day') {
    return <svg className="rp-phase" width="11" height="11" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
  }
  return null
}

export function SceneSlate({ location, time, note }: { location: string; time: string; note?: string }) {
  const [on, setOn] = useState(false)
  const [k, setK] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 350)
    return () => clearTimeout(t)
  }, [])
  const label = TIME_LABEL[time]
  return (
    <div
      className={`rp-slugline rp-node${on ? ' crt' : ''}`}
      onClick={() => setK(v => v + 1)}
      title={note || undefined}
    >
      <div className="rp-slug-core" key={k}>
        <span className="rp-slug-text">
          <PhaseIcon time={time} />
          <span>{location}{label ? ` · ${label}` : ''}</span>
        </span>
        <span className="rp-scan" />
      </div>
    </div>
  )
}

// ─── 注记：轴上挑出去的天体标注 ───────────────────────────────────────────────

export function Callout({ side, text, ttrpgOnly = true }: { side: 'left' | 'right'; text: string; ttrpgOnly?: boolean }) {
  return (
    <div className={`rp-callout rp-node ${side}${ttrpgOnly ? ' ttrpg-only' : ''}`}>
      <span className="rp-c-dot" /><span className="rp-c-line" /><span className="rp-c-txt">{text}</span>
    </div>
  )
}

export function stateChangeText(c: RpStateChange): string {
  if (c.field === '物品') return `${c.op === '-' ? '失去' : '获得'} · ${c.value}`
  if (c.field === '属性') return `${c.attribute} ${c.op}${c.value}${c.now !== undefined ? ` · ${c.now}` : ''}`
  if (c.field === '骰子') return `骰子 → d${c.value}`
  if (c.field === 'HP') return `HP ${c.op}${c.value}${c.now !== undefined ? ` · ${c.now}` : ''}`
  return `${c.field} ${c.op}${c.value}${c.now !== undefined ? ` · 共 ${c.now}` : ''}`
}

// ─── 事件节点分发（检定环由 RpMessage 单独装配，这里不处理 rp_check_pending） ──

export function RpEventNode({ event, flip = false }: { event: RpEvent; flip?: boolean }) {
  switch (event.type) {
    case 'rp_scene': {
      const e = event as RpSceneEvent
      return <SceneSlate location={e.location} time={e.time} note={e.note} />
    }
    case 'rp_npc': {
      const e = event as RpNpcEvent
      return <NpcBlock name={e.name} bio={e.bio} />
    }
    case 'rp_note': {
      const e = event as RpNoteEvent
      return <Callout side={flip ? 'left' : 'right'} text={`${e.note_type} · ${e.content}`} />
    }
    case 'rp_state_changed':
      return (
        <>
          {event.changes.map((c, i) => (
            <Callout key={i} side={(i + (flip ? 1 : 0)) % 2 === 0 ? 'right' : 'left'} text={stateChangeText(c)} />
          ))}
        </>
      )
    default:
      return null
  }
}
