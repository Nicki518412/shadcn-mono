import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { HttpError, forbidden, unauthorized } from "../lib/http-error.js"
import { verifyPassword } from "../lib/password.js"
import { hashToken, issueTokenPair } from "../lib/tokens.js"
import { checkThrottle, recordFailure } from "../lib/login-throttle.js"

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
})
const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export interface PublicUser {
  id: string
  username: string
  nickname: string
  email: string | null
  telephone: string | null
}

export function publicUser(user: {
  id: string
  username: string
  nickname: string
  email: string | null
  telephone: string | null
}): PublicUser {
  return { id: user.id, username: user.username, nickname: user.nickname, email: user.email, telephone: user.telephone }
}

export function authRoutes(jwtSecret: string): OpenAPIHono {
  const app = new OpenAPIHono({
    // 子应用不继承根应用 defaultHook，校验失败契约体保持一致
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          { code: "BAD_REQUEST", message: result.error.issues[0]?.message ?? "请求参数错误", data: null },
          400,
        )
      }
    },
  })

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/login",
      request: { body: { content: { "application/json": { schema: loginSchema } } } },
      responses: {
        200: { description: "登录成功" },
        401: { description: "用户名或密码错误" },
        403: { description: "账号已被禁用" },
        423: { description: "账号锁定" },
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
      if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        recordFailure(key)
        throw unauthorized("用户名或密码错误")
      }
      if (!user.status) throw forbidden("账号已被禁用")

      const pair = await issueTokenPair(user.id, jwtSecret)
      return c.json({ code: 0, data: { ...pair, user: publicUser(user) }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/refresh",
      request: { body: { content: { "application/json": { schema: refreshSchema } } } },
      responses: { 200: { description: "轮换成功" }, 401: { description: "无效" } },
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
      responses: { 200: { description: "已吊销" } },
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
