import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number
}

interface ToastStore {
  toasts: Toast[]
  add: (type: ToastType, message: string, duration?: number) => void
  remove: (id: string) => void
}

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 2500,
  error: 4500,
  warning: 3500,
  info: 3000,
}

let _id = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (type, message, duration) => {
    const id = `toast-${++_id}`
    const d = duration ?? DEFAULT_DURATION[type]
    set(s => ({ toasts: [...s.toasts.slice(-4), { id, type, message, duration: d }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), d)
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

// convenience functions
export const toast = {
  success: (msg: string, ms?: number) => useToastStore.getState().add('success', msg, ms),
  error: (msg: string, ms?: number) => useToastStore.getState().add('error', msg, ms),
  warning: (msg: string, ms?: number) => useToastStore.getState().add('warning', msg, ms),
  info: (msg: string, ms?: number) => useToastStore.getState().add('info', msg, ms),
}
