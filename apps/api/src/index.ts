import { pathToFileURL } from "node:url"
import { OpenAPIHono } from "@hono/zod-openapi"
import { swaggerUI } from "@hono/swagger-ui"
import type { Env } from "hono"
import { HTTPException } from "hono/http-exception"
import { loadConfig, type AppConfig } from "./config.js"
import { HttpError } from "./lib/http-error.js"
import { API_INFO } from "./lib/schemas.js"
import { validationHook } from "./lib/validation-hook.js"
import { authRoutes } from "./routes/auth.js"
import { meRoutes } from "./routes/me.js"
import { menuRoutes } from "./routes/menus.js"
import { otpRoutes } from "./routes/otp.js"
import { roleRoutes } from "./routes/roles.js"
import { userRoutes } from "./routes/users.js"

export function createApp(cfg: AppConfig = loadConfig()): OpenAPIHono {
  const app = new OpenAPIHono<Env>({
    // zod 校验失败统一 400 契约体（校验失败不 throw，onError 捕获不到）
    defaultHook: validationHook,
  })

  app.doc("/api/openapi.json", {
    openapi: "3.0.0",
    info: API_INFO,
  })
  app.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  })
  app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }))

  app.get("/api/health", (c) =>
    c.json({ code: 0, data: { ok: true }, message: "ok" }),
  )

  // MenuNode 递归组件手工注册（实证：zod-to-openapi v7 不支持 z.lazy，schemas.ts menuNodeSchema 仅运行时用）
  app.openAPIRegistry.registerComponent("schemas", "MenuNode", {
    type: "object",
    properties: {
      id: { type: "string" },
      parentId: { type: "string", nullable: true },
      nameZh: { type: "string" },
      nameEn: { type: "string", nullable: true },
      type: { type: "string", enum: ["DIR", "MENU", "BUTTON"] },
      path: { type: "string", nullable: true },
      component: { type: "string", nullable: true },
      icon: { type: "string", nullable: true },
      permission: { type: "string", nullable: true },
      sort: { type: "number" },
      status: { type: "boolean" },
      children: { type: "array", items: { $ref: "#/components/schemas/MenuNode" } },
    },
    required: ["id", "parentId", "nameZh", "nameEn", "type", "path", "component", "icon", "permission", "sort", "status", "children"],
  })

  app.route("/", authRoutes(cfg))
  app.route("/", otpRoutes(cfg))
  app.route("/", meRoutes(cfg))
  app.route("/", roleRoutes(cfg))
  app.route("/", menuRoutes(cfg))
  app.route("/", userRoutes(cfg))

  app.notFound((c) =>
    c.json({ code: "NOT_FOUND", message: "接口不存在", data: null }, 404),
  )

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ code: err.code, message: err.message, data: null }, err.status)
    }
    if (err instanceof HTTPException) {
      return c.json({ code: "HTTP_ERROR", message: err.message, data: null }, err.status)
    }
    // 兜底：Prisma P2002（唯一约束冲突）走统一 409 契约体；路由层仍做字段级转换
    if (typeof err === "object" && (err as { code?: string }).code === "P2002") {
      return c.json({ code: "CONFLICT", message: "数据冲突", data: null }, 409)
    }
    console.error("[api] unhandled error:", err)
    return c.json({ code: "INTERNAL", message: "服务器内部错误", data: null }, 500)
  })

  return app
}

// 仅直接运行时监听（测试用 createApp().request()）
// Windows 下 argv[1] 是反斜杠路径，需经 pathToFileURL 归一化后再与 import.meta.url 比较
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const { serve } = await import("@hono/node-server")
  const cfg = loadConfig()
  serve({ fetch: createApp(cfg).fetch, port: cfg.port }, (info) => {
    console.log(`api listening on http://localhost:${String(info.port)}`)
  })
}
