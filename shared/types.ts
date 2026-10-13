/**
 * 前后端共享的领域类型与契约（对应 PRD §3 / §6 / §7 / §8）。
 * 迭代 0：先冻结契约，后续迭代在 web / server 中统一引用，避免两处定义漂移。
 */

// ---------- 求职进度状态机（PRD §3.4） ----------

export type JobStatus = 'wish' | 'applied' | 'written' | 'interviewing' | 'offer' | 'ended'

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  wish: '意向',
  applied: '已投递',
  written: '笔试中',
  interviewing: '面试中',
  offer: 'Offer',
  ended: '已结束',
}

/** 单向流转顺序：意向 → 已投递 → 笔试中 → 面试中 → Offer；任意阶段可进入终态「已结束」 */
export const JOB_STATUS_FLOW: JobStatus[] = ['wish', 'applied', 'written', 'interviewing', 'offer']

export type JobEventType =
  | '投递简历'
  | '笔试'
  | '一面'
  | '二面'
  | 'HR面'
  | 'Offer'
  | '流程终止'

export const JOB_EVENT_TYPES: JobEventType[] = [
  '投递简历',
  '笔试',
  '一面',
  '二面',
  'HR面',
  'Offer',
  '流程终止',
]

// ---------- 面试题（PRD §3.5 / §6） ----------

export type QuestionCategory = 'tech' | 'project' | 'behavior'

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  tech: '技术面试',
  project: '项目深挖',
  behavior: '行为面试',
}

// ---------- AI 输出契约（PRD §3.3 / §3.5 / §8） ----------

export interface AiOptimizeResult {
  suggestions: string[]
  optimized_content: string
}

export interface AiInterviewQuestion {
  category: QuestionCategory
  question: string
  answer: string
  key_points: string[]
}

export interface AiInterviewQuestionsResult {
  questions: AiInterviewQuestion[]
}

export type AiScene = 'optimize' | 'interview'
export type AiCallStatus = 'ok' | 'failed'

// ---------- 统一错误响应（PRD §7） ----------

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}