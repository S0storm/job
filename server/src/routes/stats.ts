import { Router } from 'express'
import { prisma } from '../db'
import { requireAuth } from '../middleware/auth'

/**
 * 首页仪表盘聚合（PRD §3.6 / §7 GET /stats/overview）。
 * 验收标准：所有数字与求职进度数据实时一致 —— 统一在后端聚合，前端不独立计算口径。
 * 说明：server tsconfig 限制 rootDir=src，不能跨包引用 shared/types.ts，状态机在此复刻。
 */

const JOB_STATUS_FLOW = ['wish', 'applied', 'written', 'interviewing', 'offer'] as const

/** 事件 → 所代表的最深阶段（流程终止不计入漏斗推进） */
const EVENT_STAGE: Record<string, number> = {
  投递简历: 1,
  笔试: 2,
  一面: 3,
  二面: 3,
  HR面: 3,
  Offer: 4,
}

const INTERVIEW_EVENT_TYPES = ['一面', '二面', 'HR面'] as const

const FUNNEL_LABELS = ['意向', '已投递', '笔试', '面试', 'Offer'] as const
const WEEK_EVENTS_LIMIT = 10

const router = Router()
router.use(requireAuth)

/** 本周起点：周一 00:00（本地时区） */
function startOfWeek(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const diff = (d.getDay() + 6) % 7 // 周一=0 … 周日=6
  d.setDate(d.getDate() - diff)
  return d
}

/** 岗位当前阶段：状态位置；「已结束」按 0 计（至少存在意向） */
function statusStage(status: string): number {
  const idx = (JOB_STATUS_FLOW as readonly string[]).indexOf(status)
  return idx < 0 ? 0 : idx
}

/** 综合状态与事件，得出岗位到达的最深阶段（保证漏斗单调递减） */
function reachedStage(status: string, eventTypes: string[]): number {
  let stage = statusStage(status)
  for (const type of eventTypes) {
    const s = EVENT_STAGE[type]
    if (typeof s === 'number' && s > stage) stage = s
  }
  return stage
}

router.get('/overview', async (req, res) => {
  const userId = req.user!.id
  const now = new Date()
  const weekStart = startOfWeek(now)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const jobs = await prisma.job.findMany({
    where: { userId },
    include: { events: { select: { type: true, eventDate: true, note: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  // 每个岗位的到达阶段，供统计卡与漏斗复用
  const withStage = jobs.map((job) => ({
    job,
    stage: reachedStage(
      job.status,
      job.events.map((e) => e.type),
    ),
  }))

  // ---- 4 统计卡 ----
  const applied = withStage.filter((j) => j.stage >= 1)
  const appliedThisMonth = applied.filter((j) => j.job.createdAt >= monthStart).length

  const interviewingJobs = jobs.filter((j) => j.status === 'interviewing')

  // 最近一场面试：优先取「未来最近」，否则取本周内最近一场
  const interviewEvents = jobs.flatMap((job) =>
    job.events
      .filter((e) => (INTERVIEW_EVENT_TYPES as readonly string[]).includes(e.type))
      .map((e) => ({ ...e, company: job.company })),
  )
  const upcoming = interviewEvents
    .filter((e) => e.eventDate >= now)
    .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())[0]
  const weekInterviewCount = interviewEvents.filter((e) => e.eventDate >= weekStart).length
  const nextInterview = upcoming
    ? { at: upcoming.eventDate, company: upcoming.company, type: upcoming.type }
    : null

  const interviewingHint =
    interviewingJobs.length > 0
      ? `${interviewingJobs[0].company} · ${interviewingJobs[0].position}`
      : ''

  const offerJobs = withStage.filter((j) => j.stage >= 4)
  const offerHint = offerJobs.length > 0 ? `${offerJobs[0].job.company} · ${offerJobs[0].job.position}` : ''

  const stats = {
    appliedTotal: applied.length,
    appliedThisMonth,
    interviewingCount: interviewingJobs.length,
    interviewingHint,
    weekInterviewCount,
    nextInterview,
    offerCount: offerJobs.length,
    offerHint,
  }

  // ---- 投递转化漏斗（同源数据，单调不增） ----
  const funnel = FUNNEL_LABELS.map((label, index) => ({
    label,
    count: withStage.filter((j) => j.stage >= index).length,
  }))

  // ---- 进行中的流程：面试中 / 笔试中 ----
  const activeJobs = jobs
    .filter((job) => job.status === 'interviewing' || job.status === 'written')
    .map((job) => ({
      id: job.id,
      company: job.company,
      position: job.position,
      city: job.city,
      salary: job.salary,
      source: job.source,
      status: job.status,
      updatedAt: job.updatedAt,
    }))

  // ---- 本周动态：本周发生的事件流水（倒序） ----
  const weekEvents = jobs
    .flatMap((job) =>
      job.events.map((e) => ({
        id: `${job.id}-${e.eventDate.getTime()}-${e.type}`,
        jobId: job.id,
        company: job.company,
        position: job.position,
        type: e.type,
        eventDate: e.eventDate,
        note: e.note,
      })),
    )
    .filter((e) => e.eventDate >= weekStart)
    .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
    .slice(0, WEEK_EVENTS_LIMIT)

  res.json({ stats, funnel, activeJobs, weekEvents })
})

export const statsRouter = router