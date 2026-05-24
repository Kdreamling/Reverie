import { useState } from 'react'
import type { CharacterState } from '../../api/projects'
import type { CheckResult } from './rpParser'
import { resolveCheck } from './rpParser'

interface Props {
  attribute: string
  target: number
  characterState: CharacterState
  onResult: (result: CheckResult) => void
  existingResult?: CheckResult | null
}

const RP = {
  bg: 'rgba(20,25,35,0.85)',
  bgGlow: 'rgba(40,50,70,0.6)',
  border: 'rgba(80,100,140,0.3)',
  text: 'rgba(220,215,205,0.95)',
  textSoft: 'rgba(220,215,205,0.6)',
  accent: 'rgba(180,140,100,0.9)',
  success: 'rgba(120,180,100,0.9)',
  fail: 'rgba(200,80,70,0.9)',
  critSuccess: 'rgba(255,200,60,0.95)',
  critFail: 'rgba(200,40,40,0.95)',
}

export default function CheckBubble({ attribute, target, characterState, onResult, existingResult }: Props) {
  const [result, setResult] = useState<CheckResult | null>(existingResult ?? null)
  const [rolling, setRolling] = useState(false)

  const attrValue = characterState.attributes[attribute] ?? 0
  let eqBonus = 0
  for (const item of characterState.inventory) {
    if (item.stat_bonus?.[attribute]) eqBonus += item.stat_bonus[attribute]
  }
  const baseTotal = attrValue + eqBonus
  const needed = Math.max(1, target - baseTotal)
  const die = characterState.dice_config.current_die

  const handleRoll = () => {
    if (result || rolling) return
    setRolling(true)
    setTimeout(() => {
      const r = resolveCheck(attribute, target, characterState)
      setResult(r)
      setRolling(false)
      onResult(r)
    }, 600)
  }

  if (result) {
    const isCritSuccess = result.critical === 'success'
    const isCritFail = result.critical === 'fail'
    const borderColor = isCritSuccess ? RP.critSuccess : isCritFail ? RP.critFail : result.success ? RP.success : RP.fail

    return (
      <div style={{
        margin: '12px 0', padding: '14px 18px', borderRadius: 14,
        background: RP.bg, border: `1px solid ${borderColor}`,
        fontFamily: "'Space Grotesk', 'Noto Sans SC', sans-serif",
        boxShadow: isCritSuccess ? '0 0 20px rgba(255,200,60,0.15)' : isCritFail ? '0 0 20px rgba(200,40,40,0.15)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>🎲</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: RP.text }}>
            d{result.die} → {result.roll}
          </span>
          {(isCritSuccess || isCritFail) && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
              background: isCritSuccess ? 'rgba(255,200,60,0.15)' : 'rgba(200,40,40,0.15)',
              color: isCritSuccess ? RP.critSuccess : RP.critFail,
              letterSpacing: '0.05em',
            }}>
              {isCritSuccess ? '大成功' : '大失败'}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: RP.textSoft, lineHeight: 1.8 }}>
          {result.roll} + {attribute}({result.attributeValue}){result.equipmentBonus > 0 ? ` + 装备(${result.equipmentBonus})` : ''} = {result.total}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 12, color: RP.textSoft }}>目标 {result.target}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: result.success ? RP.success : RP.fail }}>
            {result.success ? '✦ 成功' : '✘ 失败'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      margin: '12px 0', padding: '14px 18px', borderRadius: 14,
      background: RP.bg, border: `1px solid ${RP.border}`,
      fontFamily: "'Space Grotesk', 'Noto Sans SC', sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>⚔</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: RP.accent }}>{attribute}检定</span>
      </div>
      <div style={{ fontSize: 12, color: RP.textSoft, lineHeight: 1.8, marginBottom: 10 }}>
        <span>属性 {attrValue}{eqBonus > 0 ? ` ＋ 装备 ${eqBonus}` : ''} ＝ 基础 {baseTotal}</span>
        <br />
        <span>目标 ≥ {target}　　需投 ≥ {needed}</span>
      </div>
      <button
        onClick={handleRoll}
        disabled={rolling}
        style={{
          width: '100%', padding: '8px 0', borderRadius: 10,
          background: rolling ? 'rgba(80,100,140,0.2)' : 'rgba(180,140,100,0.12)',
          border: `1px solid ${rolling ? RP.border : RP.accent}`,
          color: rolling ? RP.textSoft : RP.accent,
          fontSize: 13, fontWeight: 600, cursor: rolling ? 'wait' : 'pointer',
          transition: 'all 0.2s',
          fontFamily: "'Noto Sans SC', sans-serif",
        }}
      >
        {rolling ? '投掷中...' : '🎲 投骰'}
      </button>
    </div>
  )
}
