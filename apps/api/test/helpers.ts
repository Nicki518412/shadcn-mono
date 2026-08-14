import { prisma } from "@repo/db"
import { hashPassword } from "@repo/db"
import { getDevOtpCode } from "../src/lib/otp-sender.js"
import { createApp } from "../src/index.js"

export async function createTestUser(opts: {
  username: string
  password: string
  email?: string
  telephone?: string
}): Promise<void> {
  await prisma.user.create({
    data: {
      username: opts.username,
      passwordHash: await hashPassword(opts.password),
      nickname: opts.username,
      // exactOptionalPropertyTypes：undefined 不可赋给 string|null，显式置空
      email: opts.email ?? null,
      telephone: opts.telephone ?? null,
    },
  })
}

/** 测试用：读取 DevOtpSender 的进程内验证码，不向数据库写入明文。 */
export function captureDevOtpCode(target: string, channel: "email" | "telephone"): string {
  const code = getDevOtpCode(channel, target)
  if (!code) throw new Error(`未找到未消费验证码: ${target}`)
  return code
}

/** 按权限码查菜单，不存在则创建（permission 唯一索引：其他测试文件可能已建同码菜单，复用而非重建） */
export async function upsertMenu(data: {
  nameZh: string
  type: string
  permission: string
  parentId?: string
  path?: string
  component?: string
  icon?: string
  sort: number
}): Promise<{ id: string }> {
  const existing = await prisma.menu.findUnique({ where: { permission: data.permission } })
  return existing ?? prisma.menu.create({ data })
}

/** 登录指定账号并返回 access token（失败抛错带状态码） */
export async function loginAs(username: string, password: string): Promise<string> {
  const app = createApp()
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  if (res.status !== 200) throw new Error(`登录失败: ${String(res.status)}`)
  const body = (await res.json()) as { data: { accessToken: string } }
  return body.data.accessToken
}

