import { apiFetch } from './api'

/** PRD §3.5 面试题分类（与 shared/types.ts 保持一致） */
export type QuestionCategory = 'tech' | 'project' | 'behavior'

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  tech: '技术面试',
  project: '项目深挖',
  behavior: '行为面试',
}

export const QUESTION_CATEGORY_KEYS: QuestionCategory[] = ['tech', 'project', 'behavior']

export interface InterviewQuestionItem {
  id: string
  jobId: string
  category: QuestionCategory
  question: string
  answer: string
  keyPoints: string[]
  mastered: boolean
  createdAt: string
}

export function listInterviewQuestions(jobId: string) {
  return apiFetch<{ questions: InterviewQuestionItem[] }>(
    `/interview-questions?job_id=${encodeURIComponent(jobId)}`,
  )
}

/** 整批生成并落库（PRD §7：POST /ai/interview-questions），重新生成即整批替换 */
export function generateInterviewQuestions(input: { jobId: string; resumeId: string }) {
  return apiFetch<{ questions: InterviewQuestionItem[] }>('/ai/interview-questions', {
    method: 'POST',
    body: JSON.stringify({ job_id: input.jobId, resume_id: input.resumeId }),
  })
}

export function setQuestionMastered(id: string, mastered: boolean) {
  return apiFetch<{ question: InterviewQuestionItem }>(`/interview-questions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ mastered }),
  })
}