import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import ReadingPage from './pages/ReadingPage'
import BookshelfPage from './pages/BookshelfPage'
import StudyPage from './pages/StudyPage'
import ErrorBookPage from './pages/ErrorBookPage'
import GraphPage from './pages/GraphPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import DashboardPage from './pages/DashboardPage'
import DiaryPage from './pages/DiaryPage'
import AdminPage from './pages/AdminPage'
import AuthGuard from './components/AuthGuard'
import ToastContainer from './components/ToastContainer'
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
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<ChatPage />} />
          <Route path="/:sessionId" element={<ChatPage />} />
          <Route path="/bookshelf" element={<BookshelfPage />} />
          <Route path="/read/:sessionId" element={<ReadingPage />} />
          <Route path="/study" element={<StudyPage />} />
          <Route path="/errors" element={<ErrorBookPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/calendar" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/diary/:date" element={<DiaryPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
