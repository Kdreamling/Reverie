import { C } from '../../theme'

interface FloatingChatButtonProps {
  visible: boolean
  preview: string
  onClick: () => void
}

export default function FloatingChatButton({
  visible,
  preview,
  onClick,
}: FloatingChatButtonProps) {
  return (
    <div
      className="fixed left-1/2 z-30 transition-all duration-200"
      style={{
        bottom: 24,
        transform: `translateX(-50%) ${visible ? 'scale(1)' : 'scale(0.9) translateY(4px)'}`,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <button
        onClick={onClick}
        className="flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium cursor-pointer"
        style={{
          background: C.text,
          color: '#FFFCF7',
          border: 'none',
          boxShadow: '0 4px 16px rgba(92,75,58,0.25)',
          whiteSpace: 'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z"/>
        </svg>
        {preview ? `和小克聊「${preview}」` : '和小克聊这段'}
      </button>
    </div>
  )
}
