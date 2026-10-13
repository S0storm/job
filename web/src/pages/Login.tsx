import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { BriefcaseBusiness, FileText, KanbanSquare, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const FEATURES = [
  { icon: FileText, title: 'AI 简历优化', desc: '针对岗位 JD 逐条优化改写' },
  { icon: KanbanSquare, title: '求职进度看板', desc: '投递到 Offer 全程可视化' },
  { icon: MessagesSquare, title: '面试题生成', desc: '基于 JD + 简历的模拟题库' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

type Mode = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const { user, loading: restoring, login, register } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">加载中…</div>
    )
  }
  if (user) return <Navigate to="/dashboard" replace />

  function validate(mode: Mode): string | null {
    if (!EMAIL_RE.test(email.trim())) return '请输入正确的邮箱地址'
    if (!password) return '请输入密码'
    if (mode === 'register') {
      if (!PASSWORD_RE.test(password)) return '密码至少 8 位，且需同时包含字母和数字'
      if (password !== confirm) return '两次输入的密码不一致'
    }
    return null
  }

  async function handleSubmit(mode: Mode, event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    const message = validate(mode)
    if (message) {
      setError(message)
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(email.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '网络异常，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* 左侧品牌区 */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
            <BriefcaseBusiness className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">求职助手</span>
        </div>
        <div className="relative space-y-8">
          <h1 className="text-4xl font-bold leading-tight text-white">
            让每一次投递<br />都更有把握
          </h1>
          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-white">{title}</p>
                  <p className="text-sm text-slate-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">© 2026 求职助手</p>
      </div>

      {/* 右侧表单区 */}
      <div className="flex w-full items-center justify-center bg-white px-6 lg:w-[520px]">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold">求职助手</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold">欢迎回来</h2>
          <p className="mt-1 text-sm text-slate-500">登录后继续你的求职旅程</p>

          <Tabs
            defaultValue="login"
            className="mt-8"
            onValueChange={() => {
              setError(null)
              setConfirm('')
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">登录</TabsTrigger>
              <TabsTrigger value="register">注册</TabsTrigger>
            </TabsList>

            {error && (
              <p className="mt-6 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
            )}

            <TabsContent value="login" className="mt-6">
              <form className="space-y-4" onSubmit={(e) => handleSubmit('login', e)}>
                <div className="space-y-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={submitting}>
                  {submitting ? '登录中…' : '登 录'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              <form className="space-y-4" onSubmit={(e) => handleSubmit('register', e)}>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">邮箱</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-pwd">设置密码</Label>
                  <Input
                    id="reg-pwd"
                    type="password"
                    autoComplete="new-password"
                    placeholder="至少 8 位，包含字母和数字"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-pwd2">确认密码</Label>
                  <Input
                    id="reg-pwd2"
                    type="password"
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={submitting}>
                  {submitting ? '注册中…' : '注册并登录'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}