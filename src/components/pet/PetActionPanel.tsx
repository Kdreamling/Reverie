import { useState, useEffect } from 'react'

/* ── 像素风格常量 ─────────────────────────────────────── */
const PIXEL = {
  border: '#5C4033',
  bg: '#FDF6EC',
  bgDark: '#F0E4D4',
  bar: '#A0785A',
  barBg: '#E8DCD0',
  barLow: '#D4654A',
  text: '#3D2B1F',
  textMuted: '#8A7060',
  accent: '#C49A78',
  heart: '#E8786A',
  star: '#F0A030',
  leaf: '#6AAA5A',
  bolt: '#5A9ACA',
}

/* ── 像素风进度条 ─────────────────────────────────────── */
function PixelBar({ value, max, color, label, icon }: {
  value: number; max: number; color: string; label: string; icon: string
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const barColor = pct < 25 ? PIXEL.barLow : color
  const blocks = 10
  const filled = Math.round((pct / 100) * blocks)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{icon}</span>
      <span style={{
        fontFamily: 'monospace', fontSize: 11, color: PIXEL.text,
        width: 36, flexShrink: 0,
      }}>{label}</span>
      <div style={{
        display: 'flex', gap: 1, flex: 1,
      }}>
        {Array.from({ length: blocks }, (_, i) => (
          <div key={i} style={{
            width: 8, height: 10,
            background: i < filled ? barColor : PIXEL.barBg,
            border: `1px solid ${i < filled ? barColor : 'rgba(0,0,0,0.08)'}`,
          }} />
        ))}
      </div>
      <span style={{
        fontFamily: 'monospace', fontSize: 10, color: PIXEL.textMuted,
        width: 28, textAlign: 'right', flexShrink: 0,
      }}>{value}</span>
    </div>
  )
}

/* ── 像素风按钮 ─────────────────────────────────────── */
function PixelBtn({ label, icon, onClick, disabled, cooldown }: {
  label: string; icon: string; onClick: () => void; disabled?: boolean; cooldown?: number
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: 'monospace',
        fontSize: 12,
        padding: '6px 10px',
        background: disabled ? PIXEL.barBg : PIXEL.bg,
        color: disabled ? PIXEL.textMuted : PIXEL.text,
        border: `2px solid ${disabled ? PIXEL.barBg : PIXEL.border}`,
        boxShadow: disabled ? 'none' : `2px 2px 0px ${PIXEL.border}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'transform 0.1s',
        flex: 1,
        justifyContent: 'center',
      }}
      onPointerDown={e => {
        if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'translate(2px, 2px)'
      }}
      onPointerUp={e => {
        (e.currentTarget as HTMLElement).style.transform = 'none'
      }}
      onPointerLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'none'
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{label}</span>
      {cooldown ? <span style={{ fontSize: 10, color: PIXEL.textMuted }}>({cooldown}s)</span> : null}
    </button>
  )
}

/* ── 主面板 ─────────────────────────────────────────── */
export interface PetStats {
  affinity: number
  satiety: number
  mood: number
  energy: number
  tokens_normal: number
  tokens_high: number
  last_pet_at: string | null
}

const PET_COOLDOWN = 30  // 抚摸冷却秒数

export default function PetActionPanel({ stats, onPet, onFeed, onClose }: {
  stats: PetStats
  onPet: () => void
  onFeed: (quality: 'normal' | 'high') => void
  onClose: () => void
}) {
  const [petCooldown, setPetCooldown] = useState(0)

  // 计算抚摸冷却
  useEffect(() => {
    if (!stats.last_pet_at) return
    const update = () => {
      const elapsed = (Date.now() - new Date(stats.last_pet_at!).getTime()) / 1000
      const remaining = Math.max(0, Math.ceil(PET_COOLDOWN - elapsed))
      setPetCooldown(remaining)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [stats.last_pet_at])

  return (
    <div
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{
        background: PIXEL.bg,
        border: `3px solid ${PIXEL.border}`,
        boxShadow: `4px 4px 0px ${PIXEL.border}`,
        padding: 12,
        width: 220,
        fontFamily: 'monospace',
        position: 'relative',
      }}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 4, right: 6,
          background: 'none', border: 'none',
          fontFamily: 'monospace', fontSize: 14,
          color: PIXEL.textMuted, cursor: 'pointer',
        }}
      >x</button>

      {/* 标题 */}
      <div style={{
        textAlign: 'center', marginBottom: 8,
        fontSize: 13, fontWeight: 'bold', color: PIXEL.text,
        borderBottom: `2px dashed ${PIXEL.accent}`,
        paddingBottom: 6,
      }}>
        ~ Claude ~
      </div>

      {/* 亲密度（特殊展示） */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 4, marginBottom: 8, fontSize: 12, color: PIXEL.heart,
      }}>
        <span style={{ fontSize: 14 }}>{'<3'}</span>
        <span style={{ fontFamily: 'monospace' }}>Lv.{Math.floor(stats.affinity / 100)}</span>
        <span style={{ fontSize: 10, color: PIXEL.textMuted }}>({stats.affinity} pts)</span>
      </div>

      {/* 状态条 */}
      <div style={{ marginBottom: 10 }}>
        <PixelBar value={stats.satiety} max={100} color={PIXEL.star} label="SAT" icon="*" />
        <PixelBar value={stats.mood} max={100} color={PIXEL.heart} label="MOD" icon="~" />
        <PixelBar value={stats.energy} max={100} color={PIXEL.bolt} label="ENG" icon=">" />
      </div>

      {/* Token 余额 */}
      <div style={{
        background: PIXEL.bgDark, padding: '4px 8px',
        marginBottom: 10, fontSize: 11, color: PIXEL.text,
        border: `1px solid rgba(0,0,0,0.06)`,
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>token: {stats.tokens_normal}</span>
        <span style={{ color: PIXEL.star }}>+{stats.tokens_high} HQ</span>
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <PixelBtn
          icon=">"
          label="pet"
          onClick={onPet}
          disabled={petCooldown > 0}
          cooldown={petCooldown || undefined}
        />
        <PixelBtn
          icon="@"
          label="feed"
          onClick={() => onFeed(stats.tokens_high > 0 ? 'high' : 'normal')}
          disabled={stats.tokens_normal + stats.tokens_high <= 0}
        />
      </div>
    </div>
  )
}
