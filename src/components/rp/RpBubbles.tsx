import type { RpBlock, CheckResult } from './rpParser'

const RP = {
  bg: 'rgba(20,25,35,0.85)',
  border: 'rgba(80,100,140,0.3)',
  text: 'rgba(220,215,205,0.95)',
  textSoft: 'rgba(220,215,205,0.6)',
  accent: 'rgba(180,140,100,0.9)',
  npcBg: 'rgba(30,35,50,0.7)',
  npcBorder: 'rgba(120,130,160,0.25)',
  npcName: 'rgba(160,170,200,0.9)',
  narratBorder: 'rgba(180,140,100,0.3)',
}

export function NarrationBlock({ content }: { content: string }) {
  return (
    <div style={{
      padding: '6px 0 6px 14px',
      borderLeft: `2px solid ${RP.narratBorder}`,
      fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
      fontSize: 15, lineHeight: 2,
      color: RP.text,
      fontStyle: 'italic',
      margin: '6px 0',
    }}>
      {content}
    </div>
  )
}

export function NpcDialogue({ npcName, content }: { npcName: string; content: string }) {
  const dialogue = content.replace(/^【.+?】/, '').replace(/^"/, '').replace(/"$/, '')
  return (
    <div style={{ margin: '8px 0' }}>
      <span style={{
        display: 'inline-block', fontSize: 10, fontWeight: 600,
        padding: '2px 8px', borderRadius: 6,
        background: 'rgba(120,130,160,0.12)', color: RP.npcName,
        marginBottom: 4, fontFamily: "'Noto Sans SC', sans-serif",
        letterSpacing: '0.04em',
      }}>
        {npcName}
      </span>
      <div style={{
        padding: '10px 14px', borderRadius: '2px 12px 12px 12px',
        background: RP.npcBg, border: `1px solid ${RP.npcBorder}`,
        fontSize: 14, lineHeight: 1.8,
        color: RP.text,
        fontFamily: "'Noto Sans SC', serif",
        marginTop: 2,
      }}>
        {dialogue}
      </div>
    </div>
  )
}

export function StatusChangeBubble({ block }: { block: RpBlock }) {
  let label = ''
  if (block.statusField === '金币') label = `💰 ${block.statusOp}${block.statusValue}`
  else if (block.statusField === 'HP' || block.statusField === 'hp') label = `❤ HP ${block.statusOp}${block.statusValue}`
  else if (block.statusField === '物品') label = `${block.statusOp === '+' ? '📦 获得' : '📦 失去'} ${block.statusValue}`
  else if (block.statusField === '属性') {
    const parts = String(block.statusValue).split(':')
    label = `📊 ${parts[0]} ${block.statusOp}${parts[1]}`
  } else {
    label = `${block.statusField}`
  }

  return (
    <div style={{
      display: 'inline-block', margin: '4px 0', padding: '4px 12px',
      borderRadius: 8, fontSize: 11,
      background: 'rgba(180,140,100,0.1)', border: `1px solid rgba(180,140,100,0.2)`,
      color: RP.accent, fontFamily: "'Space Grotesk', 'Noto Sans SC', sans-serif",
    }}>
      {label}
    </div>
  )
}

export function DiceUpgradeBubble({ newDie }: { newDie: number }) {
  return (
    <div style={{
      display: 'inline-block', margin: '6px 0', padding: '6px 14px',
      borderRadius: 8, fontSize: 12,
      background: 'rgba(120,180,100,0.08)', border: `1px solid rgba(120,180,100,0.2)`,
      color: 'rgba(120,180,100,0.9)', fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 600,
    }}>
      🎲 骰子升级 → d{newDie}
    </div>
  )
}

export function FreeRollBubble({ roll, die }: { roll: number; die: number }) {
  const isMax = roll === die
  const isMin = roll === 1
  return (
    <div style={{
      display: 'inline-block', margin: '6px 0', padding: '8px 16px',
      borderRadius: 10, fontSize: 14,
      background: RP.bg,
      border: `1px solid ${isMax ? 'rgba(255,200,60,0.4)' : isMin ? 'rgba(200,40,40,0.4)' : RP.border}`,
      color: isMax ? 'rgba(255,200,60,0.95)' : isMin ? 'rgba(200,40,40,0.95)' : RP.text,
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 600,
      boxShadow: isMax ? '0 0 12px rgba(255,200,60,0.1)' : 'none',
    }}>
      🎲 d{die} → {roll}
    </div>
  )
}
