import { useState } from 'react'
import { ChevronLeft, Brain, Settings, LogOut, Bug } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import MemoryPanel from './MemoryPanel'
import DebugPanel from './DebugPanel'

interface Props {
  onClose: () => void
  onNavigate: (page: string) => void
}

export default function SettingsPanel({ onClose, onNavigate }: Props) {
  const logout = useAuthStore(s => s.logout)
  const [page, setPage] = useState<'menu' | 'memory' | 'features' | 'debug'>('menu')

  const menuItems = [
    { key: 'memory', icon: Brain, label: 'Memory', desc: '查看和管理记忆' },
    { key: 'features', icon: Settings, label: 'Features', desc: '功能开关' },
    { key: 'debug', icon: Bug, label: 'Context Debug', desc: '查看注入给 AI 的上下文' },
  ]

  if (page === 'memory') {
    return (
      <div className="absolute inset-0 z-10">
        <MemoryPanel onBack={() => setPage('menu')} />
      </div>
    )
  }

  if (page === 'debug') {
    return (
      <div className="absolute inset-0 z-10">
        <DebugPanel onBack={() => setPage('menu')} />
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 flex flex-col z-10"
      style={{ background: '#0a1a3a', color: '#c8d4e8' }}
    >
      {/* Header */}
      <button
        onClick={onClose}
        className="flex items-center gap-2 px-4 py-4 w-full text-left transition-colors duration-150 cursor-pointer"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#c8d4e8' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <ChevronLeft size={16} strokeWidth={1.8} />
        <span className="text-sm font-medium select-none" style={{ letterSpacing: '0.05em' }}>
          Settings
        </span>
      </button>

      {/* Menu items */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {menuItems.map(item => (
          <button
            key={item.key}
            onClick={() => {
              if (item.key === 'memory') setPage('memory')
              else if (item.key === 'debug') setPage('debug')
              else onNavigate(item.key)
            }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg transition-colors duration-150 cursor-pointer text-left"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <item.icon size={18} strokeWidth={1.5} style={{ color: 'rgba(200,212,232,0.7)', flexShrink: 0 }} />
            <div className="min-w-0">
              <p className="text-sm" style={{ color: '#c8d4e8' }}>{item.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(200,212,232,0.4)' }}>{item.desc}</p>
            </div>
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={() => { logout() }}
          className="flex items-center gap-3 w-full px-5 py-4 text-sm transition-colors duration-150 cursor-pointer"
          style={{ color: 'rgba(220,140,140,0.8)' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e88')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(220,140,140,0.8)')}
        >
          <LogOut size={15} strokeWidth={1.6} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}
