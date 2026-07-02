import { Fragment, useMemo } from 'react'
import type { ChatMessage } from '../../api/chat'
import CheckRing, { type RingResult } from './CheckRing'
import { Callout, Narration, NpcBlock, RpEventNode } from './RpBlocks'
import {
  isRollResultMessage, parseFreeRollMessage, parseNarrative,
  type RollOutcome, type RpCheckPendingEvent, type RpEvent,
} from './rpEvents'

function hhmm(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── 用户消息 ────────────────────────────────────────────────────────────────

function RpUserMessage({ msg, characterName }: { msg: ChatMessage; characterName?: string }) {
  const text = msg.content.trim()
  // 掷骰结果由检定环的定格态呈现，时间线上不重复出现
  if (isRollResultMessage(text)) return null
  const freeRoll = parseFreeRollMessage(text)
  if (freeRoll) {
    return <Callout side="right" text={`自由投骰 · d${freeRoll.die} → ${freeRoll.roll}`} />
  }
  return (
    <div className="rp-user-msg rp-node">
      <div className="rp-meta">
        {characterName || 'Dream'} · {hhmm(msg.created_at)}
        {msg.failed && <span style={{ color: 'var(--rp-danger)' }}> · 发送失败</span>}
      </div>
      <div className="rp-bubble">{text}</div>
    </div>
  )
}

// ─── 助手消息：正文按 text_offset 切段，事件节点插回原位 ───────────────────────

type Node =
  | { t: 'narration'; paragraphs: string[] }
  | { t: 'npc'; name: string; speech?: string; bio?: string }
  | { t: 'check'; event: RpCheckPendingEvent }
  | { t: 'event'; event: RpEvent }

function buildNodes(content: string, events: RpEvent[]): Node[] {
  const sorted = [...events].sort(
    (a, b) => (a.text_offset ?? Infinity) - (b.text_offset ?? Infinity),
  )
  const nodes: Node[] = []
  let cursor = 0

  const pushText = (text: string) => {
    for (const b of parseNarrative(text)) {
      if (b.kind === 'npc') nodes.push({ t: 'npc', name: b.name, speech: b.speech })
      else nodes.push({ t: 'narration', paragraphs: b.paragraphs })
    }
  }

  for (const ev of sorted) {
    const off = Math.min(Math.max(ev.text_offset ?? content.length, cursor), content.length)
    if (off > cursor) pushText(content.slice(cursor, off))
    cursor = off
    if (ev.type === 'rp_check_pending') nodes.push({ t: 'check', event: ev })
    else nodes.push({ t: 'event', event: ev })
  }
  if (cursor < content.length) pushText(content.slice(cursor))

  // NPC 登场事件并进同名台词块成登场特写。按整条消息认领而非相邻判定——
  // text_offset 落在段落中间时事件和台词块不相邻，会退化成 mini 铭牌
  const bios = new Map<string, string>()
  const spoken = new Set<string>()
  for (const n of nodes) {
    if (n.t === 'event' && n.event.type === 'rp_npc') bios.set(n.event.name, n.event.bio)
    if (n.t === 'npc') spoken.add(n.name)
  }
  const merged: Node[] = []
  for (const n of nodes) {
    if (n.t === 'event' && n.event.type === 'rp_npc' && spoken.has(n.event.name)) continue
    if (n.t === 'npc' && bios.has(n.name)) {
      merged.push({ ...n, bio: bios.get(n.name) })
      bios.delete(n.name)
      continue
    }
    merged.push(n)
  }
  return merged
}

interface RpAssistantProps {
  msg: ChatMessage
  /** 当前可掷的检定 id（character_state.pending_check） */
  pendingCheckId?: string | null
  /** 已掷检定：checkId → 结果（从后续 [检定结果] 消息解析） */
  resolvedChecks?: Map<string, RollOutcome>
  onRoll?: (checkId: string) => Promise<RingResult>
  onSettled?: (checkId: string, r: RingResult) => void
}

function RpAssistantMessage({ msg, pendingCheckId, resolvedChecks, onRoll, onSettled }: RpAssistantProps) {
  const nodes = useMemo(
    () => buildNodes(msg.content, msg.rpEvents ?? []),
    [msg.content, msg.rpEvents],
  )
  const ts = hhmm(msg.created_at)
  let calloutFlip = false

  return (
    <>
      {nodes.map((node, i) => {
        switch (node.t) {
          case 'narration':
            return <Narration key={i} paragraphs={node.paragraphs} ts={ts} />
          case 'npc':
            return <NpcBlock key={i} name={node.name} speech={node.speech} bio={node.bio} />
          case 'check': {
            const ev = node.event
            return (
              <CheckRing
                key={ev.id}
                action={ev.action}
                attribute={ev.attribute}
                target={ev.target}
                die={ev.die}
                bonus={(ev.attr_value ?? 0) + (ev.equip_bonus ?? 0)}
                successRate={ev.success_rate}
                result={resolvedChecks?.get(ev.id) ?? null}
                interactive={pendingCheckId === ev.id}
                onRoll={onRoll ? () => onRoll(ev.id) : undefined}
                onSettled={onSettled ? r => onSettled(ev.id, r) : undefined}
              />
            )
          }
          case 'event': {
            const flip = calloutFlip
            if (node.event.type === 'rp_note' || node.event.type === 'rp_state_changed') calloutFlip = !calloutFlip
            return <Fragment key={i}><RpEventNode event={node.event} flip={flip} /></Fragment>
          }
        }
      })}
    </>
  )
}

// ─── 入口 ────────────────────────────────────────────────────────────────────

export default function RpMessage(props: RpAssistantProps & { characterName?: string }) {
  const { msg, characterName, ...rest } = props
  if (msg.role === 'user') return <RpUserMessage msg={msg} characterName={characterName} />
  if (msg.role === 'assistant') return <RpAssistantMessage msg={msg} {...rest} />
  return null
}
