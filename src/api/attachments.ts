const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export interface AttachmentInfo {
  id: string
  file_type: 'image' | 'pdf' | 'text'
  mime_type: string
  original_filename: string
  file_size: number
}

export async function uploadAttachment(file: File, sessionId: string): Promise<AttachmentInfo> {
  const token = localStorage.getItem('token')
  const form = new FormData()
  form.append('file', file)
  form.append('session_id', sessionId)

  const res = await fetch(`${BASE_URL}/attachments`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  })

  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:unauthorized'))
  }

  if (!res.ok) {
    let message = `上传失败 (${res.status})`
    try {
      const body = await res.json()
      message = body?.detail ?? message
    } catch { /* ignore */ }
    throw new Error(message)
  }

  return res.json()
}

export async function getAttachment(id: string): Promise<AttachmentInfo> {
  const token = localStorage.getItem('token')

  const res = await fetch(`${BASE_URL}/attachments/${id}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (!res.ok) throw new Error(`获取附件信息失败 (${res.status})`)
  return res.json()
}
