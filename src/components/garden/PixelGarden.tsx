import { useRef, useEffect, useState, useCallback } from 'react'
import type { GardenView, GardenPlot, GardenCrop } from '../../api/garden'

const TILE = 16
const SCALE = 5
const CELL = TILE * SCALE // 80px
const COLS = 3
const ROWS = 3

// Sprout Lands bitmask tileset 惯例：center 完整块在 (16,16) 起
// 如果视觉不对，Dream 看一眼我们现场改
const DIRT_SRC = { x: 16, y: 16 }
const GRASS_SRC = { x: 16, y: 16 }

// stage 0..4 → 对应 plants.png 第几帧（跳过 frame 4 中间态，让视觉对比更明显）
const STAGE_FRAMES = [0, 1, 2, 3, 5]

export interface PixelGardenProps {
  data: GardenView
  onCellClick: (plot: GardenPlot, crop: GardenCrop | null) => void
}

export default function PixelGarden({ data, onCellClick }: PixelGardenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
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

  // 绘制
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgs.plants || !imgs.grass || !imgs.dirt) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // canvas 内部分辨率用原始像素，通过 CSS 放大
    const W = COLS * TILE
    const H = ROWS * TILE
    canvas.width = W
    canvas.height = H
    canvas.style.width = `${COLS * CELL}px`
    canvas.style.height = `${ROWS * CELL}px`
    ctx.imageSmoothingEnabled = false

    // 1. 底：翻耕土块 3x3
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.drawImage(imgs.dirt,
          DIRT_SRC.x, DIRT_SRC.y, TILE, TILE,
          x * TILE, y * TILE, TILE, TILE)
      }
    }

    // 2. 作物
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
        plot.x * TILE, plot.y * TILE, TILE, TILE)
    })

    // 3. 悬停高亮
    if (hover) {
      ctx.strokeStyle = 'rgba(255,220,100,0.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(hover.x * TILE + 0.5, hover.y * TILE + 0.5, TILE - 1, TILE - 1)
    }
  }, [imgs, data, hover])

  const cellFromEvent = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / CELL)
    const y = Math.floor((e.clientY - rect.top) / CELL)
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null
    return { x, y }
  }, [])

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
    <canvas
      ref={canvasRef}
      style={{
        imageRendering: 'pixelated',
        cursor: 'pointer',
        display: 'block',
        borderRadius: 8,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
      onClick={handleClick}
    />
  )
}
