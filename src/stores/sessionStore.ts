import { create } from 'zustand'
import {
  fetchSessionsAPI,
  createSessionAPI,
  deleteSessionAPI,
  updateSessionAPI,
  type Session,
} from '../api/sessions'

export type Group = 'today' | 'yesterday' | 'previous'

export function getGroup(dateStr: string): Group {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)

  const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (sessionDay >= startOfToday) return 'today'
  if (sessionDay >= startOfYesterday) return 'yesterday'
  return 'previous'
}

export function formatSessionTime(dateStr: string): string {
  const d = new Date(dateStr)
  const group = getGroup(dateStr)
  if (group === 'today') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (group === 'yesterday') return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface SessionState {
  sessions: Session[]
  currentSession: Session | null
  loading: boolean

  fetchSessions: () => Promise<void>
  createSession: (scene_type: string, model: string) => Promise<void>
  selectSession: (id: string) => void
  deleteSession: (id: string) => Promise<void>
  updateSessionModel: (model: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSession: null,
  loading: false,

  async fetchSessions() {
    set({ loading: true })
    try {
      const raw = await fetchSessionsAPI()
      const sessions = [...raw].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
      set({ sessions, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  async createSession(scene_type, model) {
    const session = await createSessionAPI(scene_type, model)
    set(s => ({ sessions: [session, ...s.sessions], currentSession: session }))
  },

  selectSession(id) {
    const session = get().sessions.find(s => s.id === id) ?? null
    set({ currentSession: session })
  },

  async deleteSession(id) {
    await deleteSessionAPI(id)
    set(s => {
      const sessions = s.sessions.filter(x => x.id !== id)
      const currentSession =
        s.currentSession?.id === id ? (sessions[0] ?? null) : s.currentSession
      return { sessions, currentSession }
    })
  },

  async updateSessionModel(model) {
    const session = get().currentSession
    if (!session) return
    // Update locally first for instant UI feedback
    const updated = { ...session, model }
    set(s => ({
      currentSession: updated,
      sessions: s.sessions.map(x => x.id === session.id ? updated : x),
    }))
    // Sync to backend
    await updateSessionAPI(session.id, { model })
  },
}))
