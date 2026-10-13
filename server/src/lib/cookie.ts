import type { CookieOptions } from 'express'

export const COOKIE_NAME = 'token'
export const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 天

/** PRD §4：httpOnly + SameSite=Lax；生产环境强制 HTTPS */
export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  }
}