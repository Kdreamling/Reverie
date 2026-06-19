import { getAvatars, saveAvatar } from '../api/avatars'

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 点击聊天里的头像 → 选图 → 写 localStorage + 广播 + 同步后端
export function pickAvatar(key: 'dream' | 'claude') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) { alert('图片不能超过 500KB'); return }
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return }
    const dataUrl = await readFileAsDataURL(file)
    localStorage.setItem(`avatar_${key}`, dataUrl)
    window.dispatchEvent(new Event('avatar:changed'))
    try {
      await saveAvatar(key, dataUrl)
    } catch (e) {
      console.error('保存头像到后端失败', e)
    }
  }
  input.click()
}

// 启动时从后端拉取头像写入 localStorage（保留 localStorage 作缓存）
export async function syncAvatarsFromBackend() {
  try {
    const avatars = await getAvatars()
    let changed = false
    for (const key of ['dream', 'claude'] as const) {
      const remote = avatars[key]
      if (remote && remote !== localStorage.getItem(`avatar_${key}`)) {
        localStorage.setItem(`avatar_${key}`, remote)
        changed = true
      }
    }
    if (changed) window.dispatchEvent(new Event('avatar:changed'))
  } catch (e) {
    console.error('拉取头像失败', e)
  }
}
