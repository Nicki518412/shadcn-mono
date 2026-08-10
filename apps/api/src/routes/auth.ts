import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import type { AppConfig } from "../config.js"
import { HttpError, unauthorized } from "../lib/http-error.js"
import { checkThrottle, recordFailure, resetThrottle } from "../lib/login-throttle.js"
import { createSubApp, okBody } from "../lib/openapi.js"
import { hashPassword, verifyPassword } from "@repo/db"
import { errorBodySchema, loginResponseSchema, toPublicUser, tokenPairSchema } from "../lib/schemas.js"
import { hashToken, issueTokenPair } from "../lib/tokens.js"
import { recordLoginLog, requestIp, requestUserAgent } from "../lib/request-log.js"
import { authenticate } from "../middleware/auth.js"

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
})
const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export function authRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/login",
      request: { body: { content: { "application/json": { schema: loginSchema } } } },
      responses: {
        200: { description: "登录成功", ...okBody(loginResponseSchema) },
        401: { description: "用户名或密码错误", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "账号已被禁用", content: { "application/json": { schema: errorBodySchema } } },
        423: { description: "账号锁定", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { username, password } = c.req.valid("json")
      const normalized = username.toLowerCase()
      // 规格要求按账号锁定。不能信任客户端可伪造的 X-Forwarded-For，否则更换请求头即可绕过计数。
      const key = `login:${normalized}`
      if (!checkThrottle(key)) {
        recordLoginLog(c, { username: normalized, status: "FAILED", message: "ACCOUNT_LOCKED" })
        throw new HttpError(423, "ACCOUNT_LOCKED", "账号已锁定，请 15 分钟后再试")
      }

      const user = await prisma.user.findUnique({ where: { username: normalized } })
      // 用户不存在与密码不符同响应（防枚举）；均计入失败
      if (!user) {
        recordFailure(key)
        recordLoginLog(c, { username: normalized, status: "FAILED", message: "LOGIN_FAILED" })
        throw new HttpError(401, "LOGIN_FAILED", "用户名或密码错误")
      }
      if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
        recordFailure(key)
        recordLoginLog(c, { username: normalized, status: "FAILED", message: "LOGIN_FAILED" })
        throw new HttpError(401, "LOGIN_FAILED", "用户名或密码错误")
      }
      if (!user.status) {
        recordLoginLog(c, { username: normalized, status: "FAILED", message: "ACCOUNT_DISABLED" })
        throw new HttpError(403, "ACCOUNT_DISABLED", "账号已被禁用")
      }

      resetThrottle(key) // 登录成功清除失败计数
      recordLoginLog(c, { username: normalized, userId: user.id, status: "SUCCESS" })
      const pair = await issueTokenPair(user.id, cfg.jwtSecret, { ip: requestIp(c), userAgent: requestUserAgent(c) })
      return c.json({ code: 0, data: { ...pair, user: toPublicUser(user) }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/refresh",
      request: { body: { content: { "application/json": { schema: refreshSchema } } } },
      responses: {
        200: { description: "轮换成功", ...okBody(tokenPairSchema) },
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
      // 轮换携带当前请求的 ip/ua（会话展示以最近一次签发为准）
      const pair = await issueTokenPair(user.id, cfg.jwtSecret, { ip: requestIp(c), userAgent: requestUserAgent(c) })
      return c.json({ code: 0, data: pair, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/logout",
      request: { body: { content: { "application/json": { schema: refreshSchema } } } },
      responses: {
        200: { description: "已吊销", ...okBody(z.null()) },
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

  // 修改密码：旧密码验证 + 新密码设置；成功后吊销该用户全部 refresh token（其他会话强制下线）
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/change-password",
      middleware: [authenticate(cfg)],
      request: { body: { content: { "application/json": { schema: changePasswordSchema } } } },
      responses: {
        200: { description: "修改成功", ...okBody(z.null()) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "旧密码错误或未登录", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const userId = c.get("userId")
      const { currentPassword, newPassword } = c.req.valid("json")
      const user = await prisma.user.findUnique({ where: { id: userId } })
      // verifyPassword 为 async——必须 await，否则 Promise 恒真（旧密码校验被跳过 / 新密码恒判相同）
      if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new HttpError(401, "INVALID_CURRENT_PASSWORD", "当前密码不正确")
      }
      if (await verifyPassword(newPassword, user.passwordHash)) {
        throw new HttpError(400, "SAME_PASSWORD", "新密码不能与当前密码相同")
      }
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } }),
        prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      ])
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
})
