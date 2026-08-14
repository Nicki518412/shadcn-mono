import { describe, expect, it } from "vitest"
import {
  MAX_ENTRIES,
  checkThrottle,
  locksSizeForTest,
  recordFailure,
  resetThrottle,
  sweepStale,
} from "../src/lib/login-throttle.js"

// 独立 key：模块级内存状态跨测试文件共享，避免与 auth 集成测试互扰
const KEY = "login:unit_test:local"

describe("login-throttle", () => {
  it("4 次失败仍放行，第 5 次锁定", () => {
    resetThrottle(KEY)
    for (let i = 0; i < 4; i++) recordFailure(KEY)
    expect(checkThrottle(KEY)).toBe(true)
    recordFailure(KEY)
    expect(checkThrottle(KEY)).toBe(false)
  })

  it("锁定中 check 返回 false", () => {
    resetThrottle(KEY)
    for (let i = 0; i < 5; i++) recordFailure(KEY)
    expect(checkThrottle(KEY)).toBe(false)
  })

  it("锁定过期后自动解锁（注入 now）", () => {
    resetThrottle(KEY)
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) recordFailure(KEY, t0)
    expect(checkThrottle(KEY, t0 + 1000)).toBe(false)
    expect(checkThrottle(KEY, t0 + 15 * 60 * 1000 + 1)).toBe(true)
  })

  it("resetThrottle 后恢复放行", () => {
    resetThrottle(KEY)
    for (let i = 0; i < 5; i++) recordFailure(KEY)
    expect(checkThrottle(KEY)).toBe(false)
    resetThrottle(KEY)
    expect(checkThrottle(KEY)).toBe(true)
  })

  it("计数条目长期无活动后被清理（防喷洒膨胀）", () => {
    const staleKey = `${KEY}:stale`
    resetThrottle(staleKey)
    const t0 = 2_000_000
    const sizeBefore = locksSizeForTest()
    recordFailure(staleKey, t0)
    expect(locksSizeForTest()).toBe(sizeBefore + 1)
    sweepStale(t0 + 31 * 60 * 1000) // 超过 30 分钟无活动阈值
    expect(locksSizeForTest()).toBe(sizeBefore)
  })

  it("条目数超上限时驱逐最久未活动条目", () => {
    // victim 使用远早的时间戳，保证它是全表 lastActive 最小的条目，驱逐行为确定
    const victim = `${KEY}:victim`
    resetThrottle(victim)
    const t0 = 3_000_000
    for (let i = 0; i < 5; i++) recordFailure(victim, t0)
    expect(checkThrottle(victim, t0)).toBe(false)
    const sizeBefore = locksSizeForTest()
    for (let i = 0; i < MAX_ENTRIES - sizeBefore + 1; i++) recordFailure(`${KEY}:fill:${String(i)}`, t0 + 1)
    expect(locksSizeForTest()).toBe(MAX_ENTRIES)
    expect(checkThrottle(victim, t0 + 1)).toBe(true) // 最久未活动的 victim 已被驱逐
  })
})
