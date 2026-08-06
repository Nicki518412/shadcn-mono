// 内存限流：账号 + IP 维度，连续失败 5 次锁 15 分钟（重启失效，单实例够用）
const locks = new Map<string, { lockedUntil: number; failures: number }>()

export function checkThrottle(key: string, now = Date.now()): boolean {
  const lock = locks.get(key)
  if (!lock) return true
  if (lock.lockedUntil === 0) return true // 失败计数中，尚未锁定
  if (lock.lockedUntil <= now) {
    locks.delete(key)
    return true
  }
  return false // 锁定中
}

export function recordFailure(key: string, now = Date.now()): void {
  const lock = locks.get(key) ?? { lockedUntil: 0, failures: 0 }
  lock.failures += 1
  if (lock.failures >= 5) {
    lock.lockedUntil = now + 15 * 60 * 1000
    lock.failures = 0
  }
  locks.set(key, lock)
}
