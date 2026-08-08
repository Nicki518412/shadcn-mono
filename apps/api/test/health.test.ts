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

  it("OpenAPI 为受保护端点声明 BearerAuth", () => {
    const document = createApp().getOpenAPIDocument({
      openapi: "3.0.0",
      info: { title: "test", version: "0" },
    })
    expect(document.components?.securitySchemes).toMatchObject({
      BearerAuth: { type: "http", scheme: "bearer" },
    })
    expect(document.paths["/api/users"]?.get?.security).toEqual([{ BearerAuth: [] }])
    expect(document.paths["/api/auth/login"]?.post?.security).toBeUndefined()
  })
})
