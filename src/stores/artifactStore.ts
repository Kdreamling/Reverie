import { create } from 'zustand'
import type { Artifact } from '../api/artifacts'
import { getArtifactVersions } from '../api/artifacts'

export interface InlineArtifact extends Artifact {
  /** Previous versions of this artifact (newest first) */
  history?: Artifact[]
}

interface ArtifactState {
  /** All artifacts seen in this session, keyed by title for ref matching */
  registry: Map<string, InlineArtifact[]>
  currentArtifact: InlineArtifact | null
  isOpen: boolean
  /** Currently viewing version index (0 = latest) */
  viewingVersionIndex: number

  openArtifact: (artifact: Artifact) => void
  closePanel: () => void
  registerArtifact: (artifact: Artifact) => void
  viewVersion: (index: number) => void
}

function isPersistedId(id: string): boolean {
  // 后端 UUID：36 位带 -，前端假 id：inline-N-title
  return !id.startsWith('inline-')
}

export const useArtifactStore = create<ArtifactState>((set, get) => ({
  registry: new Map(),
  currentArtifact: null,
  isOpen: false,
  viewingVersionIndex: 0,

  registerArtifact: (artifact) => {
    const { registry } = get()
    const key = artifact.title.toLowerCase()
    const existing = registry.get(key) || []
    existing.push({ ...artifact, history: [] })
    registry.set(key, existing)
    set({ registry: new Map(registry) })
  },

  openArtifact: (artifact) => {
    const { registry } = get()
    const key = artifact.title.toLowerCase()
    const memoryVersions = registry.get(key) || []

    // 先用内存 Map 的 history 兜底，保证面板立刻有内容
    const withHistory: InlineArtifact = {
      ...artifact,
      history: memoryVersions.length > 1 ? [...memoryVersions].reverse() : [],
    }
    set({ currentArtifact: withHistory, isOpen: true, viewingVersionIndex: 0 })

    // 真 id 时异步拉 DB 里的完整版本链，替换掉内存 history
    if (isPersistedId(artifact.id)) {
      getArtifactVersions(artifact.id)
        .then(res => {
          const versions = res?.versions || []
          if (versions.length < 1) return
          // 后端按 version asc 返回；面板历史需要 newest first
          const sorted = [...versions].sort((a, b) => b.version - a.version)
          // 找到当前 artifact 对应的版本；拿不到就用后端最新
          const current = get().currentArtifact
          if (!current || current.id !== artifact.id) return
          const newest = sorted[0]
          set({
            currentArtifact: { ...newest, history: sorted.length > 1 ? sorted : [] },
            viewingVersionIndex: 0,
          })
        })
        .catch(() => { /* 接口失败保持内存兜底 */ })
    }
  },

  closePanel: () => set({ isOpen: false }),

  viewVersion: (index) => {
    const { currentArtifact } = get()
    if (!currentArtifact?.history?.length) return
    if (index < 0 || index >= currentArtifact.history.length) return

    const version = currentArtifact.history[index]
    set({
      currentArtifact: { ...currentArtifact, ...version, history: currentArtifact.history },
      viewingVersionIndex: index,
    })
  },
}))
