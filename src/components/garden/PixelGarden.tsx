import { useRef, useEffect, useState, useCallback } from 'react'
import type { GardenView, GardenPlot, GardenCrop } from '../../api/garden'

const TILE = 16
const COLS = 3                // 种植地块
const ROWS = 3
const FRAME_PAD = 1           // 外围草地宽度（格）
const TOTAL_COLS = COLS + FRAME_PAD * 2
const TOTAL_ROWS = ROWS + FRAME_PAD * 2

// 素材坐标
const DIRT_SRC = { x: 16, y: 16 }     // 翻耕土中心块
const GRASS_SRC = { x: 16, y: 16 }    // 草地中心块
const STAGE_FRAMES = [0, 1, 2, 3, 5]

export interface PixelGardenProps {
  data: GardenView
  onCellClick: (plot: GardenPlot, crop: GardenCrop | null) => void
}

export default function PixelGarden({ data, onCellClick }: PixelGardenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [cell, setCell] = useState(64)        // 实际像素大小，手机端自适应
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [imgs, setImgs] = useState<{
    plants?: HTMLImageElement
    grass?: HTMLImageElement
    dirt?: HTMLImageElement
  }>({})

  // 预加载 sprite
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/chat/'
    const load = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = url
      })
    Promise.all([
      load(base + 'sprites/garden/plants.png'),
      load(base + 'sprites/garden/grass.png'),
      load(base + 'sprites/garden/tilled_dirt.png'),
    ]).then(([plants, grass, dirt]) => {
      setImgs({ plants, grass, dirt })
    }).catch((e) => {
      console.error('[PixelGarden] sprite load failed', e)
    })
  }, [])

  // 自适应 cell 大小（手机端）
  useEffect(() => {
    const recalc = () => {
      const wrap = wrapRef.current
      if (!wrap) return
      // 容器能给多宽，就分配多宽 / TOTAL_COLS，上限 72px
      const available = wrap.clientWidth
      const size = Math.max(36, Math.min(72, Math.floor(available / TOTAL_COLS)))
      setCell(size)
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [])

  // 绘制
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgs.plants || !imgs.grass || !imgs.dirt) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = TOTAL_COLS * TILE
    const H = TOTAL_ROWS * TILE
    canvas.width = W
    canvas.height = H
    canvas.style.width = `${TOTAL_COLS * cell}px`
    canvas.style.height = `${TOTAL_ROWS * cell}px`
    ctx.imageSmoothingEnabled = false

    // 1. 整个画布铺草
    for (let y = 0; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < TOTAL_COLS; x++) {
        ctx.drawImage(imgs.grass,
          GRASS_SRC.x, GRASS_SRC.y, TILE, TILE,
          x * TILE, y * TILE, TILE, TILE)
      }
    }

    // 2. 中间 3x3 翻耕土
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.drawImage(imgs.dirt,
          DIRT_SRC.x, DIRT_SRC.y, TILE, TILE,
          (x + FRAME_PAD) * TILE, (y + FRAME_PAD) * TILE, TILE, TILE)
      }
    }

    // 3. 作物
    const cropByPlot: Record<string, GardenCrop> = {}
    data.crops.forEach(c => { cropByPlot[c.plot_id] = c })
    data.plots.forEach(plot => {
      const crop = cropByPlot[plot.id]
      if (!crop) return
      const def = data.crop_defs[crop.species]
      if (!def) return
      const frame = STAGE_FRAMES[Math.min(crop.stage, 4)] ?? 0
      ctx.drawImage(imgs.plants,
        frame * TILE, def.sprite_row * TILE, TILE, TILE,
        (plot.x + FRAME_PAD) * TILE, (plot.y + FRAME_PAD) * TILE, TILE, TILE)
    })

    // 4. 悬停高亮（仅种植区域）
    if (hover && hover.x >= 0 && hover.x < COLS && hover.y >= 0 && hover.y < ROWS) {
      ctx.strokeStyle = 'rgba(255,230,140,0.95)'
      ctx.lineWidth = 1
      ctx.strokeRect(
        (hover.x + FRAME_PAD) * TILE + 0.5,
        (hover.y + FRAME_PAD) * TILE + 0.5,
        TILE - 1, TILE - 1
      )
    }
  }, [imgs, data, hover, cell])

  const cellFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY
    // canvas 上的逻辑格（含外围草地）
    const gx = Math.floor((clientX - rect.left) / cell)
    const gy = Math.floor((clientY - rect.top) / cell)
    // 转成种植区坐标
    const x = gx - FRAME_PAD
    const y = gy - FRAME_PAD
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null
    return { x, y }
  }, [cell])

  const handleMouseMove = (e: React.MouseEvent) => {
    const c = cellFromEvent(e)
    setHover(c)
  }

  const handleClick = (e: React.MouseEvent) => {
    const c = cellFromEvent(e)
    if (!c) return
    const plot = data.plots.find(p => p.x === c.x && p.y === c.y)
    if (!plot) return
    const crop = data.crops.find(x => x.plot_id === plot.id) ?? null
    onCellClick(plot, crop)
  }

  return (
    <div ref={wrapRef} style={{
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      width: '100%',
    }}>
      {/* 云朵装饰 */}
      <div style={{
        position: 'absolute',
        top: -8, right: cell * 0.5,
        fontSize: Math.max(22, cell * 0.45),
        opacity: 0.85,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'drop-shadow(0 2px 4px rgba(160,140,110,0.25))',
        animation: 'gardenFloat 6s ease-in-out infinite',
      }}>☁️</div>
      <div style={{
        position: 'absolute',
        top: cell * 0.3, left: cell * 0.2,
        fontSize: Math.max(16, cell * 0.3),
        opacity: 0.7,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'drop-shadow(0 2px 4px rgba(160,140,110,0.2))',
        animation: 'gardenFloat 8s ease-in-out infinite reverse',
      }}>☁️</div>

      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          cursor: 'pointer',
          display: 'block',
          borderRadius: 10,
          boxShadow: '0 6px 24px rgba(120,100,70,0.15)',
          touchAction: 'manipulation',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
      />

      <style>{`
        @keyframes gardenFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}
