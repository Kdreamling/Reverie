import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Brain, Settings, LogOut, Download, FileText, Server, BookOpen, Terminal, Plug, Shield, Key, Sparkles } from 'lucide-react'
import { getC } from '../theme'
import { useNight } from '../utils/useNight'
import { useAuthStore } from '../stores/authStore'
import { client } from '../api/client'
import { useSessionStore } from '../stores/sessionStore'
import { exportSession, downloadText } from '../api/export'
import MemoryPanel from './MemoryPanel'
import FeaturesPanel from './FeaturesPanel'
import PromptPanel from './PromptPanel'
import ExternalToolsPanel from './ExternalToolsPanel'

type Page = 'menu' | 'memory' | 'features' | 'prompt' | 'ext-tools'

interface Props {
  page: Page
  onPageChange: (page: Page) => void
  onClose: () => void
}

function ExportButton({ format }: { format: 'json' | 'md' }) {
  const C = getC(useNight())
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
  const C = getC(useNight())
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()

  const menuItems = [
    { key: 'memory' as Page, icon: Brain, label: 'Memory', desc: '查看和管理记忆' },
    { key: 'features' as Page, icon: Settings, label: 'Features', desc: '功能开关' },
    { key: 'prompt' as Page, icon: FileText, label: 'Prompt', desc: '编辑晨的提示词' },
    { key: 'ext-tools' as Page, icon: Plug, label: '外部工具', desc: 'Webhook + MCP 工具接入' },
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

  if (page === 'ext-tools') {
    return (
      <div className="fixed md:absolute inset-0 z-50 md:z-10">
        <ExternalToolsPanel onBack={() => onPageChange('menu')} />
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
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Server,   label: 'Gateway', path: '/admin',         accent: false },
              { icon: BookOpen, label: '小克日记', path: '/xiaoke-diary', accent: true  },
              { icon: Sparkles, label: '小克记忆', path: '/xiaoke-memory', accent: true  },
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

      {/* Security + Logout */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          onClick={async () => {
            if (!confirm('强制登出所有设备？你需要重新登录。')) return
            try {
              await client.post('/auth/revoke', {})
              logout()
            } catch { alert('操作失败') }
          }}
          className="flex items-center gap-3 w-full px-5 py-3 text-sm transition-colors duration-150 cursor-pointer"
          style={{ color: C.textSecondary }}
        >
          <Shield size={15} strokeWidth={1.6} />
          <span>强制登出所有设备</span>
        </button>
        <button
          onClick={() => {
            const oldPw = prompt('输入当前密码：')
            if (!oldPw) return
            const newPw = prompt('输入新密码：')
            if (!newPw) return
            if (newPw.length < 4) { alert('密码至少 4 位'); return }
            client.post('/auth/change-password', { old_password: oldPw, new_password: newPw })
              .then(() => { alert('密码已修改，请重新登录'); logout() })
              .catch(() => alert('修改失败，请检查旧密码'))
          }}
          className="flex items-center gap-3 w-full px-5 py-3 text-sm transition-colors duration-150 cursor-pointer"
          style={{ color: C.textSecondary }}
        >
          <Key size={15} strokeWidth={1.6} />
          <span>修改密码</span>
        </button>
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
