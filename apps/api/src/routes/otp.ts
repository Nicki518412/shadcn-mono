import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createHash, randomInt } from "node:crypto"
import type { Env } from "hono"
import { prisma } from "@repo/db"
import { HttpError } from "../lib/http-error.js"
import { otpSender } from "../lib/otp-sender.js"
import { errorBodySchema, loginResponseSchema, toPublicUser } from "../lib/schemas.js"
import { issueTokenPair } from "../lib/tokens.js"
import { validationHook } from "../lib/validation-hook.js"

const OTP_TTL_MS = 5 * 60 * 1000
const OTP_COOLDOWN_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5

const sendSchema = z.object({
  channel: z.enum(["email", "telephone"]),
  target: z.string().min(3).max(255),
})
const loginOtpSchema = sendSchema.extend({ code: z.string().regex(/^\d{6}$/) })

// 统一成功响应包装（契约体 { code, data, message }，data 随路由不同）——与 auth.ts 一致
const okBody = (dataSchema: z.ZodType) =>
  z.object({ code: z.number(), data: dataSchema, message: z.string() })

export function otpRoutes(jwtSecret: string): OpenAPIHono {
  const app = new OpenAPIHono<Env>({
    // 子应用不继承根应用 defaultHook，校验失败契约体保持一致
    defaultHook: validationHook,
  })

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/otp/send",
      request: { body: { content: { "application/json": { schema: sendSchema } } } },
      responses: {
        200: {
          description: "已发送",
          content: { "application/json": { schema: okBody(z.object({ sent: z.boolean() })) } },
        },
        429: { description: "发送过于频繁", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { channel, target } = c.req.valid("json")
      const normalized = target.toLowerCase()
      const storedChannel = channel.toUpperCase()
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
          // 测试专用明文（DevOtpSender 场景）：仅开发库保留；生产实现不写入
          devPlainCode: code,
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
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/auth/otp/login",
      request: { body: { content: { "application/json": { schema: loginOtpSchema } } } },
      responses: {
        200: {
          description: "登录成功",
          content: { "application/json": { schema: okBody(loginResponseSchema) } },
        },
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
        throw new HttpError(423, "LOCKED", "尝试次数过多，请重新获取验证码")
      }
      const hash = createHash("sha256").update(code).digest("hex")
      if (hash !== record.codeHash) {
        await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } })
        throw new HttpError(401, "INVALID_OTP", "验证码错误")
      }
      const user = await prisma.user.findUnique({ where: { id: record.userId ?? "" } })
      if (!user?.status) throw new HttpError(401, "INVALID_OTP", "账号不可用")

      // 原子消费（CAS）：并发同码重放仅一个请求成功（与 refresh 轮换同模式）
      const consumed = await prisma.otpCode.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: new Date() },
      })
      if (consumed.count !== 1) throw new HttpError(401, "INVALID_OTP", "验证码无效或已过期")

      const pair = await issueTokenPair(user.id, jwtSecret)
      return c.json({ code: 0, data: { ...pair, user: toPublicUser(user) }, message: "ok" }, 200)
    },
  )

  return app
}
