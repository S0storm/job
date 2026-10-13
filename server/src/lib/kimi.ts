/**
 * Kimi（Moonshot）API 客户端 —— 对应 PRD §8.1。
 * OpenAI 兼容协议；服务端单例配置（env），统一 2 分钟超时，网络错误重试 1 次。
 */

const DEFAULT_BASE_URL = 'https://api.moonshot.cn/v1'
const DEFAULT_MODEL = 'kimi-k2.6'
/**
 * 关闭思考模式后实测：优化约 21-28s、面试题 9 题约 67-98s（PRD §8.1 原定 60s，
 * 该阈值基于非推理模型，故放宽到 150s 以覆盖波动并留出余量）。
 */
const TIMEOUT_MS = 150_000
const MAX_RETRY = 1
/** 429 未携带 Retry-After 时的默认退避 */
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 2_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type KimiErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_TIMEOUT'
  | 'AI_UPSTREAM_ERROR'
  | 'AI_BAD_RESPONSE'

export class KimiError extends Error {
  readonly code: KimiErrorCode
  /** 是否可重试（网络抖动 / 5xx / 429 / 超时） */
  readonly retryable: boolean
  /** 上游要求的重试等待时间（如 429 的 Retry-After），0 表示无要求 */
  readonly retryAfterMs: number

  constructor(code: KimiErrorCode, message: string, retryable = false, retryAfterMs = 0) {
    super(message)
    this.name = 'KimiError'
    this.code = code
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  content: string
  tokensIn: number
  tokensOut: number
  model: string
}

export interface KimiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

/** 服务端默认配置（读取环境变量） */
export function getKimiConfig(): KimiConfig {
  return {
    apiKey: process.env.KIMI_API_KEY?.trim() ?? '',
    baseUrl: (process.env.KIMI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: process.env.KIMI_MODEL?.trim() || DEFAULT_MODEL,
  }
}

/** 用用户级配置覆盖默认配置（Key 为空则回退 env；BaseURL 始终沿用 env） */
export function resolveConfig(override?: Partial<KimiConfig>): KimiConfig {
  const base = getKimiConfig()
  return {
    apiKey: override?.apiKey?.trim() || base.apiKey,
    baseUrl: base.baseUrl,
    model: override?.model?.trim() || base.model,
  }
}

/** API Key 是否已配置（未配置时接口快速失败并引导设置页） */
export function isKimiConfigured(config?: KimiConfig): boolean {
  return (config ?? getKimiConfig()).apiKey.length > 0
}

interface ChatCompletionResponse {
  model?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

interface RequestOptions {
  maxTokens?: number
  /** 连通性测试等场景：HTTP 2xx 即视为成功，允许空内容（推理模型可能只产出思维链） */
  allowEmptyContent?: boolean
}

/** 解析 429 的 Retry-After（秒） */
function parseRetryAfter(header: string | null): number {
  if (!header) return DEFAULT_RATE_LIMIT_BACKOFF_MS
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000)
  return DEFAULT_RATE_LIMIT_BACKOFF_MS
}

/**
 * 推理模型（如 kimi-k2.6）需要特殊处理：
 * 1) 仅接受默认 temperature，传自定义值会被上游拒绝（invalid temperature: only 1 is allowed）；
 * 2) 思考 tokens 占比可达 65%，显著放大耗时与成本（实测面试题 9833 tokens 中 6376 为思考），
 *    故显式关闭思考模式 —— 本场景为结构化 JSON 生成，无需长链推理。
 */
const REASONING_MODELS = new Set(['kimi-k2.6'])

function effectiveTemperature(model: string, temperature: number): number | null {
  return REASONING_MODELS.has(model) ? null : temperature
}

async function callOnce(
  messages: ChatMessage[],
  temperature: number,
  config: KimiConfig,
  options?: RequestOptions,
): Promise<ChatResult> {
  const { apiKey, baseUrl, model } = config
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const temp = effectiveTemperature(model, temperature)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(temp === null ? {} : { temperature: temp }),
        ...(REASONING_MODELS.has(model) ? { thinking: { type: 'disabled' } } : {}),
        ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      // 429：Moonshot 账号存在并发上限（如 1），给出可读提示而非原始报文
      if (res.status === 429) {
        throw new KimiError(
          'AI_UPSTREAM_ERROR',
          'AI 请求过于频繁（账号并发受限），请等待当前任务完成后再试',
          true,
          parseRetryAfter(res.headers.get('retry-after')),
        )
      }
      // 5xx 视为可重试；其余 4xx 为配置或参数错误，直接失败
      const retryable = res.status >= 500
      throw new KimiError(
        'AI_UPSTREAM_ERROR',
        `Kimi 接口返回 ${res.status}${detail ? `：${detail.slice(0, 200)}` : ''}`,
        retryable,
      )
    }

    const data = (await res.json()) as ChatCompletionResponse
    const content = data.choices?.[0]?.message?.content
    if ((typeof content !== 'string' || !content.trim()) && !options?.allowEmptyContent) {
      throw new KimiError('AI_BAD_RESPONSE', 'Kimi 未返回有效内容')
    }

    return {
      content: content ?? '',
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
      model: data.model ?? model,
    }
  } catch (err) {
    if (err instanceof KimiError) throw err
    if ((err as { name?: string })?.name === 'AbortError') {
      // 超时通常意味着生成确实过慢，重试只会翻倍等待，故标记为不可重试
      throw new KimiError('AI_TIMEOUT', '生成超时，请重试', false)
    }
    throw new KimiError('AI_UPSTREAM_ERROR', '无法连接 AI 服务，请稍后重试', true)
  } finally {
    clearTimeout(timer)
  }
}

/** 调用 Kimi Chat Completions；网络类错误自动重试 1 次。override 可传入用户级 Key/模型 */
export async function chatCompletion(
  messages: ChatMessage[],
  temperature: number,
  override?: Partial<KimiConfig>,
): Promise<ChatResult> {
  const config = resolveConfig(override)
  if (!isKimiConfigured(config)) {
    throw new KimiError('AI_NOT_CONFIGURED', '尚未配置 Kimi API Key，请前往「设置」页配置后重试')
  }

  let last: KimiError | null = null
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      return await callOnce(messages, temperature, config)
    } catch (err) {
      const kimiErr = err as KimiError
      if (!(kimiErr instanceof KimiError) || !kimiErr.retryable) throw kimiErr
      last = kimiErr
      // 429 等场景按上游要求退避后再重试，避免立即重试再次被限流
      if (attempt < MAX_RETRY && kimiErr.retryAfterMs > 0) {
        await sleep(kimiErr.retryAfterMs)
      }
    }
  }
  throw last ?? new KimiError('AI_UPSTREAM_ERROR', 'AI 服务暂时不可用，请稍后重试')
}

/** 设置页「测试连接」：发起一次最小请求验证 Key/模型可用性 */
export async function testKimiConnection(config: KimiConfig): Promise<{ model: string }> {
  if (!isKimiConfigured(config)) {
    throw new KimiError('AI_NOT_CONFIGURED', '尚未配置 Kimi API Key，请前往「设置」页配置后重试')
  }
  // 不重试：测试场景需快速反馈真实错误（如 Key 无效）
  // max_tokens 保持极小以控制成本；推理模型可能只产出思维链，故 HTTP 2xx 即视为连通
  const result = await callOnce(
    [{ role: 'user', content: 'ping' }],
    0,
    config,
    { maxTokens: 1, allowEmptyContent: true },
  )
  return { model: result.model }
}