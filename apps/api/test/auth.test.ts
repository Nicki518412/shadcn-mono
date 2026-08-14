import { beforeAll, describe, expect, it, vi } from "vitest"
import type { z } from "@hono/zod-openapi"
import type { loginResponseSchema, tokenPairSchema } from "../src/lib/schemas.js"
import { createApp } from "../src/index.js"
import { createTestUser } from "./helpers.js"

interface LoginBody {
  data: z.infer<typeof loginResponseSchema>
}
interface RefreshBody {
  data: z.infer<typeof tokenPairSchema>
}

function loginRequest(app: ReturnType<typeof createApp>, username: string, password: string) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
}

function refreshRequest(app: ReturnType<typeof createApp>, refreshToken: string) {
  return app.request("/api/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
}

describe("auth", () => {
  beforeAll(async () => {
    await createTestUser({ username: "auth_test", password: "Passw0rd!" })
  })

  it("登录成功返回双 token", async () => {
    const app = createApp()
    const res = await loginRequest(app, "auth_test", "Passw0rd!")
    expect(res.status).toBe(200)
    const body = (await res.json()) as LoginBody
    expect(typeof body.data.accessToken).toBe("string")
    expect(typeof body.data.refreshToken).toBe("string")
    expect(typeof body.data.user.id).toBe("string")
    expect(body.data.user.username).toBe("auth_test")
  })

  it("密码错误返回 401（code LOGIN_FAILED）", async () => {
    const app = createApp()
    const res = await loginRequest(app, "auth_test", "wrongpass")
    expect(res.status).toBe(401)
    expect(((await res.json()) as { code: string }).code).toBe("LOGIN_FAILED")
  })

  it("连续 5 次错误密码锁定 15 分钟", async () => {
    // 独立用户：锁定作用于账号 key，避免污染同文件其他测试的登录
    await createTestUser({ username: "throttle_test", password: "Passw0rd!" })
    const app = createApp()
    for (let i = 0; i < 5; i++) {
      const res = await loginRequest(app, "throttle_test", "wrongpass")
      expect(res.status).toBe(401)
    }
    const res = await loginRequest(app, "throttle_test", "Passw0rd!")
    expect(res.status).toBe(423)
    expect(((await res.json()) as { code: string }).code).toBe("ACCOUNT_LOCKED")
  })

  it("锁定 15 分钟自然过期后恢复登录", async () => {
    await createTestUser({ username: "expire_lock_test", password: "Passw0rd!" })
    const app = createApp()
    // 仅伪造 Date（不动 setTimeout 等）：scrypt/JWT 为原生异步，不受影响；
    // 锁定时间与 token exp 均基于 Date.now，伪造后可在测试内前进 15 分钟验证自然解锁
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      for (let i = 0; i < 5; i++) {
        const res = await loginRequest(app, "expire_lock_test", "wrongpass")
        expect(res.status).toBe(401)
      }
      expect((await loginRequest(app, "expire_lock_test", "Passw0rd!")).status).toBe(423)
      // 前进 15 分钟 + 1ms：锁定自然过期，正确密码可登录
      vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1)
      const recovered = await loginRequest(app, "expire_lock_test", "Passw0rd!")
      expect(recovered.status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it("更换 X-Forwarded-For 不能绕过账号锁定", async () => {
    await createTestUser({ username: "spoofed_ip_test", password: "Passw0rd!" })
    const app = createApp()
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${String(i)}` },
        body: JSON.stringify({ username: "spoofed_ip_test", password: "wrongpass" }),
      })
      expect(res.status).toBe(401)
    }
    expect((await loginRequest(app, "spoofed_ip_test", "Passw0rd!")).status).toBe(423)
  })

  it("refresh 轮换：旧 token 二次使用 401，新 token 有效", async () => {
    const app = createApp()
    const login = await loginRequest(app, "auth_test", "Passw0rd!")
    const { refreshToken } = ((await login.json()) as LoginBody).data
    const r1 = await refreshRequest(app, refreshToken)
    expect(r1.status).toBe(200)
    const newToken = ((await r1.json()) as RefreshBody).data.refreshToken
    const r2 = await refreshRequest(app, refreshToken)
    expect(r2.status).toBe(401)
    const r3 = await refreshRequest(app, newToken)
    expect(r3.status).toBe(200)
  })

  it("refresh 并发重放：同一旧 token 并发仅一次成功", async () => {
    const app = createApp()
    const login = await loginRequest(app, "auth_test", "Passw0rd!")
    const { refreshToken } = ((await login.json()) as LoginBody).data
    const [r1, r2] = await Promise.all([refreshRequest(app, refreshToken), refreshRequest(app, refreshToken)])
    expect([r1.status, r2.status].sort()).toEqual([200, 401])
  })

  it("logout 吊销 refresh", async () => {
    const app = createApp()
    const login = await loginRequest(app, "auth_test", "Passw0rd!")
    const { refreshToken } = ((await login.json()) as LoginBody).data
    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    expect(logout.status).toBe(200)
    const r = await refreshRequest(app, refreshToken)
    expect(r.status).toBe(401)
  })

  it("修改密码：旧密码验证；成功后旧密码失效、refresh 全吊销", async () => {
    // 独立用户（避免影响其他用例的 auth_test）
    await createTestUser({ username: "change_pw_test", password: "Passw0rd!" })
    const app = createApp()
    const login = await loginRequest(app, "change_pw_test", "Passw0rd!")
    const { accessToken, refreshToken } = ((await login.json()) as LoginBody).data

    const change = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ currentPassword: "Passw0rd!", newPassword: "NewPassw0rd!" }),
    })
    expect(change.status).toBe(200)

    // 旧密码登录失败、新密码登录成功
    expect((await loginRequest(app, "change_pw_test", "Passw0rd!")).status).toBe(401)
    expect((await loginRequest(app, "change_pw_test", "NewPassw0rd!")).status).toBe(200)
    // 修改前的 refresh token 已被吊销
    expect((await refreshRequest(app, refreshToken)).status).toBe(401)
  })

  it("修改密码：旧密码错误 401（INVALID_CURRENT_PASSWORD）；新旧相同 400（SAME_PASSWORD）", async () => {
    await createTestUser({ username: "change_pw_bad", password: "Passw0rd!" })
    const app = createApp()
    const login = await loginRequest(app, "change_pw_bad", "Passw0rd!")
    const { accessToken } = ((await login.json()) as LoginBody).data
    const headers = { "content-type": "application/json", authorization: `Bearer ${accessToken}` }

    const wrong = await app.request("/api/auth/change-password", {
      method: "POST",
      headers,
      body: JSON.stringify({ currentPassword: "WrongPass!", newPassword: "NewPassw0rd!" }),
    })
    expect(wrong.status).toBe(401)
    expect(((await wrong.json()) as { code: string }).code).toBe("INVALID_CURRENT_PASSWORD")

    const same = await app.request("/api/auth/change-password", {
      method: "POST",
      headers,
      body: JSON.stringify({ currentPassword: "Passw0rd!", newPassword: "Passw0rd!" }),
    })
    expect(same.status).toBe(400)
    expect(((await same.json()) as { code: string }).code).toBe("SAME_PASSWORD")
  })
})
