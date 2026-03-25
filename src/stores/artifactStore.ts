import { create } from 'zustand'
import type { Artifact } from '../api/artifacts'

interface ArtifactState {
  currentArtifact: Artifact | null
  isOpen: boolean
  openArtifact: (artifact: Artifact) => void
  closePanel: () => void
  togglePanel: () => void
}

export const useArtifactStore = create<ArtifactState>((set) => ({
  currentArtifact: null,
  isOpen: false,
  openArtifact: (artifact) => set({ currentArtifact: artifact, isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
}))
