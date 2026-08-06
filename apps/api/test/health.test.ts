import { describe, expect, it } from "vitest"
import { createApp } from "../src/index.js"

describe("health", () => {
  it("GET /api/health 返回 ok", async () => {
    const app = createApp()
    const res = await app.request("/api/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ code: 0, data: { ok: true }, message: "ok" })
  })

  it("未知路由返回 404 统一格式", async () => {
    const app = createApp()
    const res = await app.request("/api/nope")
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toMatchObject({ code: "NOT_FOUND" })
  })
})
