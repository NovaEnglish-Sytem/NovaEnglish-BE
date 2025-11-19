import bcryptjs from 'bcryptjs'

const DEFAULT_COST = 10

export async function hashPassword(plain, cost = DEFAULT_COST) {
  if (typeof plain !== 'string' || plain.length < 8) {
    throw new Error('Password must be a string with minimum length 8')
  }
  return bcryptjs.hash(plain, cost)
}

export async function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || !hash) return false
  try {
    return await bcryptjs.compare(plain, hash)
  } catch {
    return false
  }
}
