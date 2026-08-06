import { beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/index.js"
import { createTestUser } from "./helpers.js"

interface LoginData {
  data: {
    accessToken: string
    refreshToken: string
    user: { id: string; username: string; nickname: string; email: string | null; telephone: string | null }
  }
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
    const body = (await res.json()) as LoginData
    expect(typeof body.data.accessToken).toBe("string")
    expect(typeof body.data.refreshToken).toBe("string")
    expect(typeof body.data.user.id).toBe("string")
    expect(body.data.user.username).toBe("auth_test")
  })

  it("密码错误返回 401", async () => {
    const app = createApp()
    const res = await loginRequest(app, "auth_test", "wrongpass")
    expect(res.status).toBe(401)
  })

  it("连续 5 次错误密码锁定 15 分钟", async () => {
    // 独立用户：锁定作用于 throttle key（用户名+ip），避免污染同文件其他测试的登录
    await createTestUser({ username: "throttle_test", password: "Passw0rd!" })
    const app = createApp()
    for (let i = 0; i < 5; i++) {
      const res = await loginRequest(app, "throttle_test", "wrongpass")
      expect(res.status).toBe(401)
    }
    const res = await loginRequest(app, "throttle_test", "Passw0rd!")
    expect(res.status).toBe(423)
  })

  it("refresh 轮换：旧 token 二次使用 401，新 token 有效", async () => {
    const app = createApp()
    const login = await loginRequest(app, "auth_test", "Passw0rd!")
    const { refreshToken } = ((await login.json()) as LoginData).data
    const r1 = await refreshRequest(app, refreshToken)
    expect(r1.status).toBe(200)
    const newToken = ((await r1.json()) as { data: { refreshToken: string } }).data.refreshToken
    const r2 = await refreshRequest(app, refreshToken)
    expect(r2.status).toBe(401)
    const r3 = await refreshRequest(app, newToken)
    expect(r3.status).toBe(200)
  })

  it("refresh 并发重放：同一旧 token 并发仅一次成功", async () => {
    const app = createApp()
    const login = await loginRequest(app, "auth_test", "Passw0rd!")
    const { refreshToken } = ((await login.json()) as LoginData).data
    const [r1, r2] = await Promise.all([refreshRequest(app, refreshToken), refreshRequest(app, refreshToken)])
    expect([r1.status, r2.status].sort()).toEqual([200, 401])
  })

  it("logout 吊销 refresh", async () => {
    const app = createApp()
    const login = await loginRequest(app, "auth_test", "Passw0rd!")
    const { refreshToken } = ((await login.json()) as LoginData).data
    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    expect(logout.status).toBe(200)
    const r = await refreshRequest(app, refreshToken)
    expect(r.status).toBe(401)
  })
})
