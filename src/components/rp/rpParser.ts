import type { CharacterState } from '../../api/projects'

export type RpBlockType = 'narration' | 'npc_dialogue' | 'check' | 'status_change' | 'dice_upgrade' | 'note' | 'text'

export interface RpBlock {
  type: RpBlockType
  content: string
  // check-specific
  attribute?: string
  target?: number
  // npc-specific
  npcName?: string
  // status-specific
  statusField?: string
  statusOp?: '+' | '-'
  statusValue?: string | number
  // dice-specific
  newDie?: number
  // note-specific
  noteType?: string
  noteContent?: string
}

export interface CheckResult {
  roll: number
  die: number
  attribute: string
  attributeValue: number
  equipmentBonus: number
  total: number
  target: number
  success: boolean
  critical: 'success' | 'fail' | null
}

const CHECK_RE = /\[检定[：:](.+?)[·.](\d+)\]/g
const STATUS_RE = /\[状态[：:](.+?)\]/g
const DICE_RE = /\[骰子[：:]d(\d+)\]/g
const NOTE_RE = /\[笔记[：:](.+?)[｜|](.+?)\]/g
const NPC_RE = /【(.+?)】"(.+?)"/g

export function parseRpMessage(text: string): RpBlock[] {
  const blocks: RpBlock[] = []
  let remaining = text

  const markers: { index: number; length: number; block: RpBlock }[] = []

  // Find all check markers
  let m
  const checkRe = new RegExp(CHECK_RE.source, 'g')
  while ((m = checkRe.exec(text)) !== null) {
    markers.push({
      index: m.index,
      length: m[0].length,
      block: { type: 'check', content: m[0], attribute: m[1].trim(), target: parseInt(m[2]) },
    })
  }

  // Find all status markers
  const statusRe = new RegExp(STATUS_RE.source, 'g')
  while ((m = statusRe.exec(text)) !== null) {
    const inner = m[1].trim()
    const parsed = parseStatusChange(inner)
    markers.push({
      index: m.index,
      length: m[0].length,
      block: { type: 'status_change', content: m[0], ...parsed },
    })
  }

  // Find all dice upgrade markers
  const diceRe = new RegExp(DICE_RE.source, 'g')
  while ((m = diceRe.exec(text)) !== null) {
    markers.push({
      index: m.index,
      length: m[0].length,
      block: { type: 'dice_upgrade', content: m[0], newDie: parseInt(m[1]) },
    })
  }

  // Find all note markers
  const noteRe = new RegExp(NOTE_RE.source, 'g')
  while ((m = noteRe.exec(text)) !== null) {
    markers.push({
      index: m.index,
      length: m[0].length,
      block: { type: 'note', content: m[0], noteType: m[1].trim(), noteContent: m[2].trim() },
    })
  }

  // Sort by position
  markers.sort((a, b) => a.index - b.index)

  // Build blocks: text between markers + marker blocks
  let cursor = 0
  for (const marker of markers) {
    if (marker.index > cursor) {
      const textBefore = text.slice(cursor, marker.index).trim()
      if (textBefore) {
        blocks.push(...parseNarration(textBefore))
      }
    }
    blocks.push(marker.block)
    cursor = marker.index + marker.length
  }

  // Remaining text after last marker
  if (cursor < text.length) {
    const textAfter = text.slice(cursor).trim()
    if (textAfter) {
      blocks.push(...parseNarration(textAfter))
    }
  }

  if (blocks.length === 0 && text.trim()) {
    blocks.push(...parseNarration(text.trim()))
  }

  return blocks
}

function parseNarration(text: string): RpBlock[] {
  const blocks: RpBlock[] = []
  const npcRe = /【(.+?)】"((?:[^"\\]|\\.)*)"/g
  let cursor = 0
  let m

  while ((m = npcRe.exec(text)) !== null) {
    if (m.index > cursor) {
      const before = text.slice(cursor, m.index).trim()
      if (before) blocks.push({ type: 'narration', content: before })
    }
    blocks.push({ type: 'npc_dialogue', content: m[0], npcName: m[1], })
    cursor = m.index + m[0].length
  }

  if (cursor < text.length) {
    const after = text.slice(cursor).trim()
    if (after) blocks.push({ type: 'narration', content: after })
  }

  return blocks
}

function parseStatusChange(inner: string): Partial<RpBlock> {
  // "金币 -3", "HP +5", "物品 +花纹匕首（描述）", "属性 剑术+1"
  const currencyMatch = inner.match(/^(金币|HP|hp|Hp)\s*([+-])(\d+)$/)
  if (currencyMatch) {
    return {
      statusField: currencyMatch[1],
      statusOp: currencyMatch[2] as '+' | '-',
      statusValue: parseInt(currencyMatch[3]),
    }
  }

  const itemMatch = inner.match(/^物品\s*([+-])(.+)$/)
  if (itemMatch) {
    return {
      statusField: '物品',
      statusOp: itemMatch[1] as '+' | '-',
      statusValue: itemMatch[2].trim(),
    }
  }

  const attrMatch = inner.match(/^属性\s*(.+?)([+-])(\d+)$/)
  if (attrMatch) {
    return {
      statusField: '属性',
      statusOp: attrMatch[2] as '+' | '-',
      statusValue: `${attrMatch[1].trim()}:${attrMatch[3]}`,
    }
  }

  return { statusField: inner }
}

export function rollDice(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

export function resolveCheck(
  attribute: string,
  target: number,
  characterState: CharacterState,
): CheckResult {
  const die = characterState.dice_config.current_die
  const roll = rollDice(die)
  const attributeValue = characterState.attributes[attribute] ?? 0

  // Calculate equipment bonus for this attribute
  let equipmentBonus = 0
  for (const item of characterState.inventory) {
    if (item.stat_bonus && item.stat_bonus[attribute]) {
      equipmentBonus += item.stat_bonus[attribute]
    }
  }

  const total = roll + attributeValue + equipmentBonus

  let critical: 'success' | 'fail' | null = null
  if (roll === 1) critical = 'fail'
  else if (roll === die) critical = 'success'

  const success = critical === 'success' ? true : critical === 'fail' ? false : total >= target

  return { roll, die, attribute, attributeValue, equipmentBonus, total, target, success, critical }
}

export function applyStatusChange(
  state: CharacterState,
  block: RpBlock,
): CharacterState {
  const next = JSON.parse(JSON.stringify(state)) as CharacterState
  const op = block.statusOp
  const val = block.statusValue

  if (block.statusField === '金币' && typeof val === 'number') {
    next.currency.amount += op === '+' ? val : -val
  } else if ((block.statusField === 'HP' || block.statusField === 'hp') && typeof val === 'number') {
    next.hp.current = Math.max(0, Math.min(next.hp.max, next.hp.current + (op === '+' ? val : -val)))
  } else if (block.statusField === '物品' && typeof val === 'string') {
    if (op === '+') {
      const nameMatch = val.match(/^(.+?)(?:[（(](.+?)[）)])?$/)
      next.inventory.push({
        name: nameMatch?.[1]?.trim() ?? val,
        description: nameMatch?.[2]?.trim(),
        stat_bonus: null,
      })
    } else {
      next.inventory = next.inventory.filter(i => i.name !== val.trim())
    }
  } else if (block.statusField === '属性' && typeof val === 'string') {
    const [attrName, delta] = val.split(':')
    if (attrName && delta) {
      const d = parseInt(delta)
      next.attributes[attrName] = (next.attributes[attrName] ?? 0) + (op === '+' ? d : -d)
    }
  }

  return next
}

export function formatCheckResultForModel(result: CheckResult): string {
  const critLabel = result.critical === 'success' ? '【大成功！】' :
                    result.critical === 'fail' ? '【大失败！】' : ''
  const successLabel = result.success ? '成功' : '失败'
  return `[检定结果：d${result.die}=${result.roll}, ${result.attribute}(${result.attributeValue})${result.equipmentBonus ? `+装备(${result.equipmentBonus})` : ''} = 总计${result.total} vs 目标${result.target} → ${successLabel}${critLabel}]`
}
