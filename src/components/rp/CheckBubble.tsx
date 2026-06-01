import { useState } from 'react'
import type { CharacterState } from '../../api/projects'
import type { CheckResult } from './rpParser'
import { resolveCheck } from './rpParser'
import { RP } from './RpBubbles'

interface Props {
  attribute: string
  target: number
  characterState: CharacterState
  onResult: (result: CheckResult) => void
  existingResult?: CheckResult | null
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
        margin: '14px 0', padding: '14px 18px', borderRadius: 14,
        background: 'rgba(18,16,14,0.5)', border: `1px solid ${borderColor}`,
        fontFamily: "'Noto Sans SC', sans-serif",
        boxShadow: isCritSuccess ? '0 0 24px rgba(255,210,70,0.1)' : isCritFail ? '0 0 24px rgba(210,50,45,0.1)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>🎲</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: RP.text }}>
            d{result.die} → {result.roll}
          </span>
          {(isCritSuccess || isCritFail) && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
              background: isCritSuccess ? 'rgba(255,210,70,0.12)' : 'rgba(210,50,45,0.12)',
              color: isCritSuccess ? RP.critSuccess : RP.critFail,
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
      margin: '14px 0', padding: '14px 18px', borderRadius: 14,
      background: 'rgba(18,16,14,0.5)', border: `1px solid rgba(200,165,120,0.2)`,
      fontFamily: "'Noto Sans SC', sans-serif",
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
          background: rolling ? 'rgba(200,165,120,0.06)' : 'rgba(200,165,120,0.1)',
          border: `1px solid ${rolling ? 'rgba(200,165,120,0.12)' : 'rgba(200,165,120,0.25)'}`,
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
