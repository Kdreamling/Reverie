import ReactMarkdown from 'react-markdown'
import type { RpBlock } from './rpParser'

export const RP = {
  glass: 'rgba(18, 16, 14, 0.55)',
  glassBorder: 'rgba(255, 245, 230, 0.06)',
  text: 'rgba(232, 225, 214, 0.92)',
  textSoft: 'rgba(232, 225, 214, 0.6)',
  accent: 'rgba(200, 165, 120, 0.85)',
  success: 'rgba(140, 195, 110, 0.9)',
  fail: 'rgba(210, 85, 75, 0.9)',
  critSuccess: 'rgba(255, 210, 70, 0.95)',
  critFail: 'rgba(210, 50, 45, 0.95)',
}

function npcColor(name: string): string {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const hue = (hash * 37) % 360
  return `hsl(${hue}, 40%, 72%)`
}

export function NarrationBlock({ content }: { content: string }) {
  return (
    <div className="rp-narration" style={{
      fontFamily: "'Noto Serif SC', 'EB Garamond', Georgia, serif",
      fontSize: 15,
      lineHeight: 2,
      color: RP.text,
      margin: '10px 0',
      letterSpacing: '0.02em',
    }}>
      <ReactMarkdown components={{
        p: ({ children }) => <p style={{ margin: '8px 0' }}>{children}</p>,
        strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'rgba(240,233,222,0.98)' }}>{children}</strong>,
        em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'rgba(232,225,214,0.78)' }}>{children}</em>,
      }}>{content}</ReactMarkdown>
    </div>
  )
}

export function NpcDialogue({ npcName, content }: { npcName: string; content: string }) {
  const dialogue = content.replace(/^【.+?】/, '').replace(/^"/, '').replace(/"$/, '')
  const color = npcColor(npcName)

  return (
    <div style={{ margin: '14px 0 10px' }}>
      <span style={{
        fontFamily: "'Noto Sans SC', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color,
        letterSpacing: '0.06em',
      }}>
        {npcName}
      </span>
      <div style={{
        fontFamily: "'Noto Serif SC', 'EB Garamond', serif",
        fontSize: 15,
        lineHeight: 1.9,
        color: RP.text,
        marginTop: 2,
        paddingLeft: 2,
      }}>
        <ReactMarkdown components={{
          p: ({ children }) => <span>{children}</span>,
          strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'rgba(232,225,214,0.78)' }}>{children}</em>,
        }}>
          {`「${dialogue}」`}
        </ReactMarkdown>
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
      display: 'inline-block',
      margin: '6px 4px 6px 0',
      padding: '4px 12px',
      borderRadius: 8,
      fontSize: 11,
      background: 'rgba(200,165,120,0.08)',
      border: '1px solid rgba(200,165,120,0.18)',
      color: RP.accent,
      fontFamily: "'Noto Sans SC', sans-serif",
      fontWeight: 500,
    }}>
      {label}
    </div>
  )
}

export function DiceUpgradeBubble({ newDie }: { newDie: number }) {
  return (
    <div style={{
      display: 'inline-block',
      margin: '8px 0',
      padding: '6px 14px',
      borderRadius: 8,
      fontSize: 12,
      background: 'rgba(140,195,110,0.06)',
      border: '1px solid rgba(140,195,110,0.18)',
      color: RP.success,
      fontFamily: "'Noto Sans SC', sans-serif",
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
      display: 'inline-block',
      margin: '8px 0',
      padding: '8px 16px',
      borderRadius: 10,
      fontSize: 14,
      background: 'rgba(18,16,14,0.6)',
      border: `1px solid ${isMax ? 'rgba(255,210,70,0.35)' : isMin ? 'rgba(210,50,45,0.35)' : RP.glassBorder}`,
      color: isMax ? RP.critSuccess : isMin ? RP.critFail : RP.text,
      fontFamily: "'Noto Sans SC', sans-serif",
      fontWeight: 600,
      boxShadow: isMax ? '0 0 16px rgba(255,210,70,0.08)' : 'none',
    }}>
      🎲 d{die} → {roll}
    </div>
  )
}
