import { useToastStore, type ToastType } from '../stores/toastStore'
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { C, FONT } from '../theme'

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', icon: '#22c55e' },
  error:   { bg: C.errorBg, border: C.errorBorder, icon: C.errorText },
  warning: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', icon: '#d97706' },
  info:    { bg: 'rgba(160,120,90,0.06)', border: C.border, icon: C.accent },
}

export default function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  const remove = useToastStore(s => s.remove)

  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed',
      top: 'calc(12px + env(safe-area-inset-top))',
      left: 0,
      right: 0,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      pointerEvents: 'none',
      fontFamily: FONT,
    }}>
      {toasts.map(t => {
        const Icon = icons[t.type]
        const c = colors[t.type]
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 14,
              background: c.bg,
              border: `1px solid ${c.border}`,
              boxShadow: '0 4px 20px rgba(80,60,40,0.1)',
              maxWidth: 360,
              width: 'calc(100% - 32px)',
              animation: 'toastIn 0.25s ease-out',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Icon size={18} style={{ color: c.icon, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4, color: C.text }}>
              {t.message}
            </span>
            <button
              onClick={() => remove(t.id)}
              style={{
                flexShrink: 0,
                padding: 2,
                color: C.textMuted,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes toastIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
