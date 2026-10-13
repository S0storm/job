import bcrypt from 'bcryptjs'

// PRD §3.1：bcrypt cost = 10
const COST = 10

/**
 * 用于「用户不存在」时消耗等量 CPU，避免通过响应时间枚举账号（PRD §3.1 防枚举）。
 * 该值仅为占位哈希，不对应任何真实密码。
 */
export const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}