import { prisma } from "@repo/db"
import type { MiddlewareHandler } from "hono"
import type { AppConfig } from "../config.js"
import { forbidden, unauthorized } from "../lib/http-error.js"
import { verifyAccessToken } from "../lib/jwt.js"
import { toPublicUser, type PublicUser } from "../lib/schemas.js"
import { getUserAuthInfo, type AuthInfo } from "../services/auth-info.js"
import { clerkAuthenticate } from "./clerk-auth.js"

declare module "hono" {
  interface ContextVariableMap {
    userId: string
    authUser: PublicUser
    authInfo?: AuthInfo
  }
}

/** JWT Bearer 认证：解析 access token → 用户存在且启用 → c.set("userId"/"authUser")；失败一律 401 */
function authenticateJwt(jwtSecret: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization")
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null
    if (!token) throw unauthorized("未登录")
    const userId = verifyAccessToken(token, jwtSecret)
    if (!userId) throw unauthorized("登录已过期")
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.status) throw unauthorized("账号不可用")
    // authUser 与 getUserAuthInfo 共用（避免重复查 user）；authInfo 由 requirePermission 设置
    c.set("userId", user.id)
    c.set("authUser", toPublicUser(user))
    await next()
  }
}

/** 认证选择器：按 cfg.authProvider 分支（local → JWT Bearer；clerk → Clerk session token） */
export function authenticate(cfg: AppConfig): MiddlewareHandler {
  return cfg.authProvider === "clerk" ? clerkAuthenticate() : authenticateJwt(cfg.jwtSecret)
}

/** 权限校验：实时计算用户权限码（数据量小不缓存），含 code 放行；无权 403；未认证（未挂 authenticate）401 */
export function requirePermission(code: string): MiddlewareHandler {
  return async (c, next) => {
    const userId = c.get("userId")
    if (!userId) throw unauthorized("未登录")
    const info = await getUserAuthInfo(userId, c.get("authUser"))
    if (!info.permissionCodes.includes(code)) throw forbidden(`缺少权限: ${code}`)
    c.set("authInfo", info)
    await next()
  }
}
