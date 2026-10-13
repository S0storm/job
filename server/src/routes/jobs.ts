import { Router } from 'express'
import type { Job, JobEvent, Prisma } from '@prisma/client'
import { prisma } from '../db'
import { fail } from '../lib/http'
import { requireAuth } from '../middleware/auth'

/**
 * 求职进度（PRD §3.4 / §6 / §7）。
 * 说明：server tsconfig 限制 rootDir=src，不能跨包引用 shared/types.ts，
 * 因此状态机与事件类型在此处复刻一份，取值与 shared/types.ts 保持一致。
 */

const JOB_STATUSES = ['wish', 'applied', 'written', 'interviewing', 'offer', 'ended'] as const
type JobStatus = (typeof JOB_STATUSES)[number]

/** 单向流转顺序：意向 → 已投递 → 笔试中 → 面试中 → Offer；任意阶段可进入终态「已结束」 */
const JOB_STATUS_FLOW: JobStatus[] = ['wish', 'applied', 'written', 'interviewing', 'offer']

const JOB_EVENT_TYPES = [
  '投递简历',
  '笔试',
  '一面',
  '二面',
  'HR面',
  'Offer',
  '流程终止',
] as const

/** PRD §3.2 沿用：JD/文本类字段上限，防止超长输入 */
const JD_MAX = 10000
const SHORT_FIELD_MAX = 100
const NOTE_MAX = 2000

const router = Router()
router.use(requireAuth)

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (JOB_STATUSES as readonly string[]).includes(value)
}

function isEventType(value: unknown): value is (typeof JOB_EVENT_TYPES)[number] {
  return typeof value === 'string' && (JOB_EVENT_TYPES as readonly string[]).includes(value)
}

/** 读取可选短文本字段：undefined 表示不更新；空字符串归一为 null */
function readShortField(
  value: unknown,
): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, message: '字段格式不正确' }
  const trimmed = value.trim()
  if (trimmed.length > SHORT_FIELD_MAX) {
    return { ok: false, message: `内容不能超过 ${SHORT_FIELD_MAX} 字符` }
  }
  return { ok: true, value: trimmed || null }
}

/** PATCH /jobs/:id/status 的状态机校验（PRD §3.4） */
function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true
  // 终态不可再流转
  if (from === 'ended') return false
  // 任意阶段可进入终态「已结束」
  if (to === 'ended') return true
  // 其余仅允许沿单向流程向前推进
  return JOB_STATUS_FLOW.indexOf(to) > JOB_STATUS_FLOW.indexOf(from)
}

function toJob(job: Job, eventCount: number) {
  return {
    id: job.id,
    company: job.company,
    position: job.position,
    salary: job.salary,
    city: job.city,
    source: job.source,
    jdText: job.jdText,
    status: job.status,
    eventCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

function toEvent(event: JobEvent) {
  return {
    id: event.id,
    jobId: event.jobId,
    type: event.type,
    eventDate: event.eventDate,
    note: event.note,
    createdAt: event.createdAt,
  }
}

async function findOwnedJob(id: string, userId: string): Promise<Job | null> {
  return prisma.job.findFirst({ where: { id, userId } })
}

// ---------- 岗位 ----------

router.get('/', async (req, res) => {
  const userId = req.user!.id
  const status = req.query.status

  if (status !== undefined && !isJobStatus(status)) {
    return fail(res, 400, 'VALIDATION_ERROR', '状态参数不合法')
  }

  const jobs = await prisma.job.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { events: true } } },
  })

  res.json({ jobs: jobs.map((j) => toJob(j, j._count.events)) })
})

router.post('/', async (req, res) => {
  const userId = req.user!.id
  const { company, position, salary, city, source, jdText, status } = (req.body ?? {}) as Record<
    string,
    unknown
  >

  if (typeof company !== 'string' || !company.trim()) {
    return fail(res, 400, 'VALIDATION_ERROR', '请填写公司名称')
  }
  if (company.trim().length > SHORT_FIELD_MAX) {
    return fail(res, 400, 'VALIDATION_ERROR', `公司名称不能超过 ${SHORT_FIELD_MAX} 字符`)
  }
  if (typeof position !== 'string' || !position.trim()) {
    return fail(res, 400, 'VALIDATION_ERROR', '请填写岗位名称')
  }
  if (position.trim().length > SHORT_FIELD_MAX) {
    return fail(res, 400, 'VALIDATION_ERROR', `岗位名称不能超过 ${SHORT_FIELD_MAX} 字符`)
  }
  if (status !== undefined && !isJobStatus(status)) {
    return fail(res, 400, 'VALIDATION_ERROR', '初始状态不合法')
  }
  if (jdText !== undefined && typeof jdText !== 'string') {
    return fail(res, 400, 'VALIDATION_ERROR', 'JD 格式不正确')
  }
  if (typeof jdText === 'string' && jdText.length > JD_MAX) {
    return fail(res, 400, 'VALIDATION_ERROR', `JD 不能超过 ${JD_MAX} 字符`)
  }

  const optional: Record<string, string | null> = {}
  for (const [key, value] of Object.entries({ salary, city, source })) {
    const parsed = readShortField(value)
    if (!parsed.ok) return fail(res, 400, 'VALIDATION_ERROR', `${key} ${parsed.message}`)
    optional[key] = parsed.value ?? null
  }

  const job = await prisma.job.create({
    data: {
      userId,
      company: company.trim(),
      position: position.trim(),
      salary: optional.salary,
      city: optional.city,
      source: optional.source,
      jdText: typeof jdText === 'string' ? jdText.trim() || null : null,
      status: status ?? 'wish',
    },
  })

  res.status(201).json({ job: toJob(job, 0) })
})

router.get('/:id', async (req, res) => {
  const job = await findOwnedJob(String(req.params.id), req.user!.id)
  if (!job) return fail(res, 404, 'NOT_FOUND', '岗位不存在')

  const events = await prisma.jobEvent.findMany({
    where: { jobId: job.id },
    orderBy: { eventDate: 'desc' }, // 时间线倒序（PRD §3.4）
  })

  res.json({ job: toJob(job, events.length), events: events.map(toEvent) })
})

router.put('/:id', async (req, res) => {
  const job = await findOwnedJob(String(req.params.id), req.user!.id)
  if (!job) return fail(res, 404, 'NOT_FOUND', '岗位不存在')

  const { company, position, salary, city, source, jdText } = (req.body ?? {}) as Record<
    string,
    unknown
  >

  const data: Prisma.JobUpdateInput = {}

  if (company !== undefined) {
    if (typeof company !== 'string' || !company.trim()) {
      return fail(res, 400, 'VALIDATION_ERROR', '公司名称不能为空')
    }
    data.company = company.trim()
  }
  if (position !== undefined) {
    if (typeof position !== 'string' || !position.trim()) {
      return fail(res, 400, 'VALIDATION_ERROR', '岗位名称不能为空')
    }
    data.position = position.trim()
  }
  const salaryField = readShortField(salary)
  if (!salaryField.ok) return fail(res, 400, 'VALIDATION_ERROR', `薪资 ${salaryField.message}`)
  if (salaryField.value !== undefined) data.salary = salaryField.value

  const cityField = readShortField(city)
  if (!cityField.ok) return fail(res, 400, 'VALIDATION_ERROR', `城市 ${cityField.message}`)
  if (cityField.value !== undefined) data.city = cityField.value

  const sourceField = readShortField(source)
  if (!sourceField.ok) return fail(res, 400, 'VALIDATION_ERROR', `投递渠道 ${sourceField.message}`)
  if (sourceField.value !== undefined) data.source = sourceField.value

  if (jdText !== undefined) {
    if (jdText !== null && typeof jdText !== 'string') {
      return fail(res, 400, 'VALIDATION_ERROR', 'JD 格式不正确')
    }
    if (typeof jdText === 'string' && jdText.length > JD_MAX) {
      return fail(res, 400, 'VALIDATION_ERROR', `JD 不能超过 ${JD_MAX} 字符`)
    }
    data.jdText = typeof jdText === 'string' ? jdText.trim() || null : null
  }

  const updated = await prisma.job.update({ where: { id: job.id }, data })
  const eventCount = await prisma.jobEvent.count({ where: { jobId: job.id } })
  res.json({ job: toJob(updated, eventCount) })
})

router.patch('/:id/status', async (req, res) => {
  const job = await findOwnedJob(String(req.params.id), req.user!.id)
  if (!job) return fail(res, 404, 'NOT_FOUND', '岗位不存在')

  const { status } = (req.body ?? {}) as { status?: unknown }
  if (!isJobStatus(status)) return fail(res, 400, 'VALIDATION_ERROR', '目标状态不合法')

  if (!canTransition(job.status as JobStatus, status)) {
    return fail(res, 409, 'INVALID_STATUS_FLOW', '状态仅支持沿流程向前推进，或标记为「已结束」')
  }

  const updated =
    status === job.status
      ? job
      : await prisma.job.update({ where: { id: job.id }, data: { status } })

  const eventCount = await prisma.jobEvent.count({ where: { jobId: job.id } })
  res.json({ job: toJob(updated, eventCount) })
})

router.delete('/:id', async (req, res) => {
  const job = await findOwnedJob(String(req.params.id), req.user!.id)
  if (!job) return fail(res, 404, 'NOT_FOUND', '岗位不存在')

  await prisma.job.delete({ where: { id: job.id } }) // 级联删除事件与题目（PRD §7）
  res.json({ ok: true })
})

// ---------- 事件 ----------

router.post('/:id/events', async (req, res) => {
  const job = await findOwnedJob(String(req.params.id), req.user!.id)
  if (!job) return fail(res, 404, 'NOT_FOUND', '岗位不存在')

  const { type, eventDate, note } = (req.body ?? {}) as {
    type?: unknown
    eventDate?: unknown
    note?: unknown
  }

  if (!isEventType(type)) return fail(res, 400, 'VALIDATION_ERROR', '请选择事件类型')
  if (typeof eventDate !== 'string' || !eventDate.trim()) {
    return fail(res, 400, 'VALIDATION_ERROR', '请选择事件日期')
  }
  const parsedDate = new Date(eventDate)
  if (Number.isNaN(parsedDate.getTime())) {
    return fail(res, 400, 'VALIDATION_ERROR', '事件日期格式不正确')
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return fail(res, 400, 'VALIDATION_ERROR', '备注格式不正确')
  }
  if (typeof note === 'string' && note.length > NOTE_MAX) {
    return fail(res, 400, 'VALIDATION_ERROR', `备注不能超过 ${NOTE_MAX} 字符`)
  }

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.jobEvent.create({
      data: {
        jobId: job.id,
        type,
        eventDate: parsedDate,
        note: typeof note === 'string' ? note.trim() || null : null,
      },
    })
    // 触发 jobs.updated_at，使看板列内排序反映最新动态
    await tx.job.update({ where: { id: job.id }, data: {} })
    return created
  })

  res.status(201).json({ event: toEvent(event) })
})

export const jobsRouter = router

// DELETE /events/:id 与前缀不同，单独导出路由（PRD §7）
const eventsRouter = Router()
eventsRouter.use(requireAuth)

eventsRouter.delete('/:id', async (req, res) => {
  const event = await prisma.jobEvent.findUnique({
    where: { id: String(req.params.id) },
    include: { job: { select: { userId: true } } },
  })
  if (!event || event.job.userId !== req.user!.id) {
    return fail(res, 404, 'NOT_FOUND', '事件不存在')
  }

  await prisma.$transaction(async (tx) => {
    await tx.jobEvent.delete({ where: { id: event.id } })
    await tx.job.update({ where: { id: event.jobId }, data: {} })
  })

  res.json({ ok: true })
})

export const eventsRouterExport = eventsRouter