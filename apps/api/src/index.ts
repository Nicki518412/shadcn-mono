import { pathToFileURL } from "node:url"
import { OpenAPIHono } from "@hono/zod-openapi"
import { swaggerUI } from "@hono/swagger-ui"
import { HTTPException } from "hono/http-exception"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { HttpError } from "./lib/http-error.js"

export function createApp(): OpenAPIHono {
  const app = new OpenAPIHono()

  app.doc("/api/openapi.json", {
    openapi: "3.0.0",
    info: { title: "shadcn-mono API", version: "0.1.0" },
  })
  app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }))

  app.get("/api/health", (c) =>
    c.json({ code: 0, data: { ok: true }, message: "ok" }),
  )

  app.notFound((c) =>
    c.json({ code: "NOT_FOUND", message: "接口不存在", data: null }, 404),
  )

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(
        { code: err.code, message: err.message, data: null },
        err.status as ContentfulStatusCode,
      )
    }
    if (err instanceof HTTPException) {
      return c.json({ code: "HTTP_ERROR", message: err.message, data: null }, err.status)
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
  const { loadConfig } = await import("./config.js")
  const cfg = loadConfig()
  serve({ fetch: createApp().fetch, port: cfg.port }, (info) => {
    console.log(`api listening on http://localhost:${String(info.port)}`)
  })
}
