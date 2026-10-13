import { Router, type Response } from 'express'
import type { User } from '@prisma/client'
import { prisma } from '../db'
import { authCookieOptions, COOKIE_NAME } from '../lib/cookie'
import { fail } from '../lib/http'
import { signToken } from '../lib/jwt'
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/password'
import { requireAuth } from '../middleware/auth'

const router = Router()

// PRD §3.1：密码 ≥8 位且同时包含字母和数字
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    createdAt: user.createdAt,
  }
}

function setAuthCookie(res: Response, user: User) {
  res.cookie(COOKIE_NAME, signToken({ sub: user.id, email: user.email }), authCookieOptions())
}

router.post('/register', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return fail(res, 400, 'VALIDATION_ERROR', '请输入正确的邮箱地址')
  }
  if (typeof password !== 'string' || !PASSWORD_RE.test(password)) {
    return fail(res, 400, 'VALIDATION_ERROR', '密码至少 8 位，且需同时包含字母和数字')
  }

  const normalizedEmail = email.trim().toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    return fail(res, 409, 'EMAIL_TAKEN', '该邮箱已被注册，请直接登录')
  }

  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash: await hashPassword(password) },
  })

  setAuthCookie(res, user)
  res.status(201).json({ user: publicUser(user) })
})

router.post('/login', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return fail(res, 400, 'VALIDATION_ERROR', '请输入邮箱和密码')
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  // 用户不存在时也执行一次 bcrypt 比对，响应时间不可区分（PRD §3.1 防枚举）
  const matched = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !matched) {
    return fail(res, 401, 'INVALID_CREDENTIALS', '邮箱或密码错误')
  }

  setAuthCookie(res, user)
  res.json({ user: publicUser(user) })
})

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...authCookieOptions(), maxAge: undefined })
  res.json({ ok: true })
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user) return fail(res, 401, 'UNAUTHENTICATED', '登录已过期，请重新登录')
  res.json({ user: publicUser(user) })
})

export const authRouter = router