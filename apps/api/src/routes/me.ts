import { createRoute } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { AppConfig } from "../config.js"
import { authenticate } from "../middleware/auth.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { errorBodySchema, meResponseSchema } from "../lib/schemas.js"
import { getUserAuthInfo } from "../services/auth-info.js"

export function meRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/auth/me",
      // openapi() 签名是 (route, handler, hook?)：中间件须经 route.middleware 传入（传作第二参数会被当作 handler）
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      responses: {
        200: { description: "当前登录用户权限信息", ...okBody(meResponseSchema) },
        401: { description: "未登录或登录已过期", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const info = await getUserAuthInfo(c.get("userId"), c.get("authUser"))
      return c.json({ code: 0, data: info, message: "ok" }, 200)
    },
  )

  return app
}
