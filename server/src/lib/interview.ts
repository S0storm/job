import type { InterviewQa } from '@prisma/client'

/**
 * 面试题（PRD §3.5 / §8.3）。
 * server tsconfig 限制 rootDir=src，不能跨包引用 shared/types.ts，故在此复刻校验与序列化。
 */

export const QUESTION_CATEGORIES = ['tech', 'project', 'behavior'] as const
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number]

export interface InterviewQuestionInput {
  category: QuestionCategory
  question: string
  answer: string
  key_points: string[]
}

function isCategory(value: unknown): value is QuestionCategory {
  return typeof value === 'string' && (QUESTION_CATEGORIES as readonly string[]).includes(value)
}

/**
 * 宽容校验模型输出：逐条过滤非法题目（分类/题干/答案缺失），
 * 全部非法时抛错（PRD §3.5 验收：生成失败不产生脏数据）。
 */
export function validateInterviewResult(value: unknown): { questions: InterviewQuestionInput[] } {
  const v = value as { questions?: unknown }
  if (!v || typeof v !== 'object') throw new Error('模型结果不是对象')
  if (!Array.isArray(v.questions) || v.questions.length === 0) throw new Error('questions 不能为空')

  const questions: InterviewQuestionInput[] = []
  for (const raw of v.questions) {
    if (!raw || typeof raw !== 'object') continue
    const q = raw as {
      category?: unknown
      question?: unknown
      answer?: unknown
      key_points?: unknown
    }
    if (!isCategory(q.category)) continue
    if (typeof q.question !== 'string' || !q.question.trim()) continue
    if (typeof q.answer !== 'string' || !q.answer.trim()) continue
    const keyPoints = Array.isArray(q.key_points)
      ? q.key_points.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
      : []
    questions.push({
      category: q.category,
      question: q.question.trim(),
      answer: q.answer.trim(),
      key_points: keyPoints,
    })
  }

  if (questions.length === 0) throw new Error('未从模型输出中解析出有效题目')
  return { questions }
}

export function toQuestion(qa: InterviewQa) {
  return {
    id: qa.id,
    jobId: qa.jobId,
    category: qa.category,
    question: qa.question,
    answer: qa.answer,
    keyPoints: Array.isArray(qa.keyPoints) ? (qa.keyPoints as string[]) : [],
    mastered: qa.mastered,
    createdAt: qa.createdAt,
  }
}