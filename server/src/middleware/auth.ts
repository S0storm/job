import type { NextFunction, Request, Response } from 'express'
import { COOKIE_NAME } from '../lib/cookie'
import { fail } from '../lib/http'
import { verifyToken } from '../lib/jwt'

/** 受保护接口的鉴权中间件：校验 httpOnly cookie 中的 JWT 并注入 req.user */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined
  if (!token) return fail(res, 401, 'UNAUTHENTICATED', '请先登录')

  try {
    const payload = verifyToken(token)
    req.user = { id: payload.sub, email: payload.email }
    next()
  } catch {
    return fail(res, 401, 'UNAUTHENTICATED', '登录已过期，请重新登录')
  }
}