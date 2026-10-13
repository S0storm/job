import { Router } from 'express'
import { prisma } from '../db'
import { fail } from '../lib/http'
import { toQuestion } from '../lib/interview'
import { requireAuth } from '../middleware/auth'

/** 面试题管理（PRD §3.5 / §7）：按岗位取题库、掌握标记持久化 */
const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const userId = req.user!.id
  const jobId = req.query.job_id

  if (typeof jobId !== 'string' || !jobId) {
    return fail(res, 400, 'VALIDATION_ERROR', '请指定岗位')
  }

  const job = await prisma.job.findFirst({ where: { id: jobId, userId } })
  if (!job) return fail(res, 404, 'NOT_FOUND', '岗位不存在')

  const questions = await prisma.interviewQa.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: 'asc' },
  })

  res.json({ questions: questions.map(toQuestion) })
})

router.patch('/:id', async (req, res) => {
  const { mastered } = (req.body ?? {}) as { mastered?: unknown }
  if (typeof mastered !== 'boolean') {
    return fail(res, 400, 'VALIDATION_ERROR', 'mastered 必须为布尔值')
  }

  const qa = await prisma.interviewQa.findUnique({
    where: { id: String(req.params.id) },
    include: { job: { select: { userId: true } } },
  })
  if (!qa || qa.job.userId !== req.user!.id) {
    return fail(res, 404, 'NOT_FOUND', '题目不存在')
  }

  const updated = await prisma.interviewQa.update({ where: { id: qa.id }, data: { mastered } })
  res.json({ question: toQuestion(updated) })
})

export const interviewRouter = router