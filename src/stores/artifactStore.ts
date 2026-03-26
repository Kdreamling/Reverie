import { create } from 'zustand'
import type { Artifact } from '../api/artifacts'

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
    const versions = registry.get(key) || []

    // Build history from all versions with the same title
    const withHistory: InlineArtifact = {
      ...artifact,
      history: versions.length > 1 ? [...versions].reverse() : [],
    }

    set({ currentArtifact: withHistory, isOpen: true, viewingVersionIndex: 0 })
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
