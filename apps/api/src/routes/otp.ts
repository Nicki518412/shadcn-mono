import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { createHash, randomInt } from "node:crypto"
import { prisma } from "@repo/db"
import { HttpError } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { createSubApp, okBody } from "../lib/openapi.js"
import { otpSender } from "../lib/otp-sender.js"
import { errorBodySchema, loginResponseSchema, toPublicUser } from "../lib/schemas.js"
import { issueTokenPair } from "../lib/tokens.js"

const OTP_TTL_MS = 5 * 60 * 1000
const OTP_COOLDOWN_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5

// 单实例内按 channel+target 串行化 send，关闭“检查冷却后再创建”的并发窗口。
// 多副本部署仍应在网关或共享存储层配置同维度限流。
const otpSendTails = new Map<string, Promise<void>>()

async function acquireOtpSendLock(key: string): Promise<() => void> {
  const previous = otpSendTails.get(key) ?? Promise.resolve()
  let releaseCurrent = (): void => undefined
  const gate = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })
  const tail = previous.then(() => gate)
  otpSendTails.set(key, tail)
  await previous
  return () => {
    releaseCurrent()
    if (otpSendTails.get(key) === tail) otpSendTails.delete(key)
  }
}

const sendSchema = z.object({
  channel: z.enum(["email", "telephone"]),
  target: z.string().min(3).max(255),
})
const loginOtpSchema = sendSchema.extend({ code: z.string().regex(/^\d{6}$/) })

export function otpRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/otp/send",
      request: { body: { content: { "application/json": { schema: sendSchema } } } },
      responses: {
        200: { description: "已发送", ...okBody(z.object({ sent: z.boolean() })) },
        429: { description: "发送过于频繁", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { channel, target } = c.req.valid("json")
      const normalized = target.toLowerCase()
      const storedChannel = channel.toUpperCase()
      const release = await acquireOtpSendLock(`${storedChannel}:${normalized}`)
      try {
        // 过期记录按 target 清理（防表无界增长）
        await prisma.otpCode.deleteMany({
          where: { channel: storedChannel, target: normalized, expiresAt: { lt: new Date() } },
        })
        const latest = await prisma.otpCode.findFirst({
          where: { channel: storedChannel, target: normalized },
          orderBy: { createdAt: "desc" },
        })
        if (latest && Date.now() - latest.createdAt.getTime() < OTP_COOLDOWN_MS) {
          throw new HttpError(429, "RATE_LIMITED", "发送过于频繁，请 60 秒后再试")
        }

        const code = randomInt(100000, 1000000).toString()
        const user = await prisma.user.findFirst({
          where: channel === "email" ? { email: normalized } : { telephone: normalized },
        })
        const hash = createHash("sha256").update(code).digest("hex")
        await prisma.otpCode.create({
          data: {
            channel: storedChannel,
            target: normalized,
            codeHash: hash,
            expiresAt: new Date(Date.now() + OTP_TTL_MS),
            userId: user?.id ?? null,
          },
        })
        // 防枚举：目标不存在也"发送成功"（不投递）
        if (user) {
          const address = channel === "email" ? user.email : user.telephone
          if (address !== null) {
            if (channel === "email") await otpSender.sendEmail(address, code)
            else await otpSender.sendSms(address, code)
          }
        }
        return c.json({ code: 0, data: { sent: true }, message: "ok" }, 200)
      } finally {
        release()
      }
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/otp/login",
      request: { body: { content: { "application/json": { schema: loginOtpSchema } } } },
      responses: {
        200: { description: "登录成功", ...okBody(loginResponseSchema) },
        401: { description: "验证码无效或已过期", content: { "application/json": { schema: errorBodySchema } } },
        423: { description: "尝试次数过多", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { channel, target, code } = c.req.valid("json")
      const normalized = target.toLowerCase()
      const record = await prisma.otpCode.findFirst({
        where: { channel: channel.toUpperCase(), target: normalized, consumedAt: null },
        orderBy: { createdAt: "desc" },
      })
      if (!record || record.expiresAt < new Date()) {
        throw new HttpError(401, "INVALID_OTP", "验证码无效或已过期")
      }
      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        throw new HttpError(423, "OTP_LOCKED", "尝试次数过多，请重新获取验证码")
      }
      const hash = createHash("sha256").update(code).digest("hex")
      if (hash !== record.codeHash) {
        // 条件递增是单条原子语句：并发请求中最多五次能命中 attempts < 5。
        const attempted = await prisma.otpCode.updateMany({
          where: {
            id: record.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
            attempts: { lt: OTP_MAX_ATTEMPTS },
          },
          data: { attempts: { increment: 1 } },
        })
        if (attempted.count !== 1) {
          throw new HttpError(423, "OTP_LOCKED", "尝试次数过多，请重新获取验证码")
        }
        throw new HttpError(401, "INVALID_OTP", "验证码错误")
      }
      const user = await prisma.user.findUnique({ where: { id: record.userId ?? "" } })
      if (!user?.status) throw new HttpError(401, "INVALID_OTP", "账号不可用")

      // 原子消费同时约束 attempts/过期时间：错误尝试与正确码并发时也不能越过五次上限。
      const consumed = await prisma.otpCode.updateMany({
        where: {
          id: record.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: OTP_MAX_ATTEMPTS },
        },
        data: { consumedAt: new Date() },
      })
      if (consumed.count !== 1) throw new HttpError(401, "INVALID_OTP", "验证码无效或已过期")

      const pair = await issueTokenPair(user.id, cfg.jwtSecret)
      return c.json({ code: 0, data: { ...pair, user: toPublicUser(user) }, message: "ok" }, 200)
    },
  )

  return app
}
