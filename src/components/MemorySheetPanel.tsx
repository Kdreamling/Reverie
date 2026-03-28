// removed unused useState import
import type { DebugInfo } from '../api/chat'
import { C } from '../theme'
import ContextDebugPanel from './ContextDebugPanel'

const LAYER_COLORS: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  core_base: { bg: 'rgba(200,170,130,0.12)', fg: '#A08060', dot: '#C4A878', label: '基石' },
  core_living: { bg: 'rgba(140,160,180,0.1)', fg: '#7A8A9A', dot: '#9AACBC', label: '活水' },
  scene: { bg: 'rgba(200,150,160,0.1)', fg: '#B08088', dot: '#D0A0A8', label: '场景' },
  ai_journal: { bg: 'rgba(150,180,140,0.1)', fg: '#7A9A70', dot: '#A0C090', label: '日记' },
}

interface Props {
  debugInfo: DebugInfo
  open: boolean
  onClose: () => void
}

export default function MemorySheetPanel({ debugInfo, open, onClose }: Props) {
  if (!open) return null

  const memCount = debugInfo.memories.core_base.length + debugInfo.memories.core_living.length + debugInfo.memories.scene.length
  const searchCount = debugInfo.search_results.length

  // 收集所有记忆条目用于散点图
  type MemItem = { content: string; layer: string; score?: number; tag: string }
  const allMems: MemItem[] = []
  for (const m of debugInfo.memories.core_base) {
    allMems.push({ content: m.content, layer: 'core_base', score: ('importance' in m) ? (m as any).importance * 100 : 85, tag: '基石' })
  }
  for (const m of debugInfo.memories.core_living) {
    allMems.push({ content: m.content, layer: 'core_living', score: 80, tag: '活水' })
  }
  for (const m of debugInfo.memories.scene) {
    allMems.push({ content: m.content, layer: 'scene', score: ('scene_type' in m) ? 75 : 78, tag: '场景' })
  }
  // 搜索结果也加入
  for (const r of debugInfo.search_results) {
    if (r.score) {
      allMems.push({ content: r.content || r.user_msg || '', layer: r.layer || 'search', score: r.score * 100, tag: r.layer ? (LAYER_COLORS[r.layer]?.label || '检索') : '检索' })
    }
  }

  const minScore = allMems.length > 0 ? Math.min(...allMems.map(m => m.score || 0)) : 0
  const maxScore = allMems.length > 0 ? Math.max(...allMems.map(m => m.score || 100)) : 100
  const range = maxScore - minScore || 1

  const { token_usage } = debugInfo

  return (
    <div>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(50,42,34,0.3)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          zIndex: 100,
          animation: 'memFadeIn 0.2s ease',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxHeight: '80vh',
        zIndex: 101,
        background: C.bg,
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -8px 40px rgba(100,80,50,0.12)',
        display: 'flex', flexDirection: 'column',
        animation: 'memSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.borderStrong }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: C.memoryBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(184,149,110,0.15)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2a5.5 5.5 0 00-4.17 9.08L7 14v3h4v-3.5"/>
              <path d="M14.5 2a5.5 5.5 0 014.17 9.08L17 14v3h-4v-3.5"/>
              <path d="M7 17v1a2 2 0 002 2h6a2 2 0 002-2v-1"/>
              <path d="M12 2v4M8 6.5a3 3 0 010 4M16 6.5a3 3 0 000 4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>本轮注入的记忆</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>
              {memCount + searchCount} 条 · {token_usage.total}/{token_usage.budget} tokens
            </div>
          </div>
        </div>

        {/* Relevance scatter chart */}
        {allMems.length > 0 && (
          <div style={{ margin: '0 20px 16px', padding: '14px 16px', borderRadius: 16, background: C.memoryBg, border: '1px solid rgba(184,149,110,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>低</span>
              <div style={{ flex: 1, height: 28, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: '50%', height: 2,
                  background: `linear-gradient(90deg, ${C.border}, ${C.borderStrong})`,
                  borderRadius: 1, transform: 'translateY(-50%)',
                }} />
                {allMems.map((m, i) => {
                  const pct = ((m.score || 50) - minScore) / range * 100
                  const lc = LAYER_COLORS[m.layer] || LAYER_COLORS.scene
                  const isHigh = (m.score || 0) > 85
                  return (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `${Math.max(2, Math.min(98, pct))}%`,
                      transform: 'translate(-50%, -50%)',
                      top: '50%',
                      width: isHigh ? 14 : 10,
                      height: isHigh ? 14 : 10,
                      borderRadius: '50%',
                      background: lc.dot,
                      border: `2px solid ${C.bg}`,
                      boxShadow: isHigh ? `0 0 12px ${lc.dot}80` : 'none',
                      zIndex: isHigh ? 2 : 1,
                    }} />
                  )
                })}
              </div>
              <span style={{ fontSize: 11, color: C.textMuted }}>高</span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {Object.entries(LAYER_COLORS).map(([key, lc]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.textMuted }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: lc.dot }} />
                  {lc.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed debug panel (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          <ContextDebugPanel debugInfo={debugInfo} />
        </div>
      </div>

      <style>{`
        @keyframes memFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes memSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  )
}
