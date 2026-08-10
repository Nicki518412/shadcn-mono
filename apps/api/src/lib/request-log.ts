import type { Context } from "hono"
import { prisma } from "@repo/db"

/** 请求来源 IP：x-forwarded-for 取首个地址（客户端可在后缀追加伪造地址），回退 x-real-ip；取不到存 null */
export function requestIp(c: Context): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? null
}

/** 请求浏览器 UA（无 UA 存 null） */
export function requestUserAgent(c: Context): string | null {
  return c.req.header("user-agent") ?? null
}

/**
 * 登录日志写入（fire-and-forget：绝不阻塞认证流程，写入失败静默丢弃）。
 * 失败路径也在 throw 前调用，保证"尝试的用户名"被记录（防枚举场景）。
 */
export function recordLoginLog(
  c: Context,
  input: { username: string; userId?: string | null; status: "SUCCESS" | "FAILED"; message?: string | null },
): void {
  void prisma.loginLog
    .create({
      data: {
        username: input.username,
        userId: input.userId ?? null,
        status: input.status,
        message: input.message ?? null,
        ip: requestIp(c),
        userAgent: requestUserAgent(c),
      },
    })
    .catch(() => undefined)
}
