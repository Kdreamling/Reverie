import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Brain, Settings, LogOut, Camera, Download, FileText, Server, BookOpen, Terminal } from 'lucide-react'
import { C } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { exportSession, downloadText } from '../api/export'
import MemoryPanel from './MemoryPanel'
import FeaturesPanel from './FeaturesPanel'
import PromptPanel from './PromptPanel'

type Page = 'menu' | 'memory' | 'features' | 'prompt'

interface Props {
  page: Page
  onPageChange: (page: Page) => void
  onClose: () => void
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function AvatarEditor({ label, storageKey, fallback }: { label: string; storageKey: string; fallback: React.ReactNode }) {
  const [avatar, setAvatar] = useState<string | null>(() => localStorage.getItem(storageKey))
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (file.size > 500 * 1024) { alert('图片不能超过 500KB'); return }
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return }
    const dataUrl = await readFileAsDataURL(file)
    localStorage.setItem(storageKey, dataUrl)
    setAvatar(dataUrl)
    // 通知其他组件刷新
    window.dispatchEvent(new Event('avatar:changed'))
  }

  function handleRemove() {
    localStorage.removeItem(storageKey)
    setAvatar(null)
    window.dispatchEvent(new Event('avatar:changed'))
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative rounded-full overflow-hidden flex-shrink-0 cursor-pointer"
        style={{ width: 56, height: 56 }}
        onClick={() => fileRef.current?.click()}
      >
        {avatar ? (
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: '#eef1f8' }}>
            {fallback}
          </div>
        )}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <Camera size={18} style={{ color: '#fff' }} />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: '#1a1f2e' }}>{label}</p>
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs cursor-pointer"
            style={{ color: '#002FA7' }}
          >
            更换
          </button>
          {avatar && (
            <button
              onClick={handleRemove}
              className="text-xs cursor-pointer"
              style={{ color: '#9aa3b8' }}
            >
              移除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ExportButton({ format }: { format: 'json' | 'md' }) {
  const [loading, setLoading] = useState(false)
  const currentSession = useSessionStore(s => s.currentSession)

  const handleExport = async () => {
    if (!currentSession) { alert('请先选择一个对话'); return }
    setLoading(true)
    try {
      const content = await exportSession(currentSession.id, format)
      const ext = format === 'md' ? '.md' : '.json'
      const title = currentSession.title || 'conversation'
      downloadText(typeof content === 'string' ? content : JSON.stringify(content, null, 2), `${title}${ext}`)
    } catch (e) {
      console.error('Export failed:', e)
      alert('导出失败: ' + (e instanceof Error ? e.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading || !currentSession}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40"
      style={{ border: `1px solid ${C.border}`, color: C.textSecondary }}
    >
      <Download size={13} />
      {loading ? '导出中...' : format === 'md' ? '导出 Markdown' : '导出 JSON'}
    </button>
  )
}

export default function SettingsPanel({ page, onPageChange, onClose }: Props) {
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()

  const menuItems = [
    { key: 'memory' as Page, icon: Brain, label: 'Memory', desc: '查看和管理记忆' },
    { key: 'features' as Page, icon: Settings, label: 'Features', desc: '功能开关' },
    { key: 'prompt' as Page, icon: FileText, label: 'Prompt', desc: '编辑晨的提示词' },
  ]

  if (page === 'memory') {
    return (
      <div className="fixed md:absolute inset-0 z-50 md:z-10">
        <MemoryPanel onBack={() => onPageChange('menu')} />
      </div>
    )
  }

  if (page === 'features') {
    return (
      <div className="fixed md:absolute inset-0 z-50 md:z-10">
        <FeaturesPanel onBack={() => onPageChange('menu')} />
      </div>
    )
  }

  if (page === 'prompt') {
    return (
      <div className="fixed md:absolute inset-0 z-50 md:z-10">
        <PromptPanel onBack={() => onPageChange('menu')} />
      </div>
    )
  }

  return (
    <div
      className="fixed md:absolute inset-0 flex flex-col z-50 md:z-10"
      style={{ background: C.bg, color: C.text }}
    >
      {/* Header */}
      <button
        onClick={onClose}
        className="flex items-center gap-2.5 px-5 md:px-4 w-full text-left transition-colors duration-150 cursor-pointer"
        style={{
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 16,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <ChevronLeft size={18} strokeWidth={1.8} style={{ color: C.textSecondary }} />
        <span className="text-base md:text-sm font-medium select-none" style={{ letterSpacing: '0.05em' }}>
          Settings
        </span>
      </button>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar section */}
        <div className="px-5 md:px-4 py-5" style={{ borderBottom: `1px solid ${C.border}` }}>
          <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: C.textMuted }}>头像</p>
          <div className="flex flex-col gap-5">
            <AvatarEditor
              label="Dream"
              storageKey="avatar_dream"
              fallback={<span className="text-lg font-semibold" style={{ color: C.accent }}>D</span>}
            />
            <AvatarEditor
              label="Claude"
              storageKey="avatar_claude"
              fallback={<span style={{ color: C.accent, fontSize: 20 }}>✦</span>}
            />
          </div>
        </div>

        {/* Menu items */}
        <nav className="px-3 md:px-2 py-4 md:py-3">
          {menuItems.map(item => (
            <button
              key={item.key}
              onClick={() => onPageChange(item.key)}
              className="flex items-center gap-4 md:gap-3 w-full px-4 md:px-3 py-4 md:py-3 rounded-xl md:rounded-lg transition-colors duration-150 cursor-pointer text-left mb-1"
              style={{ background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = C.sidebarActive)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ width: 40, height: 40, background: C.surface, flexShrink: 0 }}
              >
                <item.icon size={18} strokeWidth={1.5} style={{ color: C.accent }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: C.text }}>{item.label}</p>
                <p className="text-xs mt-0.5" style={{ color: C.textSecondary }}>{item.desc}</p>
              </div>
              <ChevronLeft size={14} strokeWidth={2} style={{ color: C.textMuted, transform: 'rotate(180deg)', marginLeft: 'auto', flexShrink: 0 }} />
            </button>
          ))}
        </nav>

        {/* 系统工具区 — 横排小图标 */}
        <div className="px-5 md:px-4 pb-4 pt-1">
          <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>系统</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Server,   label: 'Gateway', path: '/admin',         accent: false },
              { icon: BookOpen, label: '小克日记', path: '/xiaoke-diary', accent: true  },
              { icon: Terminal, label: 'Dev',     path: '/dev',           accent: false },
            ].map(item => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all duration-150 cursor-pointer"
                style={{
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  color: C.textSecondary,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = C.sidebarActive
                  e.currentTarget.style.borderColor = C.accent + '40'
                  e.currentTarget.style.color = C.text
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = C.border
                  e.currentTarget.style.color = C.textSecondary
                }}
              >
                <item.icon size={18} strokeWidth={1.5} style={{ color: item.accent ? C.accent : 'currentColor' }} />
                <span className="text-[11px] font-medium" style={{ letterSpacing: '0.02em' }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Export */}
      <div className="px-5 md:px-4 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>导出</p>
        <div className="flex gap-2">
          <ExportButton format="json" />
          <ExportButton format="md" />
        </div>
      </div>

      {/* Logout */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          onClick={() => { logout() }}
          className="flex items-center gap-3 w-full px-5 py-4 text-sm transition-colors duration-150 cursor-pointer"
          style={{ color: C.errorText }}
        >
          <LogOut size={15} strokeWidth={1.6} />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  )
}
