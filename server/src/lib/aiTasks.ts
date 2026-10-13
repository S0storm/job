/**
 * AI 异步任务注册表（PRD §7：POST /ai/optimize 返回 task_id，GET /ai/tasks/:id 轮询）。
 * 任务状态保存在服务端内存中，带 TTL 自动回收，避免无限增长。
 */

export type AiTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface AiTaskSnapshot {
  id: string
  scene: string
  status: AiTaskStatus
  result?: unknown
  error?: { code: string; message: string }
  tokensIn?: number
  tokensOut?: number
  createdAt: string
  finishedAt?: string
}

interface AiTaskRecord extends AiTaskSnapshot {
  userId: string
  expiresAt: number
}

interface TaskOutcome<T> {
  result: T
  tokensIn: number
  tokensOut: number
}

const TTL_MS = 30 * 60 * 1000
const tasks = new Map<string, AiTaskRecord>()

function sweep() {
  const now = Date.now()
  for (const [id, task] of tasks) {
    if (task.expiresAt <= now) tasks.delete(id)
  }
}

export function createTask(userId: string, scene: string): string {
  sweep()
  const id = crypto.randomUUID()
  tasks.set(id, {
    id,
    userId,
    scene,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + TTL_MS,
  })
  return id
}

export function getTask(id: string, userId: string): AiTaskSnapshot | null {
  const task = tasks.get(id)
  if (!task || task.userId !== userId) return null
  const { userId: _userId, expiresAt: _expiresAt, ...snapshot } = task
  return snapshot
}

export async function runTask<T>(id: string, job: () => Promise<TaskOutcome<T>>): Promise<void> {
  const task = tasks.get(id)
  if (!task) return

  task.status = 'running'
  try {
    const { result, tokensIn, tokensOut } = await job()
    task.status = 'succeeded'
    task.result = result
    task.tokensIn = tokensIn
    task.tokensOut = tokensOut
  } catch (err) {
    const e = err as { code?: string; message?: string }
    task.status = 'failed'
    task.error = {
      code: typeof e?.code === 'string' ? e.code : 'AI_FAILED',
      message: e?.message || '生成失败，请重试',
    }
  } finally {
    task.finishedAt = new Date().toISOString()
    task.expiresAt = Date.now() + TTL_MS
  }
}