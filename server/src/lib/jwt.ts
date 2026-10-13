import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  email: string
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET 未配置')
  return secret
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getSecret())
  if (typeof decoded === 'string') throw new Error('非法的 token')
  return { sub: String(decoded.sub), email: String(decoded.email) }
}