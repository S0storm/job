import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiFetch } from './api'

export interface AuthUser {
  id: string
  email: string
  nickname: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** 同步本地用户信息（如设置页修改昵称后更新顶栏展示） */
  updateUser: (patch: Partial<AuthUser>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // 首次挂载时用 /auth/me 恢复会话（刷新页面保持登录）
  useEffect(() => {
    let alive = true
    apiFetch<{ user: AuthUser }>('/auth/me')
      .then((data) => {
        if (alive) setUser(data.user)
      })
      .catch(() => {
        if (alive) setUser(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  async function login(email: string, password: string) {
    const data = await apiFetch<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setUser(data.user)
  }

  async function register(email: string, password: string) {
    const data = await apiFetch<{ user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setUser(data.user)
  }

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // 即便请求失败也清理本地状态
    }
    setUser(null)
  }

  function updateUser(patch: Partial<AuthUser>) {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}