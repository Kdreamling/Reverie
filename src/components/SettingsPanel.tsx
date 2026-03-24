import { ChevronLeft, Brain, Settings, LogOut } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import MemoryPanel from './MemoryPanel'
import FeaturesPanel from './FeaturesPanel'

type Page = 'menu' | 'memory' | 'features'

interface Props {
  page: Page
  onPageChange: (page: Page) => void
  onClose: () => void
}

export default function SettingsPanel({ page, onPageChange, onClose }: Props) {
  const logout = useAuthStore(s => s.logout)

  const menuItems = [
    { key: 'memory' as Page, icon: Brain, label: 'Memory', desc: '查看和管理记忆' },
    { key: 'features' as Page, icon: Settings, label: 'Features', desc: '功能开关' },
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

  return (
    <div
      className="fixed md:absolute inset-0 flex flex-col z-50 md:z-10"
      style={{ background: '#fafbfd', color: '#1a1f2e' }}
    >
      <style>{`@media (min-width: 768px) { .settings-root { background: #0a1a3a !important; color: #c8d4e8 !important; } }`}</style>

      {/* Header */}
      <button
        onClick={onClose}
        className="flex items-center gap-2.5 px-5 md:px-4 w-full text-left transition-colors duration-150 cursor-pointer"
        style={{
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 16,
          borderBottom: '1px solid #e8ecf5',
        }}
      >
        <ChevronLeft size={18} strokeWidth={1.8} style={{ color: '#7a8399' }} />
        <span className="text-base md:text-sm font-medium select-none" style={{ letterSpacing: '0.05em' }}>
          Settings
        </span>
      </button>

      {/* Menu items */}
      <nav className="flex-1 overflow-y-auto px-3 md:px-2 py-4 md:py-3">
        {menuItems.map(item => (
          <button
            key={item.key}
            onClick={() => onPageChange(item.key)}
            className="flex items-center gap-4 md:gap-3 w-full px-4 md:px-3 py-4 md:py-3 rounded-xl md:rounded-lg transition-colors duration-150 cursor-pointer text-left mb-1"
            style={{ background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,47,167,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ width: 40, height: 40, background: '#eef1f8', flexShrink: 0 }}
            >
              <item.icon size={18} strokeWidth={1.5} style={{ color: '#002FA7' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: '#1a1f2e' }}>{item.label}</p>
              <p className="text-xs mt-0.5" style={{ color: '#9aa3b8' }}>{item.desc}</p>
            </div>
            <ChevronLeft size={14} strokeWidth={2} style={{ color: '#c0c8d8', transform: 'rotate(180deg)', marginLeft: 'auto', flexShrink: 0 }} />
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ borderTop: '1px solid #e8ecf5', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          onClick={() => { logout() }}
          className="flex items-center gap-3 w-full px-5 py-4 text-sm transition-colors duration-150 cursor-pointer"
          style={{ color: '#c05050' }}
        >
          <LogOut size={15} strokeWidth={1.6} />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  )
}
