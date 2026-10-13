import type { Response } from 'express'

/** 统一错误响应（PRD §7：{ error: { code, message } }） */
export function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } })
}