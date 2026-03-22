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
      className="fixed left-1/2 z-30 transition-opacity duration-200"
      style={{
        bottom: 24,
        transform: 'translateX(-50%)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <button
        onClick={onClick}
        className="rounded-full px-5 py-3 text-sm font-medium cursor-pointer transition-transform duration-200 hover:scale-[1.02]"
        style={{
          background: '#002FA7',
          color: '#fff',
          border: 'none',
          boxShadow: '0 12px 30px rgba(0, 47, 167, 0.24)',
          whiteSpace: 'nowrap',
        }}
      >
        {preview ? `和小克聊「${preview}」` : '和小克聊这段'}
      </button>
    </div>
  )
}
