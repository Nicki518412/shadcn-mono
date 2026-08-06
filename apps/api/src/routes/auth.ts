import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { Env } from "hono"
import { prisma } from "@repo/db"
import { HttpError, forbidden, unauthorized } from "../lib/http-error.js"
import { verifyPassword } from "../lib/password.js"
import { hashToken, issueTokenPair } from "../lib/tokens.js"
import { checkThrottle, recordFailure, resetThrottle } from "../lib/login-throttle.js"
import { errorBodySchema, loginResponseSchema, toPublicUser, tokenPairSchema } from "../lib/schemas.js"
import { validationHook } from "../lib/validation-hook.js"

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
})
const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

// 统一成功响应包装（契约体 { code, data, message }，data 随路由不同）
const okBody = (dataSchema: z.ZodType) =>
  z.object({ code: z.number(), data: dataSchema, message: z.string() })

export function authRoutes(jwtSecret: string): OpenAPIHono {
  const app = new OpenAPIHono<Env>({
    // 子应用不继承根应用 defaultHook，校验失败契约体保持一致
    defaultHook: validationHook,
  })

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/login",
      request: { body: { content: { "application/json": { schema: loginSchema } } } },
      responses: {
        200: { description: "登录成功", content: { "application/json": { schema: okBody(loginResponseSchema) } } },
        401: { description: "用户名或密码错误", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "账号已被禁用", content: { "application/json": { schema: errorBodySchema } } },
        423: { description: "账号锁定", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { username, password } = c.req.valid("json")
      const key = `login:${username.toLowerCase()}:${c.req.header("x-forwarded-for") ?? "local"}`
      if (!checkThrottle(key)) throw new HttpError(423, "LOCKED", "账号已锁定，请 15 分钟后再试")

      const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } })
      // 用户不存在与密码不符同响应（防枚举）；均计入失败
      if (!user) {
        recordFailure(key)
        throw unauthorized("用户名或密码错误")
      }
      if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
        recordFailure(key)
        throw unauthorized("用户名或密码错误")
      }
      if (!user.status) throw forbidden("账号已被禁用")

      resetThrottle(key) // 登录成功清除失败计数
      const pair = await issueTokenPair(user.id, jwtSecret)
      return c.json({ code: 0, data: { ...pair, user: toPublicUser(user) }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/refresh",
      request: { body: { content: { "application/json": { schema: refreshSchema } } } },
      responses: {
        200: { description: "轮换成功", content: { "application/json": { schema: okBody(tokenPairSchema) } } },
        401: { description: "无效", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { refreshToken } = c.req.valid("json")
      const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } })
      if (!record || record.revokedAt || record.expiresAt < new Date()) throw unauthorized("登录已过期")
      const user = await prisma.user.findUnique({ where: { id: record.userId } })
      if (!user) throw unauthorized("账号不可用")
      if (!user.status) throw unauthorized("账号不可用")
      // 原子轮换：带 revokedAt=null 条件更新（CAS），并发重放同一旧 token 时仅一个请求成功
      const revoked = await prisma.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      if (revoked.count !== 1) throw unauthorized("登录已过期")
      const pair = await issueTokenPair(user.id, jwtSecret)
      return c.json({ code: 0, data: pair, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/logout",
      request: { body: { content: { "application/json": { schema: refreshSchema } } } },
      responses: {
        200: { description: "已吊销", content: { "application/json": { schema: okBody(z.null()) } } },
      },
    }),
    async (c) => {
      const { refreshToken } = c.req.valid("json")
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}
