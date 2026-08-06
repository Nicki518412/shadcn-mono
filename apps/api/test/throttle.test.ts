import { describe, expect, it } from "vitest"
import { checkThrottle, recordFailure, resetThrottle } from "../src/lib/login-throttle.js"

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
})
