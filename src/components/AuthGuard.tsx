import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import FloatingPet from './pet/FloatingPet'
import SystemAlertMonitor from './SystemAlertMonitor'

export default function AuthGuard() {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const location = useLocation()
  const sceneType = useSessionStore(s => s.currentSession?.scene_type)
  if (!isLoggedIn) return <Navigate to="/login" replace />
  const hidePet = location.pathname.startsWith('/dev') || sceneType === 'roleplay'
  return (
    <>
      <Outlet />
      {!hidePet && <FloatingPet />}
      <SystemAlertMonitor />
    </>
  )
}
