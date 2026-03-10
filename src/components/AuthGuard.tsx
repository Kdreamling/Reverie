import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function AuthGuard() {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />
}
