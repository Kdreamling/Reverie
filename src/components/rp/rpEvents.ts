// RP 机制事件：后端工具调用产生的 SSE 事件 / memory_ops 记录。
// text_offset 是事件落点在正文里的字符偏移，刷新重建时靠它把节点插回原位。

export interface RpCheckPendingEvent {
  type: 'rp_check_pending'
  id: string
  attribute: string
  target: number
  action: string
  attr_value: number
  equip_bonus: number
  die: number
  success_rate?: number
  text_offset?: number
}

export interface RpStateChange {
  field: string
  op: string
  value: number | string
  now?: number | string
  attribute?: string
  note?: string
}

export interface RpStateChangedEvent {
  type: 'rp_state_changed'
  changes: RpStateChange[]
  hp?: { current: number; max: number }
  currency?: { name: string; amount: number }
  text_offset?: number
}

export interface RpSceneEvent {
  type: 'rp_scene'
  location: string
  time: string
  note?: string
  text_offset?: number
}

export interface RpNpcEvent {
  type: 'rp_npc'
  name: string
  bio: string
  is_new?: boolean
  text_offset?: number
}

export interface RpNoteEvent {
  type: 'rp_note'
  note_type: string
  content: string
  text_offset?: number
}

export type RpEvent =
  | RpCheckPendingEvent
  | RpStateChangedEvent
  | RpSceneEvent
  | RpNpcEvent
  | RpNoteEvent

export function isRpEventType(type: string | undefined): boolean {
  return typeof type === 'string' && type.startsWith('rp_')
}

// ─── 掷骰结果 ────────────────────────────────────────────────────────────────

export interface RollOutcome {
  action: string
  attribute: string
  die: number
  roll: number
  bonus: number
  total: number
  target: number
  success: boolean
  critical: 'success' | 'fail' | null
}

export function outcomeLabel(o: Pick<RollOutcome, 'success' | 'critical'>): string {
  if (o.critical === 'success') return '大成功'
  if (o.critical === 'fail') return '大失败'
  return o.success ? '成功' : '失败'
}

/** 掷骰后系统代 Dream 发出的续写消息。后端 RP_MECHANICS_GUIDE 约定以「[检定结果：」开头 */
export function formatRollResultMessage(o: RollOutcome): string {
  return `[检定结果：${o.action}｜${o.attribute} d${o.die}=${o.roll}+${o.bonus}=${o.total} vs 难度${o.target} → ${outcomeLabel(o)}]`
}

const ROLL_RESULT_RE = /^\[检定结果：(.*?)｜(.+?) d(\d+)=(\d+)\+(\d+)=(\d+) vs 难度(\d+) → (大成功|大失败|成功|失败)\]$/

export function parseRollResultMessage(text: string): RollOutcome | null {
  const m = text.trim().match(ROLL_RESULT_RE)
  if (!m) return null
  const label = m[8]
  return {
    action: m[1],
    attribute: m[2],
    die: parseInt(m[3]),
    roll: parseInt(m[4]),
    bonus: parseInt(m[5]),
    total: parseInt(m[6]),
    target: parseInt(m[7]),
    success: label === '成功' || label === '大成功',
    critical: label === '大成功' ? 'success' : label === '大失败' ? 'fail' : null,
  }
}

export function isRollResultMessage(text: string): boolean {
  return text.trim().startsWith('[检定结果：')
}

const FREE_ROLL_RE = /^\[自由投骰：d(\d+)\s*=\s*(\d+)\]$/

export function parseFreeRollMessage(text: string): { die: number; roll: number } | null {
  const m = text.trim().match(FREE_ROLL_RE)
  if (!m) return null
  return { die: parseInt(m[1]), roll: parseInt(m[2]) }
}

// ─── 成功率（镜像后端 _rp_success_rate：骰面最大值必成，1 必败） ──────────────

export function computeSuccessRate(die: number, bonus: number, target: number): number {
  let wins = 0
  for (let r = 1; r <= die; r++) {
    if (r === die) wins++
    else if (r === 1) continue
    else if (r + bonus >= target) wins++
  }
  return Math.round((wins / die) * 100) / 100
}

export function difficultyLabel(target: number): string {
  if (target <= 6) return '简单'
  if (target <= 9) return '普通'
  if (target <= 13) return '困难'
  return '极难'
}

// ─── 叙事文本分块：旁白段落 / 【名字】NPC 台词 ────────────────────────────────

export type NarrativeBlock =
  | { kind: 'narration'; paragraphs: string[] }
  | { kind: 'npc'; name: string; speech: string }

const NPC_LINE_RE = /^【(.+?)】([\s\S]*)$/

export function parseNarrative(text: string): NarrativeBlock[] {
  const blocks: NarrativeBlock[] = []
  let narrationBuf: string[] = []

  const flushNarration = () => {
    if (narrationBuf.length) {
      blocks.push({ kind: 'narration', paragraphs: narrationBuf })
      narrationBuf = []
    }
  }

  for (const para of text.split(/\n+/)) {
    const p = para.trim()
    if (!p) continue
    const m = p.match(NPC_LINE_RE)
    if (m) {
      flushNarration()
      blocks.push({ kind: 'npc', name: m[1].trim(), speech: m[2].trim() })
    } else {
      narrationBuf.push(p)
    }
  }
  flushNarration()
  return blocks
}

// ─── NPC 纹章：按名字哈希生成的线条印记（与 mockup v3 同算法） ─────────────────

export function npcSealStrokes(name: string): { lines: [number, number, number, number][]; dot: boolean } {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const pts: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 - Math.PI / 2
    pts.push([9 + 6.6 * Math.cos(a), 9 + 6.6 * Math.sin(a)])
  }
  const lines: [number, number, number, number][] = []
  let hh = h
  for (let k = 0; k < 4; k++) {
    const a = hh % 8
    hh = (hh >> 3) ^ (h + k * 97)
    const b = (a + 2 + (hh % 5)) % 8
    hh = (hh >> 2) ^ h
    lines.push([pts[a][0], pts[a][1], pts[b][0], pts[b][1]])
  }
  return { lines, dot: h % 3 === 0 }
}

export function npcHue(name: string): 1 | 2 {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ((h % 2) + 1) as 1 | 2
}
