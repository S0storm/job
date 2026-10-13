import { Router } from 'express'
import { prisma } from '../db'
import { parseModelJson } from '../lib/aiJson'
import { recordAiCall } from '../lib/aiLogs'
import { resolveUserAiConfig } from '../lib/aiSettings'
import { createTask, getTask, runTask } from '../lib/aiTasks'
import { fail } from '../lib/http'
import { toQuestion, validateInterviewResult } from '../lib/interview'
import { chatCompletion, isKimiConfigured, KimiError, type ChatMessage } from '../lib/kimi'
import { requireAuth } from '../middleware/auth'
import { INTERVIEW_SYSTEM_PROMPT, OPTIMIZE_SYSTEM_PROMPT } from '../prompts'

/** PRD §3.3 优化结果契约 */
interface OptimizeResult {
  suggestions: string[]
  optimized_content: string
}

/** PRD §3.3：JD 文本上限（防止超长输入放大成本） */
const JD_MAX = 10000
/** 优化场景 temperature（PRD §8.1：求稳） */
const OPTIMIZE_TEMPERATURE = 0.4
/** 面试题场景 temperature（PRD §8.1：求发散） */
const INTERVIEW_TEMPERATURE = 0.7

const router = Router()
router.use(requireAuth)

/**
 * 模型可能把单条建议输出成对象（如 {"对应JD要求": "...", "优化建议": "..."}），
 * 按 PRD §8.4「宽容解析」归一为可读文本，保证对外契约仍是 string[]（PRD §3.3）。
 */
function normalizeSuggestion(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.trim() || null
  if (entry && typeof entry === 'object') {
    const parts = Object.entries(entry as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'string' && (value as string).trim())
      .map(([key, value]) => `${key}：${(value as string).trim()}`)
    return parts.length > 0 ? parts.join('；') : null
  }
  return null
}

function validateOptimizeResult(value: unknown): OptimizeResult {
  const v = value as { suggestions?: unknown; optimized_content?: unknown }
  if (!v || typeof v !== 'object') throw new Error('模型结果不是对象')
  if (!Array.isArray(v.suggestions) || v.suggestions.length === 0) {
    throw new Error('suggestions 不能为空')
  }
  const suggestions: string[] = []
  for (const entry of v.suggestions) {
    const text = normalizeSuggestion(entry)
    if (!text) throw new Error('suggestions 存在非法条目')
    suggestions.push(text)
  }
  if (typeof v.optimized_content !== 'string' || !v.optimized_content.trim()) {
    throw new Error('optimized_content 不能为空')
  }
  return {
    suggestions,
    optimized_content: v.optimized_content,
  }
}

router.post('/optimize', async (req, res) => {
  const userId = req.user!.id
  const { resume_id: resumeId, jd_text: jdText } = (req.body ?? {}) as {
    resume_id?: unknown
    jd_text?: unknown
  }

  if (typeof resumeId !== 'string' || !resumeId) {
    return fail(res, 400, 'VALIDATION_ERROR', '请选择要优化的简历')
  }
  if (typeof jdText !== 'string' || !jdText.trim()) {
    return fail(res, 400, 'VALIDATION_ERROR', '请粘贴目标岗位 JD')
  }
  if (jdText.length > JD_MAX) {
    return fail(res, 400, 'VALIDATION_ERROR', `JD 不能超过 ${JD_MAX} 字符`)
  }

  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } })
  if (!resume) return fail(res, 404, 'NOT_FOUND', '简历不存在')

  // 用户级 Key 优先，回退服务端 env；均未配置时快速失败引导设置页（PRD §3.3 / §8.1）
  const aiConfig = await resolveUserAiConfig(userId)
  if (!isKimiConfigured(aiConfig)) {
    return fail(res, 400, 'AI_NOT_CONFIGURED', '尚未配置 Kimi API Key，请前往「设置」页配置后重试')
  }

  const taskId = createTask(userId, 'optimize')

  // 异步执行，立即返回 task_id 供前端轮询；生成过程不阻塞页面
  void runTask(taskId, async () => {
    let tokensIn = 0
    let tokensOut = 0
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: OPTIMIZE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `【简历原文】\n${resume.content}\n\n【目标岗位 JD】\n${jdText.trim()}`,
        },
      ]
      const chat = await chatCompletion(messages, OPTIMIZE_TEMPERATURE, aiConfig)
      tokensIn = chat.tokensIn
      tokensOut = chat.tokensOut

      const result = parseModelJson(chat.content, validateOptimizeResult)
      await recordAiCall({ userId, scene: 'optimize', tokensIn, tokensOut, status: 'ok' })
      return { result, tokensIn, tokensOut }
    } catch (err) {
      // 二次失败也落库（PRD §8.4：标记 failed，返回可重试错误）
      await recordAiCall({ userId, scene: 'optimize', tokensIn, tokensOut, status: 'failed' })
      throw err
    }
  })

  res.status(202).json({ task_id: taskId })
})

router.get('/tasks/:id', (req, res) => {
  const task = getTask(String(req.params.id), req.user!.id)
  if (!task) return fail(res, 404, 'NOT_FOUND', '任务不存在或已过期')
  res.json({ task })
})

/**
 * PRD §3.5 / §7：基于岗位 JD + 简历整批生成面试题并落库（同步返回题目）。
 * 「重新生成」= 整批替换：AI 解析成功后在事务内先删后插，失败不产生脏数据。
 */
router.post('/interview-questions', async (req, res) => {
  const userId = req.user!.id
  const { job_id: jobId, resume_id: resumeId } = (req.body ?? {}) as {
    job_id?: unknown
    resume_id?: unknown
  }

  if (typeof jobId !== 'string' || !jobId) {
    return fail(res, 400, 'VALIDATION_ERROR', '请选择目标岗位')
  }
  if (typeof resumeId !== 'string' || !resumeId) {
    return fail(res, 400, 'VALIDATION_ERROR', '请选择用于出题的简历')
  }

  const job = await prisma.job.findFirst({ where: { id: jobId, userId } })
  if (!job) return fail(res, 404, 'NOT_FOUND', '岗位不存在')
  // PRD §3.5：仅非「已结束 / 意向」的岗位可生成
  if (job.status === 'wish' || job.status === 'ended') {
    return fail(res, 400, 'VALIDATION_ERROR', '仅「已投递」及之后的岗位可生成面试题')
  }

  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } })
  if (!resume) return fail(res, 404, 'NOT_FOUND', '简历不存在')

  const aiConfig = await resolveUserAiConfig(userId)
  if (!isKimiConfigured(aiConfig)) {
    return fail(res, 400, 'AI_NOT_CONFIGURED', '尚未配置 Kimi API Key，请前往「设置」页配置后重试')
  }

  let tokensIn = 0
  let tokensOut = 0
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: INTERVIEW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `【岗位】${job.company} · ${job.position}\n\n【岗位 JD】\n${
          job.jdText?.trim() || '（该岗位未录入 JD，请基于岗位名称与常见职责出题）'
        }\n\n【候选人简历】\n${resume.content}`,
      },
    ]
    const chat = await chatCompletion(messages, INTERVIEW_TEMPERATURE, aiConfig)
    tokensIn = chat.tokensIn
    tokensOut = chat.tokensOut

    const result = parseModelJson(chat.content, validateInterviewResult)

    const questions = await prisma.$transaction(async (tx) => {
      await tx.interviewQa.deleteMany({ where: { jobId: job.id } })
      for (const q of result.questions) {
        await tx.interviewQa.create({
          data: {
            jobId: job.id,
            category: q.category,
            question: q.question,
            answer: q.answer,
            keyPoints: q.key_points,
          },
        })
      }
      // 触发 jobs.updated_at，让看板/详情反映最新动态
      await tx.job.update({ where: { id: job.id }, data: {} })
      return tx.interviewQa.findMany({ where: { jobId: job.id }, orderBy: { createdAt: 'asc' } })
    })

    await recordAiCall({ userId, scene: 'interview', tokensIn, tokensOut, status: 'ok' })
    res.status(201).json({ questions: questions.map(toQuestion) })
  } catch (err) {
    await recordAiCall({ userId, scene: 'interview', tokensIn, tokensOut, status: 'failed' })
    // 同步接口需把 Kimi 错误映射为明确的 HTTP 错误码，供前端提示与重试
    if (err instanceof KimiError) {
      const status = err.code === 'AI_NOT_CONFIGURED' ? 400 : err.code === 'AI_TIMEOUT' ? 504 : 502
      return fail(res, status, err.code, err.message)
    }
    return fail(res, 502, 'AI_BAD_RESPONSE', err instanceof Error ? err.message : '生成失败，请重试')
  }
})

export const aiRouter = router