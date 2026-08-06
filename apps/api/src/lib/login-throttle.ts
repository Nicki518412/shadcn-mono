// 内存限流：账号 + IP 维度，连续失败 5 次锁 15 分钟（重启失效，单实例够用）
const locks = new Map<string, { lockedUntil: number; failures: number }>()
let operationCount = 0

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
  operationCount += 1
  // 轻量防无限增长：每满 100 次操作清扫一遍已过期锁定条目（计数中条目保留，不影响计数语义）
  if (operationCount % 100 === 0) {
    for (const [k, lock] of locks) {
      if (lock.lockedUntil > 0 && lock.lockedUntil <= now) locks.delete(k)
    }
  }
  const lock = locks.get(key) ?? { lockedUntil: 0, failures: 0 }
  lock.failures += 1
  if (lock.failures >= 5) {
    lock.lockedUntil = now + 15 * 60 * 1000
    lock.failures = 0
  }
  locks.set(key, lock)
}

/** 登录成功后清除该 key 的失败计数与锁定 */
export function resetThrottle(key: string): void {
  locks.delete(key)
}
