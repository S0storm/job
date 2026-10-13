/**
 * 用户级 AI 配置解析（PRD §8.1）：设置页可覆盖默认 Key/模型，
 * 存储在 user_settings.kimi_api_key_enc（AES-256-GCM）。
 */
import { prisma } from '../db'
import { decryptSecret } from './crypto'
import { getKimiConfig, type KimiConfig } from './kimi'

/** 可选模型（PRD §3.7 模型选择） */
export const AI_MODELS = ['kimi-k2.6', 'moonshot-v1-128k'] as const
export type AiModel = (typeof AI_MODELS)[number]

export function isAiModel(value: unknown): value is AiModel {
  return typeof value === 'string' && (AI_MODELS as readonly string[]).includes(value)
}

export interface ResolvedAiConfig extends KimiConfig {
  /** 生效来源：用户自定义 Key(user) / 服务端环境变量(env) */
  source: 'env' | 'user'
}

/** 优先使用用户自定义 Key，否则回退 env；Key 解密失败时静默回退 env */
export async function resolveUserAiConfig(userId: string): Promise<ResolvedAiConfig> {
  const setting = await prisma.userSetting.findUnique({ where: { userId } })

  let userKey = ''
  if (setting?.kimiApiKeyEnc) {
    try {
      userKey = decryptSecret(setting.kimiApiKeyEnc)
    } catch (err) {
      console.error('[settings] 解密用户 API Key 失败：', err)
    }
  }

  const env = getKimiConfig()
  // 存量行可能保存了已下线的模型名（如 kimi-k2），校验失败时回退 env 模型
  const storedModel = setting?.model
  return {
    apiKey: userKey || env.apiKey,
    baseUrl: env.baseUrl,
    model: isAiModel(storedModel) ? storedModel : env.model,
    source: userKey ? 'user' : 'env',
  }
}

/** 掩码展示（仅保留末 4 位，不回传明文 Key） */
export function maskKey(key: string): string {
  if (!key) return ''
  return key.length <= 4 ? '••••' : `sk-••••••••${key.slice(-4)}`
}

/** 本月 AI 消耗（ai_calls 聚合，PRD §3.7 本月消耗统计 / §8.4 成本控制） */
export async function getMonthlyUsage(userId: string) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const agg = await prisma.aiCall.aggregate({
    where: { userId, createdAt: { gte: monthStart } },
    _count: true,
    _sum: { tokensIn: true, tokensOut: true },
  })

  const tokensIn = agg._sum.tokensIn ?? 0
  const tokensOut = agg._sum.tokensOut ?? 0
  return {
    calls: agg._count,
    tokensIn,
    tokensOut,
    tokensTotal: tokensIn + tokensOut,
  }
}