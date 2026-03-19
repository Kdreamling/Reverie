import { useEffect, useRef, useState, useCallback } from 'react'
import { client } from '../api/client'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { scaleLinear } from 'd3-scale'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'
import { select } from 'd3-selection'

/* ---- 类型 ---- */

interface RawNode {
  id: string
  content: string
  category: string
  tags: string[]
  emotion_primary: string | null
  emotion_secondary: string | null
  emotion_intensity: number | null
  emotion_trigger: string | null
  emotion_nuance: string | null
  occurred_at: string | null
  base_importance: number
}

interface RawEdge {
  id: string
  source_node_id: string
  target_node_id: string
  relation_type: string
  strength: number
  description: string | null
}

interface GNode extends SimulationNodeDatum {
  id: string
  content: string
  category: string
  tags: string[]
  emotion_primary: string | null
  emotion_secondary: string | null
  emotion_intensity: number | null
  emotion_trigger: string | null
  emotion_nuance: string | null
  occurred_at: string | null
  base_importance: number
  radius: number
}

interface GEdge extends SimulationLinkDatum<GNode> {
  id: string
  relation_type: string
  strength: number
  description: string | null
}

/* ---- 常量 ---- */

const CATEGORY_COLORS: Record<string, string> = {
  emotion: '#FF8C6B',
  event: '#5BA8FF',
  milestone: '#FFD700',
  preference: '#6BCB77',
  promise: '#B388FF',
  knowledge: '#C0C0C0',
  reflection: '#E0E0E0',
}

const RELATION_STYLES: Record<string, { dash: number[]; arrow: boolean; gradient: boolean }> = {
  causal: { dash: [], arrow: true, gradient: false },
  echo: { dash: [6, 4], arrow: false, gradient: false },
  growth: { dash: [], arrow: true, gradient: true },
  same_topic: { dash: [], arrow: false, gradient: false },
  temporal: { dash: [3, 3], arrow: true, gradient: false },
}

const radiusScale = scaleLinear().domain([0, 1]).range([6, 18]).clamp(true)

function getNodeColor(category: string): string {
  return CATEGORY_COLORS[category] || '#AAAAAA'
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function formatDate(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ---- 组件 ---- */

export default function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null)
  const nodesRef = useRef<GNode[]>([])
  const edgesRef = useRef<GEdge[]>([])
  const transformRef = useRef(zoomIdentity)
  const selectedRef = useRef<string | null>(null)
  const hoveredRef = useRef<string | null>(null)
  const dragRef = useRef<{ node: GNode; active: boolean } | null>(null)
  const rafRef = useRef<number>(0)

  const [selected, setSelected] = useState<GNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({ nodes: 0, edges: 0 })

  /* ---- 数据加载 ---- */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [nodesRes, edgesRes] = await Promise.all([
          client.get<{ nodes: RawNode[] }>('/graph/nodes'),
          client.get<{ edges: RawEdge[] }>('/graph/edges'),
        ])
        if (cancelled) return

        const nodeMap = new Map<string, GNode>()
        const nodes: GNode[] = nodesRes.nodes.map((n) => {
          const gn: GNode = {
            ...n,
            radius: radiusScale(n.base_importance),
          }
          nodeMap.set(n.id, gn)
          return gn
        })

        const edges: GEdge[] = edgesRes.edges
          .filter((e) => nodeMap.has(e.source_node_id) && nodeMap.has(e.target_node_id))
          .map((e) => ({
            id: e.id,
            source: nodeMap.get(e.source_node_id)!,
            target: nodeMap.get(e.target_node_id)!,
            relation_type: e.relation_type,
            strength: e.strength,
            description: e.description,
          }))

        nodesRef.current = nodes
        edgesRef.current = edges
        setStats({ nodes: nodes.length, edges: edges.length })
        setLoading(false)
      } catch (e: any) {
        if (!cancelled) setError(e.message || '加载失败')
      }
    })()
    return () => { cancelled = true }
  }, [])

  /* ---- Canvas 绘制 ---- */

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    const t = transformRef.current
    const nodes = nodesRef.current
    const edges = edgesRef.current
    const selId = selectedRef.current
    const hovId = hoveredRef.current

    // 选中节点的邻居集合
    const neighborSet = new Set<string>()
    if (selId) {
      neighborSet.add(selId)
      for (const e of edges) {
        const sid = (e.source as GNode).id
        const tid = (e.target as GNode).id
        if (sid === selId) neighborSet.add(tid)
        if (tid === selId) neighborSet.add(sid)
      }
    }

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 背景渐变
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#0a0e27')
    bg.addColorStop(1, '#000510')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)

    // ---- 画边 ----
    for (const e of edges) {
      const s = e.source as GNode
      const tg = e.target as GNode
      if (s.x == null || s.y == null || tg.x == null || tg.y == null) continue

      const style = RELATION_STYLES[e.relation_type] || RELATION_STYLES.same_topic
      const isHighlight = selId && (neighborSet.has(s.id) && neighborSet.has(tg.id))
      const alpha = selId ? (isHighlight ? 0.8 : 0.08) : 0.25 + e.strength * 0.3
      const lineWidth = selId && isHighlight ? 1.2 + e.strength : 0.5 + e.strength * 0.8

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.lineWidth = lineWidth

      if (style.gradient && !selId) {
        const grad = ctx.createLinearGradient(s.x, s.y, tg.x, tg.y)
        grad.addColorStop(0, getNodeColor(s.category))
        grad.addColorStop(1, getNodeColor(tg.category))
        ctx.strokeStyle = grad
      } else {
        ctx.strokeStyle = selId && isHighlight ? '#5BA8FF' : '#334477'
      }

      if (style.dash.length) ctx.setLineDash(style.dash)

      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(tg.x, tg.y)
      ctx.stroke()

      // 箭头
      if (style.arrow) {
        const angle = Math.atan2(tg.y - s.y, tg.x - s.x)
        const arrowLen = 6
        const ax = tg.x - Math.cos(angle) * (tg.radius + 3)
        const ay = tg.y - Math.sin(angle) * (tg.radius + 3)
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.35), ay - arrowLen * Math.sin(angle - 0.35))
        ctx.moveTo(ax, ay)
        ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.35), ay - arrowLen * Math.sin(angle + 0.35))
        ctx.stroke()
      }

      ctx.restore()
    }

    // ---- 画节点 ----
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue

      const color = getNodeColor(n.category)
      const isSelected = n.id === selId
      const isHovered = n.id === hovId
      const isNeighbor = selId ? neighborSet.has(n.id) : true
      const alpha = selId ? (isNeighbor ? 1 : 0.12) : 1

      ctx.save()
      ctx.globalAlpha = alpha

      // 光晕
      if (isSelected || isHovered || !selId) {
        const glowRadius = isSelected ? n.radius * 3.5 : isHovered ? n.radius * 3 : n.radius * 2
        const glow = ctx.createRadialGradient(n.x, n.y, n.radius * 0.3, n.x, n.y, glowRadius)
        glow.addColorStop(0, color + (isSelected ? '60' : isHovered ? '40' : '20'))
        glow.addColorStop(1, color + '00')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2)
        ctx.fill()
      }

      // 核心圆
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // 内部高光
      const inner = ctx.createRadialGradient(
        n.x - n.radius * 0.3, n.y - n.radius * 0.3, 0,
        n.x, n.y, n.radius,
      )
      inner.addColorStop(0, 'rgba(255,255,255,0.5)')
      inner.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = inner
      ctx.fill()

      // 标签（缩放足够大时显示）
      if (t.k > 0.6) {
        ctx.fillStyle = selId && !isNeighbor ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.75)'
        ctx.font = `${Math.max(9, 11 / t.k * 0.8)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(truncate(n.content, 12), n.x, n.y + n.radius + 4)
      }

      ctx.restore()
    }

    ctx.restore()
  }, [])

  /* ---- 动画循环 ---- */

  const tick = useCallback(() => {
    draw()
    rafRef.current = requestAnimationFrame(tick)
  }, [draw])

  /* ---- 力模拟 + zoom + 交互 ---- */

  useEffect(() => {
    if (loading || error) return

    const canvas = canvasRef.current!
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const nodes = nodesRef.current
    const edges = edgesRef.current

    // 力模拟
    const sim = forceSimulation(nodes)
      .force('link', forceLink<GNode, GEdge>(edges).id((d) => d.id).distance(80).strength((e) => 0.3 + e.strength * 0.4))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<GNode>().radius((d) => d.radius + 8))
      .alphaDecay(0.02)
      .on('tick', () => {})

    simRef.current = sim

    // 初始 transform：居中
    const initScale = Math.min(w, h) < 500 ? 0.5 : 0.7
    transformRef.current = zoomIdentity.translate(w / 2, h / 2).scale(initScale)

    // zoom
    const zoomBehavior = d3Zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (event) => {
        transformRef.current = event.transform
      })

    select(canvas)
      .call(zoomBehavior)
      .call(zoomBehavior.transform, transformRef.current)

    // ---- 命中检测 ----
    function hitTest(cx: number, cy: number): GNode | null {
      const t = transformRef.current
      const mx = (cx - t.x) / t.k
      const my = (cy - t.y) / t.k
      // 反向遍历（上层节点优先）
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        if (n.x == null || n.y == null) continue
        const dx = mx - n.x
        const dy = my - n.y
        const hitRadius = Math.max(n.radius, 14) // 最小点击区域
        if (dx * dx + dy * dy < hitRadius * hitRadius) return n
      }
      return null
    }

    // ---- 鼠标交互 ----
    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
      hoveredRef.current = hit?.id || null
      canvas.style.cursor = hit ? 'pointer' : 'grab'
    }

    function onClick(e: MouseEvent) {
      if (dragRef.current?.active) return
      const rect = canvas.getBoundingClientRect()
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
      if (hit) {
        selectedRef.current = hit.id
        setSelected(hit)
      } else {
        selectedRef.current = null
        setSelected(null)
      }
    }

    // ---- 触摸拖拽节点 ----
    function onPointerDown(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect()
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
      if (hit && e.isPrimary) {
        dragRef.current = { node: hit, active: false }
        hit.fx = hit.x
        hit.fy = hit.y
        sim.alphaTarget(0.3).restart()
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragRef.current || !e.isPrimary) return
      dragRef.current.active = true
      const t = transformRef.current
      const rect = canvas.getBoundingClientRect()
      dragRef.current.node.fx = (e.clientX - rect.left - t.x) / t.k
      dragRef.current.node.fy = (e.clientY - rect.top - t.y) / t.k
    }

    function onPointerUp() {
      if (dragRef.current) {
        dragRef.current.node.fx = null
        dragRef.current.node.fy = null
        dragRef.current = null
        sim.alphaTarget(0)
      }
    }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // 启动动画
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      sim.stop()
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [loading, error, tick])

  /* ---- resize ---- */

  useEffect(() => {
    function onResize() {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* ---- 渲染 ---- */

  if (error) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#0a0e27] text-white">
        <p className="text-red-400">加载失败: {error}</p>
      </div>
    )
  }

  return (
    <div className="h-dvh w-full relative overflow-hidden bg-[#0a0e27]">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* 加载中 */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/60 text-sm">加载记忆图谱…</div>
        </div>
      )}

      {/* 左上角统计 */}
      {!loading && (
        <div className="absolute top-4 left-4 text-white/40 text-xs select-none pointer-events-none">
          {stats.nodes} 节点 · {stats.edges} 条边
        </div>
      )}

      {/* 右上角图例 */}
      {!loading && (
        <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-white/70 select-none pointer-events-none">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <span key={cat} className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 详情卡片 */}
      {selected && (
        <div
          className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-80
                     bg-black/70 backdrop-blur-md rounded-xl border border-white/10
                     p-4 text-white text-sm max-h-[60vh] overflow-y-auto"
        >
          <button
            className="absolute top-2 right-3 text-white/40 hover:text-white text-lg"
            onClick={() => { selectedRef.current = null; setSelected(null) }}
          >
            ×
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: getNodeColor(selected.category) }}
            />
            <span className="text-white/50 text-xs">{selected.category}</span>
            {selected.occurred_at && (
              <span className="text-white/30 text-xs ml-auto">{formatDate(selected.occurred_at)}</span>
            )}
          </div>

          <p className="text-white/90 leading-relaxed mb-3">{selected.content}</p>

          {selected.emotion_primary && (
            <div className="text-white/60 text-xs mb-1">
              情绪: <span className="text-white/80">{selected.emotion_primary}</span>
              {selected.emotion_secondary && <span className="text-white/50"> / {selected.emotion_secondary}</span>}
              {selected.emotion_intensity && (
                <span className="ml-1 text-white/40">
                  {'★'.repeat(selected.emotion_intensity)}{'☆'.repeat(5 - selected.emotion_intensity)}
                </span>
              )}
            </div>
          )}

          {selected.emotion_nuance && (
            <p className="text-white/40 text-xs leading-relaxed mt-2">{selected.emotion_nuance}</p>
          )}

          {selected.tags && selected.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {selected.tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-white/50">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
