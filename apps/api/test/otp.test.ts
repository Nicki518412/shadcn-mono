import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { createApp } from "../src/index.js"
import { captureDevOtpCode, createTestUser } from "./helpers.js"

const CHANNEL = "email"

function sendOtp(app: ReturnType<typeof createApp>, target: string, channel: string = CHANNEL) {
  return app.request("/api/auth/otp/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel, target }),
  })
}

function loginOtp(app: ReturnType<typeof createApp>, target: string, code: string, channel: string = CHANNEL) {
  return app.request("/api/auth/otp/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel, target, code }),
  })
}

describe("otp", () => {
  beforeAll(async () => {
    await createTestUser({ username: "otp_test", password: "Passw0rd!", email: "otp_test@example.com" })
    // 每个走 send 的测试用独立 target（60s 冷却按 target 作用）；login 成功还需落库用户（OtpCode.userId 关联）
    await createTestUser({ username: "otp_login_test", password: "Passw0rd!", email: "otp_login@example.com" })
    await createTestUser({ username: "otp_attempt_test", password: "Passw0rd!", email: "otp_attempt@example.com" })
    await createTestUser({ username: "otp_locked_test", password: "Passw0rd!", email: "otp_locked@example.com" })
    await createTestUser({ username: "otp_expired_test", password: "Passw0rd!", email: "otp_expired@example.com" })
    await createTestUser({ username: "otp_phone_test", password: "Passw0rd!", telephone: "13800138000" })
  })

  it("send：目标存在（已注册邮箱）返回 200", async () => {
    const app = createApp()
    const res = await sendOtp(app, "otp_test@example.com")
    expect(res.status).toBe(200)
  })

  it("send：目标不存在也返回 200（防枚举）", async () => {
    const app = createApp()
    const res = await sendOtp(app, "nobody@example.com")
    expect(res.status).toBe(200)
  })

  it("send：同一 target 60 秒内重复发送返回 429", async () => {
    const app = createApp()
    expect((await sendOtp(app, "cooldown@example.com")).status).toBe(200)
    expect((await sendOtp(app, "cooldown@example.com")).status).toBe(429)
  })

  it("send：同一 target 并发发送仅一个成功", async () => {
    const app = createApp()
    const responses = await Promise.all([
      sendOtp(app, "concurrent-cooldown@example.com"),
      sendOtp(app, "concurrent-cooldown@example.com"),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 429])
  })

  it("login：正确验证码登录成功返回双 token，同码二次使用 401（一次性消费）", async () => {
    const app = createApp()
    const target = "otp_login@example.com"
    expect((await sendOtp(app, target)).status).toBe(200)
    const code = captureDevOtpCode(target, CHANNEL)
    const res = await loginOtp(app, target, code)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { accessToken: string; refreshToken: string; user: { username: string } }
    }
    expect(typeof body.data.accessToken).toBe("string")
    expect(typeof body.data.refreshToken).toBe("string")
    expect(body.data.user.username).toBe("otp_login_test")
    const again = await loginOtp(app, target, code)
    expect(again.status).toBe(401)
    expect(((await again.json()) as { code: string }).code).toBe("INVALID_OTP")
  })

  it("login：错误码累计 5 次后 423（attempts 超限）", async () => {
    const app = createApp()
    const target = "otp_locked@example.com"
    expect((await sendOtp(app, target)).status).toBe(200)
    const code = captureDevOtpCode(target, CHANNEL)
    for (let i = 0; i < 5; i++) {
      expect((await loginOtp(app, target, "000000")).status).toBe(401)
    }
    // 第 6 次起即使验证码正确也 423（attempts >= 5 在哈希比对前拦截）
    expect((await loginOtp(app, target, code)).status).toBe(423)
  })

  it("login：并发错码最多五次进入校验，其余立即锁定", async () => {
    const app = createApp()
    const target = "otp_concurrent_attempts@example.com"
    await createTestUser({ username: "otp_concurrent_attempts", password: "Passw0rd!", email: target })
    expect((await sendOtp(app, target)).status).toBe(200)
    const code = captureDevOtpCode(target, CHANNEL)
    const wrongCode = code === "000000" ? "000001" : "000000"
    const responses = await Promise.all(
      Array.from({ length: 10 }, async () => await loginOtp(app, target, wrongCode)),
    )
    const statuses = responses.map((response) => response.status)
    expect(statuses.filter((status) => status === 401)).toHaveLength(5)
    expect(statuses.filter((status) => status === 423)).toHaveLength(5)
    expect((await loginOtp(app, target, code)).status).toBe(423)
  })

  it("login：过期验证码返回 401", async () => {
    const app = createApp()
    const target = "otp_expired@example.com"
    expect((await sendOtp(app, target)).status).toBe(200)
    const code = captureDevOtpCode(target, CHANNEL)
    // 直接改库模拟 5 分钟过期（不真实等待）
    await prisma.otpCode.updateMany({
      where: { target, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })
    expect((await loginOtp(app, target, code)).status).toBe(401)
  })

  it("login：错码 4 次后正确码仍可登录（上限 5 次）", async () => {
    const app = createApp()
    const target = "otp_attempt@example.com"
    expect((await sendOtp(app, target)).status).toBe(200)
    const code = captureDevOtpCode(target, CHANNEL)
    for (let i = 0; i < 4; i++) {
      expect((await loginOtp(app, target, "000000")).status).toBe(401)
    }
    // 第 5 次（未达上限）正确码仍可登录
    expect((await loginOtp(app, target, code)).status).toBe(200)
  })

  it("telephone 渠道：send + login 全流程", async () => {
    const app = createApp()
    const target = "13800138000"
    expect((await sendOtp(app, target, "telephone")).status).toBe(200)
    const code = captureDevOtpCode(target, "telephone")
    const res = await loginOtp(app, target, code, "telephone")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { accessToken: string; user: { username: string } } }
    expect(typeof body.data.accessToken).toBe("string")
    expect(body.data.user.username).toBe("otp_phone_test")
  })
})
