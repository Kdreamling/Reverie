import { useEffect, useMemo, useRef, useState } from 'react'
import './rp.css'
import { computeSuccessRate, difficultyLabel, outcomeLabel, type RollOutcome } from './rpEvents'

export interface RingResult {
  roll: number
  total: number
  success: boolean
  critical: 'success' | 'fail' | null
}

interface CheckRingProps {
  action: string
  attribute: string
  target: number
  die: number
  bonus: number
  successRate?: number | null
  /** 已有结果（历史重建 / 本轮已掷） */
  result?: RollOutcome | RingResult | null
  /** 当前可掷（pending_check 匹配） */
  interactive?: boolean
  /** 点击后执行真正的掷骰（服务器端），resolve 结果 */
  onRoll?: () => Promise<RingResult>
  /** 数字定格后回调（发续写消息） */
  onSettled?: (r: RingResult) => void
}

const DECA_POINTS = '60,11 88.8,20.4 106.6,44.9 106.6,75.1 88.8,99.6 60,109 31.2,99.6 13.4,75.1 13.4,44.9 31.2,20.4'
const CRACK_PATH = 'M42 16 L58 50 L50 60 L68 104'

/** 72 根细密金线星芒（大成功） */
function raysLines(): { x1: string; y1: string; x2: string; y2: string; opacity: string }[] {
  const N = 72, cx = 100, cy = 100
  const out = []
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 * i) / N
    const len = [26, 12, 19, 9][i % 4] + (i % 7) * 1.3
    const r1 = 64, r2 = r1 + len
    out.push({
      x1: (cx + r1 * Math.cos(a)).toFixed(1),
      y1: (cy + r1 * Math.sin(a)).toFixed(1),
      x2: (cx + r2 * Math.cos(a)).toFixed(1),
      y2: (cy + r2 * Math.sin(a)).toFixed(1),
      opacity: (0.35 + ((i * 13) % 10) / 18).toFixed(2),
    })
  }
  return out
}

const RAYS = raysLines()

type Phase = 'pending' | 'rolling' | 'done'

export default function CheckRing({
  action, attribute, target, die, bonus,
  successRate, result, interactive, onRoll, onSettled,
}: CheckRingProps) {
  const [phase, setPhase] = useState<Phase>(result ? 'done' : 'pending')
  const [shown, setShown] = useState<RingResult | null>(result ?? null)
  const [cycleNum, setCycleNum] = useState(1)
  const busyRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const cyclerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 历史结果后到（消息列表刷新）时同步
  useEffect(() => {
    if (result && phase === 'pending') {
      setShown(result)
      setPhase('done')
    }
  }, [result, phase])

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout)
    if (cyclerRef.current) clearInterval(cyclerRef.current)
  }, [])

  const rate = useMemo(
    () => successRate ?? computeSuccessRate(die, bonus, target),
    [successRate, die, bonus, target],
  )

  const handleClick = async () => {
    if (phase !== 'pending' || !interactive || !onRoll || busyRef.current) return
    busyRef.current = true
    setPhase('rolling')
    let i = 0
    cyclerRef.current = setInterval(() => { setCycleNum((i++ % die) + 1) }, 65)
    try {
      const [r] = await Promise.all([
        onRoll(),
        new Promise(res => timersRef.current.push(setTimeout(res, 1300))),
      ])
      if (cyclerRef.current) clearInterval(cyclerRef.current)
      setShown(r)
      setPhase('done')
      timersRef.current.push(setTimeout(() => onSettled?.(r), 900))
    } catch {
      if (cyclerRef.current) clearInterval(cyclerRef.current)
      setPhase('pending')
      busyRef.current = false
    }
  }

  const cls = ['rp-check']
  if (phase === 'pending') cls.push(interactive ? 'pending' : 'expired')
  if (phase === 'rolling') cls.push('rolling')
  if (phase === 'done' && shown) {
    cls.push('done')
    if (shown.critical === 'success') cls.push('crit')
    else if (shown.critical === 'fail') cls.push('critfail')
    else cls.push(shown.success ? 'success' : 'fail')
  }
  cls.push('ttrpg-only')

  const verdict = shown ? outcomeLabel(shown).split('').join(' ') : ''

  return (
    <div className={cls.join(' ')}>
      <div className="rp-check-head">
        <div className="rp-kind">能力检定</div>
        <div className="rp-subject">{attribute}{action ? ` · ${action}` : ''}</div>
        <div className="rp-difficulty">
          {difficultyLabel(target)} · {target}+
          {phase === 'pending' && interactive && (
            <span className="rp-rate">成功率 {Math.round(rate * 100)}%</span>
          )}
        </div>
      </div>
      <div className="rp-seal-wrap" onClick={handleClick}>
        <svg className="rp-ring" viewBox="0 0 120 120">
          <g className="rp-rotor2"><circle className="rp-orbit" cx="60" cy="60" r="50" /></g>
          <g className="rp-rotor">
            <circle className="rp-ticks" cx="60" cy="60" r="56" />
            <polygon className="rp-deca" points={DECA_POINTS} />
            <circle className="rp-inner" cx="60" cy="60" r="42" />
          </g>
          <path className="rp-crack" d={CRACK_PATH} />
        </svg>
        <div className="rp-burst" />
        <div className="rp-rays">
          <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.7">
            {RAYS.map((l, i) => <line key={i} {...l} />)}
          </svg>
        </div>
        <div className="rp-seal-center">
          <span className="rp-cta">
            {phase === 'pending' && !interactive ? '已失效' : <>掷<br />d{die}</>}
          </span>
          <span className="rp-num">{phase === 'rolling' ? cycleNum : shown?.roll ?? ''}</span>
        </div>
      </div>
      <div className="rp-verdict-line">
        <span className="rp-verdict">{verdict}</span>
        <span className="rp-formula">
          {shown ? `d${die} ${shown.roll}${bonus ? ` + ${bonus}` : ''} = ${shown.total} vs ${target}` : ''}
        </span>
      </div>
    </div>
  )
}
