import { NavLink, Outlet, useNavigate } from 'react-router'
import {
  LayoutDashboard, FileText, BriefcaseBusiness, MessagesSquare, Settings as SettingsIcon,
  Search, Bell, ChevronRight,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: '首页仪表盘' },
  { to: '/resume', icon: FileText, label: '简历中心' },
  { to: '/jobs', icon: BriefcaseBusiness, label: '求职进度' },
  { to: '/interview', icon: MessagesSquare, label: '面试题' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const nickname = user?.nickname ?? '求职者'

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800">
      {/* 侧边栏 */}
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-2 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <BriefcaseBusiness className="h-4.5 w-4.5" />
          </div>
          <span className="text-base font-bold tracking-tight">求职助手</span>
        </div>
        <Separator />
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Separator />
        <div className="p-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <SettingsIcon className="h-4 w-4" />
            设置
          </NavLink>
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-indigo-100 text-indigo-700">{nickname.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{nickname}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-6">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="搜索公司 / 岗位 / 简历…" className="pl-9 bg-slate-50" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant="secondary" className="gap-1 font-normal text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Kimi API 已连接
            </Badge>
            <button className="relative rounded-full p-2 hover:bg-slate-100">
              <Bell className="h-4.5 w-4.5 text-slate-600" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              退出登录
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        <div className="flex items-center gap-1 border-t border-slate-200 bg-white px-6 py-1.5 text-xs text-slate-400">
          <span>求职助手 v1.0</span>
          <ChevronRight className="h-3 w-3" />
          <span>AI 驱动的求职进度管理</span>
        </div>
      </div>
    </div>
  )
}
