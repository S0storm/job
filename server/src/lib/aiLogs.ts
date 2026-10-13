import { prisma } from '../db'

/** 逐笔记录 AI 调用（PRD §8.1 / 成本控制）；记录失败不阻断主流程 */
export async function recordAiCall(input: {
  userId: string
  scene: 'optimize' | 'interview'
  tokensIn: number
  tokensOut: number
  status: 'ok' | 'failed'
}): Promise<void> {
  try {
    await prisma.aiCall.create({
      data: {
        userId: input.userId,
        scene: input.scene,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        status: input.status,
        cost: null,
      },
    })
  } catch (err) {
    console.error('[ai] 记录 ai_calls 失败：', err)
  }
}