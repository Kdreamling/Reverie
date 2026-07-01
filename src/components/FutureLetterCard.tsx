import { useEffect, useState } from 'react'
import { Mail, X } from 'lucide-react'
import { C } from '../theme'
import { listPendingLetters, openLetter, type PendingLetter, type OpenedLetter } from '../api/letters'

function fmtDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function FutureLetterCard() {
  const [pending, setPending] = useState<PendingLetter[]>([])
  const [opened, setOpened] = useState<OpenedLetter | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    listPendingLetters().then(setPending).catch(() => {})
  }, [])

  const handleOpen = async (letter: PendingLetter) => {
    if (opening) return
    setOpening(true)
    try {
      const result = await openLetter(letter.id)
      setOpened(result)
      setPending(prev => prev.filter(l => l.id !== letter.id))
    } catch { /* silent */ }
    setOpening(false)
  }

  if (pending.length === 0 && !opened) return null

  return (
    <>
      {pending.map(letter => (
        <button
          key={letter.id}
          onClick={() => handleOpen(letter)}
          disabled={opening}
          className="w-full flex items-center gap-2 mb-2 cursor-pointer transition-opacity hover:opacity-80"
          style={{
            padding: '10px 14px',
            background: C.glass,
            border: `1px dashed ${C.borderStrong}`,
            borderRadius: 12,
            backdropFilter: 'blur(8px)',
          }}
        >
          <Mail size={15} style={{ color: C.accent, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: C.text }}>
            一封来自过去的信
          </span>
          <span style={{ fontSize: 11, color: C.textMuted }}>
            晨写于 {fmtDate(letter.created_at)}
          </span>
          <span className="ml-auto" style={{ fontSize: 11, color: C.accent, letterSpacing: '0.05em' }}>
            {opening ? '拆开中…' : '拆开'}
          </span>
        </button>
      ))}

      {opened && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 200, background: 'rgba(51,42,34,0.35)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpened(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 480,
              maxWidth: 'calc(100% - 48px)',
              maxHeight: '70vh',
              background: C.bg,
              border: `1px solid ${C.borderStrong}`,
              borderRadius: 14,
              boxShadow: '0 12px 40px rgba(51,42,34,0.18)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              className="flex items-center gap-2"
              style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}
            >
              <Mail size={15} style={{ color: C.accent }} />
              <span style={{ fontSize: 13, color: C.textSecondary }}>
                晨写于 {fmtDate(opened.created_at)} · 寄往 {fmtDate(opened.deliver_on)}
              </span>
              <button
                onClick={() => setOpened(null)}
                className="ml-auto cursor-pointer"
                style={{ color: C.textMuted, background: 'none', border: 'none', padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>
            <div
              style={{
                padding: '20px 24px 24px',
                overflowY: 'auto',
                fontSize: 14.5,
                lineHeight: 1.9,
                color: C.text,
                whiteSpace: 'pre-wrap',
              }}
            >
              {opened.content}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
