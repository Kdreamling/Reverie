import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import FloatingPet from './pet/FloatingPet'

export default function AuthGuard() {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return (
    <>
      <Outlet />
      <FloatingPet />
    </>
  )
}
