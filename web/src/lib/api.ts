export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** 统一请求封装：携带 httpOnly cookie，解析后端的 { error: { code, message } } 结构 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData

  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      // FormData 由浏览器自动设置 multipart 边界，不能覆盖 Content-Type
      ...(!isFormData && init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  const raw = await res.text()
  const data = raw ? (JSON.parse(raw) as unknown) : null

  if (!res.ok) {
    const body = data as { error?: { code?: string; message?: string } } | null
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? '请求失败，请稍后重试',
    )
  }

  return data as T
}