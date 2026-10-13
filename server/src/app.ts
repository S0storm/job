import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { prisma } from './db'
import { aiRouter } from './routes/ai'
import { authRouter } from './routes/auth'
import { eventsRouterExport, jobsRouter } from './routes/jobs'
import { interviewRouter } from './routes/interview'
import { resumesRouter } from './routes/resumes'
import { settingsRouter } from './routes/settings'
import { statsRouter } from './routes/stats'

export function createApp() {
  const app = express()

  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  // 健康检查：同时探测数据库连通性（PRD §9 迭代 0 交付项）
  app.get('/api/health', async (_req: Request, res: Response) => {
    let db: 'ok' | 'error' = 'ok'
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch {
      db = 'error'
    }
    res.json({
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      time: new Date().toISOString(),
    })
  })

  // 认证
  app.use('/api/auth', authRouter)

  // 简历中心
  app.use('/api/resumes', resumesRouter)

  // 求职进度
  app.use('/api/jobs', jobsRouter)
  app.use('/api/events', eventsRouterExport)

  // AI 能力
  app.use('/api/ai', aiRouter)

  // 面试题题库管理
  app.use('/api/interview-questions', interviewRouter)

  // 首页仪表盘聚合
  app.use('/api/stats', statsRouter)

  // 设置（AI 配置 / 账号 / 通知偏好）
  app.use('/api/settings', settingsRouter)

  // 统一 404
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
  })

  // 统一错误响应（PRD §7：{ error: { code, message } }）
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] unhandled error:', err)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } })
  })

  return app
}