import { useEffect, useRef } from 'react'
import { client } from '../api/client'
import { toast } from '../stores/toastStore'

interface Alert {
  service: string
  label: string
  error: string
  count: number
  last_at: string
}

const POLL_INTERVAL = 5 * 60 * 1000

export default function SystemAlertMonitor() {
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>

    const check = async () => {
      try {
        const { alerts } = await client.get<{ alerts: Alert[] }>('/system/alerts')
        if (!alerts?.length) {
          seenRef.current.clear()
          return
        }
        for (const a of alerts) {
          const key = `${a.service}:${a.last_at}`
          if (seenRef.current.has(key)) continue
          seenRef.current.add(key)
          toast.warning(`${a.label}：${a.error}`, 8000)
        }
      } catch {
        // 接口本身挂了就静默，不要循环报错
      }
    }

    check()
    timer = setInterval(check, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  return null
}
