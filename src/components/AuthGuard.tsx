import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import FloatingPet from './pet/FloatingPet'

export default function AuthGuard() {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const location = useLocation()
  if (!isLoggedIn) return <Navigate to="/login" replace />
  // Dev 页面是终端沙箱，桌宠不侵入
  const hidePet = location.pathname.startsWith('/dev')
  return (
    <>
      <Outlet />
      {!hidePet && <FloatingPet />}
    </>
  )
}
