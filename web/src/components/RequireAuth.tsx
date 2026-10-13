import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/lib/auth'

/** 受保护路由守卫：未登录重定向到 /login（PRD §3.1） */
export default function RequireAuth() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">加载中…</div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}