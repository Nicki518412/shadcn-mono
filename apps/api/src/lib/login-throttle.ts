// 内存限流：账号维度连续失败 5 次锁 15 分钟（重启失效，单实例够用）。
// 防内存膨胀（用户名喷洒攻击可无限新增 key）：
// - sweepStale：清理「已过期锁定」与「超过 STALE_MS 无活动的计数中」条目，每 100 次写操作触发
// - MAX_ENTRIES 硬上限：超出时按 lastActive 驱逐最久未活动的条目（近似 LRU）
const locks = new Map<string, { lockedUntil: number; failures: number; lastActive: number }>()
let operationCount = 0

/** 计数中条目无活动保留时长（超过即清理，失败计数随之重置，属可接受取舍） */
const STALE_MS = 30 * 60 * 1000
/** 内存条目硬上限（防喷洒攻击无界增长；超出驱逐最久未活动条目） */
export const MAX_ENTRIES = 10_000

/** 清理过期锁定条目与长期无活动的计数条目（周期性触发；导出便于单测直接调用） */
export function sweepStale(now = Date.now()): void {
  for (const [key, lock] of locks) {
    const staleCounting = lock.lockedUntil === 0 && lock.lastActive < now - STALE_MS
    const expiredLocked = lock.lockedUntil > 0 && lock.lockedUntil <= now
    if (staleCounting || expiredLocked) locks.delete(key)
  }
}

/** 超出上限时驱逐 lastActive 最早的条目（近似 LRU，避免误伤活跃账号） */
function evictOldest(): void {
  while (locks.size > MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestAt = Infinity
    for (const [key, lock] of locks) {
      if (lock.lastActive < oldestAt) {
        oldestAt = lock.lastActive
        oldestKey = key
      }
    }
    if (oldestKey === null) return
    locks.delete(oldestKey)
  }
}

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
  // 轻量防无限增长：每满 100 次操作清扫过期锁定与长期无活动的计数条目
  if (operationCount % 100 === 0) sweepStale(now)
  const lock = locks.get(key) ?? { lockedUntil: 0, failures: 0, lastActive: now }
  lock.failures += 1
  lock.lastActive = now
  if (lock.failures >= 5) {
    lock.lockedUntil = now + 15 * 60 * 1000
    lock.failures = 0
  }
  locks.set(key, lock)
  evictOldest()
}

/** 登录成功后清除该 key 的失败计数与锁定 */
export function resetThrottle(key: string): void {
  locks.delete(key)
}

/** 测试辅助：当前内存条目数（验证清理与上限行为） */
export function locksSizeForTest(): number {
  return locks.size
}
