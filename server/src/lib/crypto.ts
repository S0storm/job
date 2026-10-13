/**
 * 对称加密（PRD §8.1：用户级 Kimi API Key 以 AES-256 加密存储于 user_settings）。
 * 密钥来自环境变量 SETTINGS_ENCRYPTION_KEY；开发环境未配置时回退到固定派生密钥，
 * 保证本地可直接运行（生产必须显式配置强随机值）。
 */
import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'
const DEV_FALLBACK = 'job-assistant-dev-settings-encryption-key'
const PREFIX = 'v1'

function getKey(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY?.trim() || DEV_FALLBACK
  // 用 sha256 派生固定 32 字节密钥，规避任意长度输入
  return crypto.createHash('sha256').update(secret).digest()
}

/** 加密明文，返回 `v1.<iv>.<tag>.<cipher>`（各段 base64url） */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join('.')
}

/** 解密 encryptSecret 生成的密文；格式或密钥不匹配时抛错 */
export function decryptSecret(payload: string): string {
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('密文格式不正确')
  }
  const iv = Buffer.from(parts[1], 'base64url')
  const tag = Buffer.from(parts[2], 'base64url')
  const data = Buffer.from(parts[3], 'base64url')
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}