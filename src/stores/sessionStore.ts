import { create } from 'zustand'
import {
  fetchSessionsAPI,
  fetchSessionByIdAPI,
  createSessionAPI,
  deleteSessionAPI,
  updateSessionAPI,
  fetchTodaySessionAPI,
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
  ensureTodaySession: () => Promise<void>
  createSession: (scene_type: string, model: string) => Promise<Session>
  selectSession: (id: string) => Promise<void>
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

  async ensureTodaySession() {
    try {
      const todaySession = await fetchTodaySessionAPI()
      const { sessions, currentSession } = get()
      // 如果今天的 session 不在列表里，加进去
      if (!sessions.find(s => s.id === todaySession.id)) {
        set({ sessions: [todaySession, ...sessions] })
      }
      // 如果没有选中的 session，自动选中今天的
      if (!currentSession) {
        set({ currentSession: todaySession })
      }
    } catch (e) {
      console.warn('[sessionStore] ensureTodaySession failed:', e)
    }
  },

  async createSession(scene_type, model) {
    const session = await createSessionAPI(scene_type, model)
    set(s => ({ sessions: [session, ...s.sessions], currentSession: session }))
    return session
  },

  async selectSession(id) {
    const session = get().sessions.find(s => s.id === id) ?? null
    if (session) {
      set({ currentSession: session })
    } else {
      // Session not in local list (e.g. RP session outside top 20) — fetch from backend
      try {
        const fetched = await fetchSessionByIdAPI(id)
        set(s => ({
          currentSession: fetched,
          sessions: [fetched, ...s.sessions],
        }))
      } catch {
        set({ currentSession: null })
      }
    }
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
    // 先同步更新 model 到后端
    await updateSessionAPI(session.id, { model })
    // 然后从后端拉取最新数据，避免覆盖其他字段
    await get().fetchSessions()
    // 重新选中当前 session（fetchSessions 会刷新列表，需要重新定位）
    const fresh = get().sessions.find(s => s.id === session.id)
    if (fresh) set({ currentSession: fresh })
  },
}))
