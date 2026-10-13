import { apiFetch } from './api'

/** PRD §3.7 设置：AI 配置（Key 加密存储，仅回传掩码）/ 账号 / 通知偏好 */

export type AiSource = 'env' | 'user'

export interface AiState {
  configured: boolean
  source: AiSource
  model: string
  keyMasked: string
  models: string[]
  monthly: {
    calls: number
    tokensIn: number
    tokensOut: number
    tokensTotal: number
  }
}

export interface SettingsPayload {
  ai: AiState
  account: { email: string; nickname: string }
  notifications: { notifyInterview: boolean; notifyNoFeedback: boolean }
}

export function getSettings() {
  return apiFetch<SettingsPayload>('/settings')
}

/** 保存 Key / 模型；apiKey 传 null 或空串表示清空并回退服务端 env 配置 */
export function saveAiConfig(input: { apiKey?: string | null; model?: string }) {
  return apiFetch<{ ai: AiState }>('/settings/ai', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** 测试连接（可先测未保存的新 Key / 新模型） */
export function testAiConnection(input: { apiKey?: string; model?: string }) {
  return apiFetch<{ ok: true; model: string }>('/settings/ai/test', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateProfile(nickname: string) {
  return apiFetch<{ user: { id: string; email: string; nickname: string; createdAt: string } }>(
    '/settings/profile',
    { method: 'PATCH', body: JSON.stringify({ nickname }) },
  )
}

export function updateNotifications(input: {
  notifyInterview?: boolean
  notifyNoFeedback?: boolean
}) {
  return apiFetch<{ notifications: { notifyInterview: boolean; notifyNoFeedback: boolean } }>(
    '/settings/notifications',
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}