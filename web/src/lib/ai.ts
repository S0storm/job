import { apiFetch } from './api'

/** PRD §3.3 优化结果契约 */
export interface AiOptimizeResult {
  suggestions: string[]
  optimized_content: string
}

export type AiTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface AiTask {
  id: string
  scene: string
  status: AiTaskStatus
  result?: AiOptimizeResult
  error?: { code: string; message: string }
  tokensIn?: number
  tokensOut?: number
  createdAt: string
  finishedAt?: string
}

/** 创建优化任务（PRD §7：返回 task_id，前端轮询） */
export function optimizeResume(input: { resumeId: string; jdText: string }) {
  return apiFetch<{ task_id: string }>('/ai/optimize', {
    method: 'POST',
    body: JSON.stringify({ resume_id: input.resumeId, jd_text: input.jdText }),
  })
}

export function getAiTask(id: string) {
  return apiFetch<{ task: AiTask }>(`/ai/tasks/${id}`)
}