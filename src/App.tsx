import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import AuthGuard from './components/AuthGuard'
import ToastContainer from './components/ToastContainer'
import { useAuthStore } from './stores/authStore'
import { syncAvatarsFromBackend } from './utils/avatarEdit'

const ReadingPage = lazy(() => import('./pages/ReadingPage'))
const BookshelfPage = lazy(() => import('./pages/BookshelfPage'))
const StudyPage = lazy(() => import('./pages/StudyPage'))
const ErrorBookPage = lazy(() => import('./pages/ErrorBookPage'))
const GraphPage = lazy(() => import('./pages/GraphPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DiaryPage = lazy(() => import('./pages/DiaryPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const DevPage = lazy(() => import('./pages/DevPage'))
const XiaokeDiaryPage = lazy(() => import('./pages/XiaokeDiaryPage'))
const XiaokeMemoryPage = lazy(() => import('./pages/XiaokeMemoryPage'))
const TimelinePage = lazy(() => import('./pages/TimelinePage'))
const GameBoxPage = lazy(() => import('./pages/GameBoxPage'))
const WorkbenchPage = lazy(() => import('./pages/WorkbenchPage'))

function PageLoading() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', background: '#C49A78',
        animation: 'breathe 1.6s ease-in-out infinite',
      }} />
    </div>
  )
}

export default function App() {
  const init = useAuthStore(s => s.init)
  const logout = useAuthStore(s => s.logout)
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)

  useEffect(() => {
    init()
    const handler = () => logout()
    window.addEventListener('auth:unauthorized', handler)
    return () => window.removeEventListener('auth:unauthorized', handler)
  }, [init, logout])

  useEffect(() => {
    if (isLoggedIn) syncAvatarsFromBackend()
  }, [isLoggedIn])

  return (
    <BrowserRouter basename="/chat">
      <ToastContainer />
      <Suspense fallback={<PageLoading />}>
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
            <Route path="/dev" element={<DevPage />} />
            <Route path="/xiaoke-diary" element={<XiaokeDiaryPage />} />
            <Route path="/xiaoke-memory" element={<XiaokeMemoryPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/games" element={<GameBoxPage />} />
            <Route path="/workbench" element={<WorkbenchPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
