import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import ReadingPage from './pages/ReadingPage'
import GraphPage from './pages/GraphPage'
import AuthGuard from './components/AuthGuard'
import { useAuthStore } from './stores/authStore'

export default function App() {
  const init = useAuthStore(s => s.init)
  const logout = useAuthStore(s => s.logout)

  useEffect(() => {
    init()
    const handler = () => logout()
    window.addEventListener('auth:unauthorized', handler)
    return () => window.removeEventListener('auth:unauthorized', handler)
  }, [init, logout])

  return (
    <BrowserRouter basename="/chat">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<ChatPage />} />
          <Route path="/:sessionId" element={<ChatPage />} />
          <Route path="/read/:sessionId" element={<ReadingPage />} />
          <Route path="/graph" element={<GraphPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
