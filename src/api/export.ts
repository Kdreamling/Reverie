import { client } from './client'

export async function exportSession(sessionId: string, format: 'json' | 'md' = 'json') {
  const result = await client.get<{ messages: unknown[] }>(`/sessions/${sessionId}/messages`)
  const messages = result.messages || result

  if (format === 'md') {
    let md = `# 对话导出\n\n`
    for (const msg of messages as Array<{ user_msg?: string; assistant_msg?: string; created_at: string }>) {
      if (msg.user_msg) md += `**Dream**: ${msg.user_msg}\n\n`
      if (msg.assistant_msg) md += `**晨**: ${msg.assistant_msg}\n\n---\n\n`
    }
    return md
  }

  return JSON.stringify(messages, null, 2)
}

export function downloadText(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // Delay cleanup for iOS Safari
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
}
