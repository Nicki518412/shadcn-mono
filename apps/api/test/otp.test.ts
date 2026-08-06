import { beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/index.js"
import { captureCodeFromDb, createTestUser } from "./helpers.js"

const CHANNEL = "email"

function sendOtp(app: ReturnType<typeof createApp>, target: string) {
  return app.request("/api/auth/otp/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel: CHANNEL, target }),
  })
}

function loginOtp(app: ReturnType<typeof createApp>, target: string, code: string) {
  return app.request("/api/auth/otp/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel: CHANNEL, target, code }),
  })
}

describe("otp", () => {
  beforeAll(async () => {
    await createTestUser({ username: "otp_test", password: "Passw0rd!", email: "otp_test@example.com" })
    // login 测试需要落库用户（OtpCode.userId 关联），独立 target 避免 60s 冷却互扰
    await createTestUser({ username: "otp_login_test", password: "Passw0rd!", email: "otp_login@example.com" })
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

  it("login：正确验证码登录成功返回双 token，同码二次使用 401（一次性消费）", async () => {
    const app = createApp()
    const target = "otp_login@example.com"
    expect((await sendOtp(app, target)).status).toBe(200)
    const code = await captureCodeFromDb(target)
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
  })

  it("login：错误码累计 5 次后 423（attempts 超限）", async () => {
    const app = createApp()
    const target = "locked@example.com"
    expect((await sendOtp(app, target)).status).toBe(200)
    const code = await captureCodeFromDb(target)
    for (let i = 0; i < 5; i++) {
      expect((await loginOtp(app, target, "000000")).status).toBe(401)
    }
    // 第 6 次起即使验证码正确也 423（attempts >= 5 在哈希比对前拦截）
    expect((await loginOtp(app, target, code)).status).toBe(423)
  })
})
