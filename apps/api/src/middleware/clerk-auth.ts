import { createClerkClient } from "@clerk/backend"
import type { ClerkClient, User as ClerkUser } from "@clerk/backend"
import type { MiddlewareHandler } from "hono"
import { prisma } from "@repo/db"
import type { User } from "@repo/db"
import { HttpError, unauthorized } from "../lib/http-error.js"
import { toPublicUser } from "../lib/schemas.js"

/** 清洗 email 前缀为合法 username 基底（小写 + 仅保留 [a-z0-9_.-] + 截断 32）；空 → "user"（由 uniqueUsername 兜底） */
export function cleanUsernameBase(base: string): string {
  return base.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 32)
}

const isUsernameTaken = (username: string): Promise<boolean> =>
  prisma.user.findUnique({ where: { username } }).then((user) => user !== null)

/** 生成唯一 username：清洗前缀 + 冲突时追加递增数字后缀（isTaken 可注入，便于单测） */
export async function uniqueUsername(
  base: string,
  isTaken: (name: string) => Promise<boolean> = isUsernameTaken,
): Promise<string> {
  const prefix = cleanUsernameBase(base) || "user"
  let username = prefix
  for (let i = 1; await isTaken(username); i++) {
    username = `${prefix.slice(0, 32 - String(i).length)}${String(i)}`
  }
  return username
}

/**
 * 按 clerkId 取本地用户；不存在时用 Clerk 档案自动建号（首次登录）：
 * username 从 email 前缀唯一化、passwordHash 空串（Clerk 用户约定）、nickname 取 firstName/lastName、
 * email 取第一个（统一小写，与本地邮箱存储一致）、clerkId 绑定。
 * Clerk API 异常（用户不存在/网络）→ 401；DB 异常（如 email 撞唯一索引）不吞，走全局错误处理（409）。
 */
async function findOrCreateUser(client: ClerkClient, clerkId: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { clerkId } })
  if (existing) return existing

  let clerkUser: ClerkUser
  try {
    clerkUser = await client.users.getUser(clerkId)
  } catch {
    throw unauthorized("Clerk 会话无效")
  }
  const email = clerkUser.emailAddresses[0]?.emailAddress.toLowerCase() ?? null
  const username = await uniqueUsername(email?.split("@")[0] ?? "clerk")
  return prisma.user.create({
    data: {
      username,
      passwordHash: "",
      nickname: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || username,
      email,
      clerkId,
    },
  })
}

/**
 * Clerk 认证中间件：Bearer session token（@clerk/backend v3 的 authenticateRequest 直接从请求
 * Authorization 头解析）→ userId（sub）→ 本地 User 按 clerkId 映射（首次自动建号）→ status 检查 →
 * c.set("userId"/"authUser")。Clerk API 异常一律 401（HttpError 原样重抛），DB 异常不吞。
 */
export function clerkAuthenticate(): MiddlewareHandler {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) throw new Error("CLERK_SECRET_KEY 未配置（AUTH_PROVIDER=clerk 时必须）")
  const client = createClerkClient({ secretKey })
  return async (c, next) => {
    const header = c.req.header("authorization")
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null
    if (!token) throw unauthorized("未登录")
    let userId: string
    try {
      const state = await client.authenticateRequest(c.req.raw)
      if (!state.isAuthenticated) throw unauthorized("Clerk 会话无效")
      const rawId = state.toAuth().userId
      if (!rawId) throw unauthorized("Clerk 会话无效")
      userId = rawId
    } catch (err) {
      if (err instanceof HttpError) throw err
      throw unauthorized("Clerk 会话无效")
    }
    const user = await findOrCreateUser(client, userId)
    if (!user.status) throw unauthorized("账号不可用")
    c.set("userId", user.id)
    c.set("authUser", toPublicUser(user))
    await next()
  }
}
