import { useState, useEffect, useRef } from 'react'
import { X, MessageCircle } from 'lucide-react'
import { client } from '../api/client'
import { C } from '../theme'

interface PushData {
  id: string
  push_type: string
  content: string
  created_at: string
}

interface Props {
  onTap?: () => void  // navigate to today's session
}

export default function PushNotification({ onTap }: Props) {
  const [push, setPush] = useState<PushData | null>(null)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    checkPush()
    // Poll every 60 seconds
    pollRef.current = setInterval(checkPush, 60_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function checkPush() {
    try {
      const res = await client.get<{ push: PushData | null }>('/push/unread')
      if (res.push && !dismissed.has(res.push.id)) {
        setPush(res.push)
        setVisible(true)
        // Auto-hide after 15 seconds
        setTimeout(() => setVisible(false), 15_000)
      }
    } catch {
      // silent
    }
  }

  async function handleDismiss() {
    setVisible(false)
    if (push) {
      dismissed.add(push.id)
      setDismissed(new Set(dismissed))
      try {
        await client.post('/push/read', { push_id: push.id })
      } catch { /* silent */ }
    }
  }

  function handleTap() {
    handleDismiss()
    onTap?.()
  }

  if (!visible || !push) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex justify-center"
      style={{ paddingTop: 'calc(8px + env(safe-area-inset-top))' }}
    >
      <div
        className="mx-4 flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg cursor-pointer"
        style={{
          background: C.sidebarBg,
          border: `1px solid ${C.border}`,
          boxShadow: '0 8px 32px rgba(80,60,40,0.12)',
          maxWidth: 400,
          width: '100%',
          animation: 'slideDown 0.3s ease-out',
        }}
        onClick={handleTap}
      >
        <div
          className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: 36, height: 36, background: C.accent + '15' }}
        >
          <MessageCircle size={18} style={{ color: C.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium" style={{ color: C.textSecondary }}>晨</p>
          <p className="text-sm mt-0.5 leading-relaxed" style={{ color: C.text }}>
            {push.content}
          </p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); handleDismiss() }}
          className="flex-shrink-0 p-1 cursor-pointer"
          style={{ color: C.textMuted }}
        >
          <X size={14} />
        </button>
      </div>

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
