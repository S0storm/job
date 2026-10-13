import 'express'

declare global {
  namespace Express {
    interface Request {
      /** 由 requireAuth 中间件注入 */
      user?: { id: string; email: string }
    }
  }
}