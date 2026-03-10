import { create } from 'zustand'
import { loginAPI } from '../api/auth'

interface AuthState {
  token: string | null
  isLoggedIn: boolean

  init: () => void
  login: (password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isLoggedIn: false,

  init() {
    const token = localStorage.getItem('token')
    if (token) {
      set({ token, isLoggedIn: true })
    }
  },

  async login(password: string) {
    const { token } = await loginAPI(password)
    localStorage.setItem('token', token)
    set({ token, isLoggedIn: true })
  },

  logout() {
    localStorage.removeItem('token')
    set({ token: null, isLoggedIn: false })
    // Navigate to login — handled by AuthGuard reacting to isLoggedIn = false
  },
}))
