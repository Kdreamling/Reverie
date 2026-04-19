import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Droplet, Scissors } from 'lucide-react'
import PixelGarden from '../components/garden/PixelGarden'
import { C, FONT } from '../theme'
import {
  fetchGarden, plantCrop, waterCrop, harvestCrop,
  type GardenView, type GardenPlot, type GardenCrop,
} from '../api/garden'

// stage 文字描述
const STAGE_NAMES = ['种子', '发芽', '幼苗', '成长', '成熟']

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} 小时前`
  const diffD = Math.floor(diffH / 24)
  return `${diffD} 天前`
}

export default function GardenPage() {
  const nav = useNavigate()
  const [data, setData] = useState<GardenView | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ plot: GardenPlot; crop: GardenCrop | null } | null>(null)

  const load = useCallback(async () => {
    try {
      const v = await fetchGarden()
      setData(v)
      setErr(null)
    } catch (e) {
      setErr((e as Error).message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // 每 60s 刷新一次（作物可能涨了）
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const handleCellClick = (plot: GardenPlot, crop: GardenCrop | null) => {
    setSelected({ plot, crop })
  }

  const handlePlant = async (species: string) => {
    if (!selected) return
    try {
      await plantCrop(selected.plot.id, species)
      setSelected(null)
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handleWater = async () => {
    if (!selected?.crop) return
    try {
      await waterCrop(selected.plot.id)
      setSelected(null)
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handleHarvest = async () => {
    if (!selected?.crop) return
    try {
      await harvestCrop(selected.plot.id)
      setSelected(null)
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: C.bgGradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.textMuted, fontFamily: FONT,
      }}>
        种子正在发芽…
      </div>
    )
  }

  if (err || !data) {
    return (
      <div style={{
        minHeight: '100vh', background: C.bgGradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.errorText, fontFamily: FONT, padding: 20, textAlign: 'center',
      }}>
        <div>
          <div style={{ marginBottom: 8 }}>{err || '没拿到数据'}</div>
          <button onClick={load} style={{
            padding: '6px 14px', border: `1px solid ${C.borderStrong}`,
            background: C.surface, color: C.text, borderRadius: 6, cursor: 'pointer',
          }}>重试</button>
        </div>
      </div>
    )
  }

  const availableSeeds = data.seeds.filter(s => s.count > 0)
  const hasStarter = availableSeeds.length > 0

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bgGradient,
      fontFamily: FONT,
      color: C.text,
      padding: '24px 20px',
      boxSizing: 'border-box',
    }}>
      {/* 顶栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        maxWidth: 700, margin: '0 auto 20px',
      }}>
        <div onClick={() => nav('/')} style={{
          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
        }}>
          <ArrowLeft size={20} color={C.textSecondary} />
        </div>
        <div>
          <div style={{
            fontSize: 11, color: C.textMuted, letterSpacing: '0.1em',
            fontWeight: 500, textTransform: 'uppercase',
          }}>Garden</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{data.state.farm_name}</div>
        </div>
      </div>

      <div style={{
        maxWidth: 700, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* 菜园画布 */}
        <div style={{
          background: C.roomBgDeep,
          padding: 20,
          borderRadius: 16,
          display: 'flex', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(180,150,120,0.08)',
        }}>
          <PixelGarden data={data} onCellClick={handleCellClick} />
        </div>

        {/* 种子库存 */}
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 16,
        }}>
          <div style={{
            fontSize: 11, color: C.textMuted, letterSpacing: '0.08em',
            marginBottom: 10, textTransform: 'uppercase',
          }}>种子库存</div>
          {hasStarter ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {data.seeds.map(s => {
                const def = data.crop_defs[s.species]
                if (!def) return null
                return (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px',
                    background: s.count > 0 ? 'rgba(196,154,120,0.12)' : 'rgba(0,0,0,0.04)',
                    borderRadius: 20, fontSize: 13,
                    color: s.count > 0 ? C.text : C.textMuted,
                  }}>
                    <span style={{ fontSize: 18 }}>{def.emoji}</span>
                    <span>{def.label}</span>
                    <span style={{ color: C.textSecondary }}>×{s.count}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ color: C.textMuted, fontSize: 13 }}>暂时没有种子，等晨送你~</div>
          )}
        </div>

        {/* 晨的留言 / 最近动作 */}
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 16,
        }}>
          <div style={{
            fontSize: 11, color: C.textMuted, letterSpacing: '0.08em',
            marginBottom: 10, textTransform: 'uppercase',
          }}>田间日志</div>
          {data.recent_actions.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 13 }}>还没有任何活动</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.recent_actions.slice(0, 8).map(a => {
                const speciesLabel = a.species ? data.crop_defs[a.species]?.label ?? a.species : ''
                const actorLabel = a.actor === 'chen' ? '晨' : '你'
                const actionLabel = {
                  plant: '种下了',
                  water: '浇了',
                  harvest: '收获了',
                  gift_seed: '送来了种子',
                  visit: '来看了一下',
                }[a.action] || a.action
                return (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    fontSize: 13, color: C.textSecondary,
                    padding: '4px 0',
                  }}>
                    <div style={{
                      padding: '2px 8px',
                      background: a.actor === 'chen' ? 'rgba(196,154,120,0.15)' : 'rgba(0,0,0,0.04)',
                      borderRadius: 4,
                      fontSize: 11,
                      color: a.actor === 'chen' ? C.accent : C.textMuted,
                      flexShrink: 0,
                    }}>{actorLabel}</div>
                    <div style={{ flex: 1 }}>
                      <span>{actionLabel}{speciesLabel && ` ${speciesLabel}`}</span>
                      {a.note && (
                        <div style={{ color: C.text, marginTop: 2, fontStyle: 'italic' }}>
                          "{a.note}"
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>
                      {fmtTime(a.created_at)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 选中格子的操作弹窗 */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.bg,
              borderRadius: 16,
              padding: 20,
              minWidth: 280, maxWidth: 360,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            {selected.crop ? (
              // 有作物
              (() => {
                const crop = selected.crop
                const def = data.crop_defs[crop.species]
                const mature = crop.stage >= 4
                return (
                  <>
                    <div style={{
                      fontSize: 11, color: C.textMuted, letterSpacing: '0.08em',
                      marginBottom: 6, textTransform: 'uppercase',
                    }}>地块 ({selected.plot.x + 1},{selected.plot.y + 1})</div>
                    <div style={{
                      fontSize: 22, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span>{def?.emoji}</span>
                      <span>{def?.label || crop.species}</span>
                      <span style={{ fontSize: 13, fontWeight: 400, color: C.textSecondary }}>
                        · {STAGE_NAMES[crop.stage]}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 12, color: C.textMuted, marginTop: 8,
                    }}>
                      种于 {fmtTime(crop.planted_at)}　·　上次浇水 {fmtTime(crop.last_watered_at)}
                      {crop.watered_by_chen_count > 0 && (
                        <span style={{ color: C.accent }}>
                          　·　晨帮浇了 {crop.watered_by_chen_count} 次
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                      {mature ? (
                        <button
                          onClick={handleHarvest}
                          style={{
                            flex: 1, padding: '10px 14px',
                            background: C.accentGradient,
                            color: 'white',
                            border: 'none', borderRadius: 8,
                            cursor: 'pointer', fontSize: 14, fontWeight: 500,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}
                        >
                          <Scissors size={16} /> 收获
                        </button>
                      ) : (
                        <button
                          onClick={handleWater}
                          style={{
                            flex: 1, padding: '10px 14px',
                            background: 'rgba(100,150,200,0.12)',
                            color: '#4a7ba8',
                            border: `1px solid rgba(100,150,200,0.25)`,
                            borderRadius: 8,
                            cursor: 'pointer', fontSize: 14, fontWeight: 500,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}
                        >
                          <Droplet size={16} /> 浇水
                        </button>
                      )}
                    </div>
                  </>
                )
              })()
            ) : (
              // 空地
              <>
                <div style={{
                  fontSize: 11, color: C.textMuted, letterSpacing: '0.08em',
                  marginBottom: 6, textTransform: 'uppercase',
                }}>地块 ({selected.plot.x + 1},{selected.plot.y + 1})</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>种点什么？</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {availableSeeds.filter(s => s.count > 0).map(s => {
                    const def = data.crop_defs[s.species]
                    if (!def) return null
                    return (
                      <button
                        key={s.id}
                        onClick={() => handlePlant(s.species)}
                        style={{
                          padding: '10px 14px',
                          background: 'rgba(196,154,120,0.08)',
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10,
                          fontSize: 14,
                          color: C.text,
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{def.emoji}</span>
                        <span style={{ flex: 1, textAlign: 'left' }}>{def.label}</span>
                        <span style={{ color: C.textSecondary, fontSize: 12 }}>剩 {s.count}</span>
                      </button>
                    )
                  })}
                  {availableSeeds.filter(s => s.count > 0).length === 0 && (
                    <div style={{ color: C.textMuted, fontSize: 13, padding: 8 }}>
                      没有可种的种子了
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
