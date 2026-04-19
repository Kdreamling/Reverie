import { C } from '../theme'

const EVENT_LABELS: Record<string, { icon: string; label: string }> = {
  'status.wakeup': { icon: '☀️', label: '起床了' },
  'status.work': { icon: '💼', label: '上班中' },
  'status.lunch': { icon: '🍱', label: '午休中' },
  'status.offwork': { icon: '🌆', label: '下班了' },
  'status.sleep': { icon: '🌙', label: '睡觉了' },
  'status.home': { icon: '🏠', label: '到家了' },
  'status.out': { icon: '👟', label: '出门了' },
  'status.charging': { icon: '🔌', label: '充电中' },
  'mood.happy': { icon: '☺️', label: '心情不错' },
  'mood.sad': { icon: '😔', label: '不开心' },
  'mood.bored': { icon: '💭', label: '无聊中' },
  'app.wechat': { icon: '📱', label: '在用微信' },
  'app.qq': { icon: '📱', label: '在用QQ' },
  'app.bilibili': { icon: '📺', label: '在看B站' },
  'app.xiaohongshu': { icon: '📖', label: '在刷小红书' },
  'app.meituan': { icon: '🛵', label: '在点外卖' },
  'app.taobao': { icon: '🛒', label: '在逛淘宝' },
  'app.jd': { icon: '📦', label: '在逛京东' },
  'app.discord': { icon: '🔧', label: '在和小克debug' },
  'app.reverie': { icon: '💬', label: '在和晨聊天' },
}

function parseEventContent(content: string): { type: string; value: string } {
  const match = content.match(/^\[event:([^\]]+)\]\s*(.*)$/)
  if (match) return { type: match[1], value: match[2] }
  return { type: 'unknown', value: content }
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

interface Props {
  content: string
  createdAt: string
}

export default function EventBubble({ content, createdAt }: Props) {
  const { type, value } = parseEventContent(content)
  const info = EVENT_LABELS[type]
  const label = value || info?.label || type.split('.').pop() || ''
  const time = formatTime(createdAt)

  return (
    <div className="flex justify-center my-2.5">
      <span
        className="event-bubble-label"
        style={{
          fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
          fontSize: 12.5,
          fontStyle: 'italic',
          letterSpacing: '0.04em',
          lineHeight: '22px',
        }}
      >
        — {label} · {time} —
      </span>
    </div>
  )
}
