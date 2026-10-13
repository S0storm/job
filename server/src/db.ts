import { PrismaClient } from '@prisma/client'

// 单例 Prisma Client，避免开发热重载时重复实例化
export const prisma = new PrismaClient()