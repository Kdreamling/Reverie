import { useEffect, useRef } from 'react'

const TOKEN_KEY = 'workbench_token'

export default function WorkbenchPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY) || ''
    if (token && iframeRef.current) {
      // pass token via postMessage after iframe loads
      const iframe = iframeRef.current
      const handler = () => {
        iframe.contentWindow?.postMessage({ type: 'wb_auth', token }, '*')
      }
      iframe.addEventListener('load', handler)
      return () => iframe.removeEventListener('load', handler)
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'fixed', inset: 0 }}>
      <iframe
        ref={iframeRef}
        src="/workbench/"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
      />
    </div>
  )
}
