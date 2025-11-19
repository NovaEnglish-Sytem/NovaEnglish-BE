import { PrismaClient } from '@prisma/client'
import { env } from './env.js'

const globalForPrisma = globalThis

export const prisma =
  globalForPrisma.__prisma__ ??
  new PrismaClient({
    log: env.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (!env.isProd) {
  globalForPrisma.__prisma__ = prisma
}

export default prisma