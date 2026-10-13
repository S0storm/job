import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight, CalendarClock, CircleDot, Loader2, MessagesSquare, Send, Trophy, TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { getOverview, type ActiveJob, type Overview } from '@/lib/stats'

const STATUS_LABEL: Record<ActiveJob['status'], string> = {
  interviewing: '面试中',
  written: '笔试中',
}

const STATUS_BADGE: Record<ActiveJob['status'], string> = {
  interviewing: 'bg-violet-100 text-violet-700 hover:bg-violet-100',
  written: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/** 距离下一场面试的天数文案（今天 / 明天 / N 天） */
function countdown(atISO: string): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(atISO)
  const day = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000)
  if (days <= 0) return '就在今天'
  if (days === 1) return '就在明天'
  return `还有 ${days} 天`
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const overview = await getOverview()
        if (!cancelled) setData(overview)
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : '加载仪表盘失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center text-sm text-slate-500">
        仪表盘数据加载失败，请刷新页面重试
      </div>
    )
  }

  const { stats, funnel, activeJobs, weekEvents } = data

  const CARDS = [
    {
      icon: Send,
      label: '累计投递',
      value: stats.appliedTotal,
      sub: `本月新增 ${stats.appliedThisMonth}`,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      icon: MessagesSquare,
      label: '面试中',
      value: stats.interviewingCount,
      sub: stats.interviewingHint || '暂无进行中的面试',
      color: 'bg-violet-50 text-violet-600',
    },
    {
      icon: CalendarClock,
      label: '本周面试',
      value: stats.weekInterviewCount,
      sub: stats.nextInterview
        ? `${stats.nextInterview.company} · ${formatDateTime(stats.nextInterview.at).slice(5)}`
        : '本周暂无面试安排',
      color: 'bg-amber-50 text-amber-600',
    },
    {
      icon: Trophy,
      label: 'Offer',
      value: stats.offerCount,
      sub: stats.offerHint || '继续加油，Offer 在路上',
      color: 'bg-emerald-50 text-emerald-600',
    },
  ]

  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count))
  const applied = funnel.find((f) => f.label === '已投递')?.count ?? 0
  const interviewed = funnel.find((f) => f.label === '面试')?.count ?? 0
  const conversion = applied > 0 ? Math.round((interviewed / applied) * 100) : 0

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">{greeting()}，{user?.nickname ?? '求职者'} 👋</h1>
          <p className="mt-1 text-sm text-slate-500">
            {stats.nextInterview
              ? `距离 ${stats.nextInterview.company} ${stats.nextInterview.type} ${countdown(stats.nextInterview.at)}，祝你顺利！`
              : '记录投递进展，让求职节奏尽在掌握'}
          </p>
        </div>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
          <Link to="/jobs"><CircleDot className="mr-2 h-4 w-4" />记录新投递</Link>
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {CARDS.map(({ icon: Icon, label, value, sub, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-5.5 w-5.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="text-2xl font-bold leading-tight">{value}</p>
                <p className="truncate text-xs text-slate-400" title={sub}>{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 转化漏斗 */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">投递转化漏斗</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {funnel.map((f, i) => (
              <div key={f.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{f.label}</span>
                  <span className="font-semibold">{f.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${i === funnel.length - 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${(f.count / maxFunnel) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs text-slate-400">
              {applied > 0
                ? `投递 → 面试转化率 ${conversion}%（${interviewed}/${applied}）`
                : '记录投递后即可查看转化率'}
            </p>
          </CardContent>
        </Card>

        {/* 进行中的流程 */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">进行中的流程</CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-indigo-600">
              <Link to="/jobs">查看全部 <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {activeJobs.length === 0 && (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">
                暂无进行中的笔试 / 面试流程
              </p>
            )}
            {activeJobs.map((j) => (
              <Link
                key={j.id}
                to={`/jobs/${j.id}`}
                className="flex items-center gap-4 rounded-xl border border-slate-200 p-3.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                  {j.company.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{j.company} · {j.position}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[j.city, j.salary, j.source && `来源：${j.source}`].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <Badge className={STATUS_BADGE[j.status]}>{STATUS_LABEL[j.status]}</Badge>
              </Link>
            ))}

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="mb-2 text-sm font-medium text-slate-700">本周动态</p>
              <ul className="space-y-1.5 text-sm text-slate-500">
                {weekEvents.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                    <span className="shrink-0">{formatDateTime(e.eventDate).slice(5, 10)}</span>
                    <span className="shrink-0 text-slate-600">{e.company} · {e.type}</span>
                    {e.note && <span className="truncate text-slate-400">— {e.note}</span>}
                  </li>
                ))}
                {weekEvents.length === 0 && <li>暂无本周动态</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}