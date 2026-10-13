import { useEffect, useState } from 'react'
import { Bell, Database, Eye, EyeOff, KeyRound, Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  getSettings, saveAiConfig, testAiConnection, updateNotifications, updateProfile,
  type SettingsPayload,
} from '@/lib/settings'

const MODEL_LABELS: Record<string, string> = {
  'kimi-k2.6': 'kimi-k2.6（推荐，长文本）',
  'moonshot-v1-128k': 'moonshot-v1-128k',
}

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

export default function Settings() {
  const { user, updateUser } = useAuth()

  const [data, setData] = useState<SettingsPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState('')
  const [savingAi, setSavingAi] = useState(false)
  const [testing, setTesting] = useState(false)

  const [nickname, setNickname] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [notifications, setNotifications] = useState({
    notifyInterview: true,
    notifyNoFeedback: true,
  })
  const [savingNotify, setSavingNotify] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const payload = await getSettings()
        if (cancelled) return
        setData(payload)
        setModel(payload.ai.model)
        setNickname(payload.account.nickname)
        setNotifications(payload.notifications)
      } catch (err) {
        if (!cancelled) toast.error(errText(err, '加载设置失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSaveAi() {
    setSavingAi(true)
    try {
      const input: { apiKey?: string; model: string } = { model }
      const typed = keyInput.trim()
      if (typed) input.apiKey = typed
      const { ai } = await saveAiConfig(input)
      setData((prev) => (prev ? { ...prev, ai } : prev))
      setKeyInput('')
      toast.success('AI 配置已保存')
    } catch (err) {
      toast.error(errText(err, '保存失败，请重试'))
    } finally {
      setSavingAi(false)
    }
  }

  async function handleClearKey() {
    setSavingAi(true)
    try {
      const { ai } = await saveAiConfig({ apiKey: '' })
      setData((prev) => (prev ? { ...prev, ai } : prev))
      setKeyInput('')
      toast.success('已清除自定义 Key，回退服务端环境变量配置')
    } catch (err) {
      toast.error(errText(err, '操作失败，请重试'))
    } finally {
      setSavingAi(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      const typed = keyInput.trim()
      const { model: usedModel } = await testAiConnection(typed ? { apiKey: typed, model } : { model })
      toast.success(`连接正常（模型 ${usedModel}）`)
    } catch (err) {
      toast.error(errText(err, '连接测试失败'))
    } finally {
      setTesting(false)
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true)
    try {
      const { user: updated } = await updateProfile(nickname)
      setData((prev) => (prev ? { ...prev, account: { ...prev.account, nickname: updated.nickname } } : prev))
      updateUser({ nickname: updated.nickname })
      toast.success('昵称已更新')
    } catch (err) {
      toast.error(errText(err, '昵称保存失败'))
    } finally {
      setSavingProfile(false)
    }
  }

  async function toggleNotify(key: 'notifyInterview' | 'notifyNoFeedback', value: boolean) {
    const prev = notifications
    setNotifications({ ...prev, [key]: value })
    setSavingNotify(true)
    try {
      const { notifications: saved } = await updateNotifications({ [key]: value })
      setNotifications(saved)
    } catch (err) {
      setNotifications(prev)
      toast.error(errText(err, '通知偏好保存失败'))
    } finally {
      setSavingNotify(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center text-sm text-slate-500">
        设置加载失败，请刷新页面重试
      </div>
    )
  }

  const { ai, account } = data

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">设置</h1>
        <p className="mt-1 text-sm text-slate-500">AI 服务配置、账号信息与通知偏好</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-slate-400" /> AI 服务配置
          </CardTitle>
          <CardDescription>
            使用你自己的 Kimi API Key，Key 在服务端 AES-256 加密存储
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Kimi API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={ai.keyMasked || 'sk-...'}
                className="font-mono"
                autoComplete="off"
              />
              <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)} aria-label="切换显示">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              {ai.source === 'user'
                ? '当前生效：你的自定义 Key（留空则保持不变）'
                : ai.configured
                  ? '当前生效：服务端环境变量配置的 Key'
                  : '尚未配置 Key，填写后将启用 AI 能力'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>模型</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ai.models.map((m) => (
                    <SelectItem key={m} value={m}>{MODEL_LABELS[m] ?? m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>本月消耗</Label>
              <Input
                readOnly
                value={
                  ai.monthly.calls > 0
                    ? `${ai.monthly.calls} 次调用 · ${ai.monthly.tokensTotal} tokens`
                    : '本月暂无调用'
                }
                className="bg-slate-50"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-600">
              {ai.configured
                ? `连接可用 · ${ai.source === 'user' ? '自定义 Key' : '环境变量'}`
                : '未配置 Key'}
            </span>
            <div className="flex items-center gap-2">
              {ai.source === 'user' && (
                <Button variant="ghost" size="sm" onClick={() => void handleClearKey()} disabled={savingAi}>
                  清除自定义 Key
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={testing || savingAi}>
                {testing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                测试连接
              </Button>
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => void handleSaveAi()}
                disabled={savingAi || testing}
              >
                {savingAi && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                保存
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-slate-400" /> 账号信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>昵称</Label>
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} />
            </div>
            <div className="space-y-2">
              <Label>邮箱（登录账号）</Label>
              <Input value={account.email || user?.email || ''} readOnly className="bg-slate-50" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSaveProfile()}
              disabled={savingProfile || !nickname.trim() || nickname.trim() === account.nickname}
            >
              {savingProfile && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              保存昵称
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">修改密码</p>
              <p className="text-xs text-slate-400">通过邮箱验证后重置</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.info('邮箱重置密码将在后续版本提供')}
            >
              发送重置邮件
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-slate-400" /> 通知偏好
          </CardTitle>
          <CardDescription>V1 仅持久化开关，不触发实际通知</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              key: 'notifyInterview' as const,
              label: '面试前一天提醒',
              desc: '邮件 + 站内通知',
            },
            {
              key: 'notifyNoFeedback' as const,
              label: '投递 7 天无反馈提醒',
              desc: '提示跟进 HR',
            },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-xs text-slate-400">{n.desc}</p>
              </div>
              <Switch
                checked={notifications[n.key]}
                disabled={savingNotify}
                onCheckedChange={(v) => void toggleNotify(n.key, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-slate-400" /> 数据管理
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-slate-500">导出全部求职数据（JSON 备份）</p>
          <Button variant="outline" size="sm" disabled title="V1.1 版本提供">
            导出（V1.1）
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}