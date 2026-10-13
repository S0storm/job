import { Router } from 'express'
import { prisma } from '../db'
import {
  AI_MODELS,
  getMonthlyUsage,
  isAiModel,
  maskKey,
  resolveUserAiConfig,
} from '../lib/aiSettings'
import { encryptSecret } from '../lib/crypto'
import { fail } from '../lib/http'
import { getKimiConfig, KimiError, testKimiConnection } from '../lib/kimi'
import { requireAuth } from '../middleware/auth'

/**
 * 设置（PRD §3.7 / §7 / §8.1）。
 * - AI 配置：Key 加密存储于 user_settings，接口只回传掩码，明文永不出服务端
 * - 账号：昵称可改、邮箱只读
 * - 通知偏好：V1 仅持久化开关
 */
const NICKNAME_MAX = 30
const API_KEY_MAX = 200

const router = Router()
router.use(requireAuth)

async function buildAiState(userId: string) {
  const [resolved, monthly] = await Promise.all([
    resolveUserAiConfig(userId),
    getMonthlyUsage(userId),
  ])
  return {
    configured: resolved.apiKey.length > 0,
    source: resolved.source,
    model: resolved.model,
    keyMasked: resolved.apiKey ? maskKey(resolved.apiKey) : '',
    models: [...AI_MODELS],
    monthly,
  }
}

async function buildAccount(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  return { email: user.email, nickname: user.nickname }
}

/** GET /settings —— 聚合 AI 配置 / 账号 / 通知偏好 */
router.get('/', async (req, res) => {
  const userId = req.user!.id
  const [ai, account, setting] = await Promise.all([
    buildAiState(userId),
    buildAccount(userId),
    prisma.userSetting.findUnique({ where: { userId } }),
  ])
  if (!account) return fail(res, 401, 'UNAUTHENTICATED', '登录已过期，请重新登录')

  res.json({
    ai,
    account,
    notifications: {
      notifyInterview: setting?.notifyInterview ?? true,
      notifyNoFeedback: setting?.notifyNoFeedback ?? true,
    },
  })
})

/** PUT /settings/ai —— 保存 Key（服务端加密）/ 清空 Key / 切换模型 */
router.put('/ai', async (req, res) => {
  const userId = req.user!.id
  const { apiKey, model } = (req.body ?? {}) as { apiKey?: unknown; model?: unknown }

  if (model !== undefined && !isAiModel(model)) {
    return fail(res, 400, 'VALIDATION_ERROR', '不支持的模型')
  }
  if (apiKey !== undefined && apiKey !== null && typeof apiKey !== 'string') {
    return fail(res, 400, 'VALIDATION_ERROR', 'API Key 格式不正确')
  }
  if (typeof apiKey === 'string' && apiKey.trim().length > API_KEY_MAX) {
    return fail(res, 400, 'VALIDATION_ERROR', `API Key 长度不能超过 ${API_KEY_MAX} 字符`)
  }

  const existing = await prisma.userSetting.findUnique({ where: { userId } })
  // 存量行可能保存已下线模型名，需校验后再作为回退值
  const existingModel = existing?.model
  const nextModel = model ?? (isAiModel(existingModel) ? existingModel : getKimiConfig().model)

  // undefined=不改动；null / 空串=清空（回退服务端 env）；非空=加密存储
  let nextKeyEnc = existing?.kimiApiKeyEnc ?? null
  if (apiKey !== undefined) {
    if (apiKey === null) {
      nextKeyEnc = null
    } else {
      const trimmed = (apiKey as string).trim()
      nextKeyEnc = trimmed ? encryptSecret(trimmed) : null
    }
  }

  await prisma.userSetting.upsert({
    where: { userId },
    create: { userId, model: nextModel, kimiApiKeyEnc: nextKeyEnc },
    update: { model: nextModel, kimiApiKeyEnc: nextKeyEnc },
  })

  res.json({ ai: await buildAiState(userId) })
})

/** POST /settings/ai/test —— 测试连接（可先测未保存的新 Key） */
router.post('/ai/test', async (req, res) => {
  const userId = req.user!.id
  const { apiKey, model } = (req.body ?? {}) as { apiKey?: unknown; model?: unknown }

  if (model !== undefined && !isAiModel(model)) {
    return fail(res, 400, 'VALIDATION_ERROR', '不支持的模型')
  }

  const resolved = await resolveUserAiConfig(userId)
  const effectiveKey =
    typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : resolved.apiKey
  const effectiveModel = isAiModel(model) ? model : resolved.model

  try {
    const result = await testKimiConnection({
      apiKey: effectiveKey,
      baseUrl: getKimiConfig().baseUrl,
      model: effectiveModel,
    })
    res.json({ ok: true, model: result.model })
  } catch (err) {
    if (err instanceof KimiError) {
      const status = err.code === 'AI_NOT_CONFIGURED' ? 400 : err.code === 'AI_TIMEOUT' ? 504 : 502
      return fail(res, status, err.code, err.message)
    }
    return fail(res, 502, 'AI_UPSTREAM_ERROR', '连接测试失败，请稍后重试')
  }
})

/** PATCH /settings/profile —— 修改昵称（邮箱只读） */
router.patch('/profile', async (req, res) => {
  const userId = req.user!.id
  const { nickname } = (req.body ?? {}) as { nickname?: unknown }

  if (typeof nickname !== 'string' || !nickname.trim()) {
    return fail(res, 400, 'VALIDATION_ERROR', '请填写昵称')
  }
  const trimmed = nickname.trim()
  if (trimmed.length > NICKNAME_MAX) {
    return fail(res, 400, 'VALIDATION_ERROR', `昵称不能超过 ${NICKNAME_MAX} 字符`)
  }

  const user = await prisma.user.update({ where: { id: userId }, data: { nickname: trimmed } })
  res.json({
    user: { id: user.id, email: user.email, nickname: user.nickname, createdAt: user.createdAt },
  })
})

/** PATCH /settings/notifications —— 通知偏好持久化（V1 仅存开关） */
router.patch('/notifications', async (req, res) => {
  const userId = req.user!.id
  const { notifyInterview, notifyNoFeedback } = (req.body ?? {}) as {
    notifyInterview?: unknown
    notifyNoFeedback?: unknown
  }

  const data: { notifyInterview?: boolean; notifyNoFeedback?: boolean } = {}
  if (notifyInterview !== undefined) {
    if (typeof notifyInterview !== 'boolean') {
      return fail(res, 400, 'VALIDATION_ERROR', '通知开关格式不正确')
    }
    data.notifyInterview = notifyInterview
  }
  if (notifyNoFeedback !== undefined) {
    if (typeof notifyNoFeedback !== 'boolean') {
      return fail(res, 400, 'VALIDATION_ERROR', '通知开关格式不正确')
    }
    data.notifyNoFeedback = notifyNoFeedback
  }
  if (Object.keys(data).length === 0) {
    return fail(res, 400, 'VALIDATION_ERROR', '没有需要更新的通知偏好')
  }

  const setting = await prisma.userSetting.upsert({
    where: { userId },
    create: {
      userId,
      model: getKimiConfig().model,
      notifyInterview: data.notifyInterview ?? true,
      notifyNoFeedback: data.notifyNoFeedback ?? true,
    },
    update: data,
  })

  res.json({
    notifications: {
      notifyInterview: setting.notifyInterview,
      notifyNoFeedback: setting.notifyNoFeedback,
    },
  })
})

export const settingsRouter = router